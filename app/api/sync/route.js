import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { capitalize, isoDate, cfFetch } from "../../../lib/cf";
import { fetchQuestionMeta, fetchRecentAccepted } from "../../../lib/leetcode";

// CF allows large page sizes; walk the full submission history in batches
// (newest-first) until a short page signals the end.
const BATCH = 2000;
const LEETCODE_RECENT_LIMIT = 50;
const LEETCODE_BACKFILL_LIMIT = 1000;

async function fetchAllSubmissions(handle) {
  const all = [];
  let from = 1;
  for (;;) {
    const page = await cfFetch(
      `https://codeforces.com/api/user.status?handle=${handle}&from=${from}&count=${BATCH}`
    );
    all.push(...page);
    if (page.length < BATCH) break;
    from += BATCH;
  }
  return all;
}

async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function buildLeetcodeProblems(username, userId, limit = LEETCODE_RECENT_LIMIT) {
  const recent = await fetchRecentAccepted(username, limit);
  const bySlug = new Map();
  for (const sub of recent) {
    if (!bySlug.has(sub.titleSlug)) bySlug.set(sub.titleSlug, sub);
  }

  const rows = await mapWithConcurrency([...bySlug.values()], 6, async (sub) => {
    const meta = await fetchQuestionMeta(sub.titleSlug).catch(() => null);
    const title = meta?.title ?? sub.title;
    const slug = meta?.titleSlug ?? sub.titleSlug;
    const tags = (meta?.tags ?? []).filter((tag) => tag && tag !== slug && tag !== title);
    return {
      user_id: userId,
      id: `lc-${slug}`,
      platform: "leetcode",
      contest_id: 0,
      problem_index: meta?.questionId ? String(meta.questionId) : slug,
      name: title,
      rating: null,
      lc_difficulty: meta?.difficulty ?? null,
      problem_url: `https://leetcode.com/problems/${slug}/`,
      tags,
      solved_at: isoDate(sub.timestamp),
      solved_at_ts: sub.timestamp * 1000,
      attempts: 1,
      is_custom: false,
    };
  });
  return rows.filter(Boolean);
}

export async function POST(req) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const requestedPlatforms = Array.isArray(body.platforms)
    ? new Set(body.platforms.map(String))
    : null;
  const syncCodeforces = !requestedPlatforms || requestedPlatforms.has("codeforces");
  const syncLeetcode = !requestedPlatforms || requestedPlatforms.has("leetcode");
  const lcLimitRaw = Number(body.leetcodeLimit);
  const lcLimit = Number.isFinite(lcLimitRaw) && lcLimitRaw > 0
    ? Math.min(1000, Math.round(lcLimitRaw))
    : requestedPlatforms?.has("leetcode") ? LEETCODE_BACKFILL_LIMIT : LEETCODE_RECENT_LIMIT;

  // Handles come from the caller's profile, not env vars.
  const { data: profile } = await supabase
    .from("profiles")
    .select("handle, leetcode_username")
    .eq("id", user.id)
    .single();
  const handle = profile?.handle;
  const leetcodeUsername = profile?.leetcode_username;
  if (!handle && !leetcodeUsername) {
    return NextResponse.json({ error: "no Codeforces handle or LeetCode username set" }, { status: 400 });
  }

  let stats = null;
  let ratingHistory = [];
  let cfProblems = [];
  let leetcodeProblems = [];

  if (handle && syncCodeforces) {
    let userResult, ratingResult, statusResult;
    try {
      [userResult, ratingResult, statusResult] = await Promise.all([
        cfFetch(`https://codeforces.com/api/user.info?handles=${handle}`),
        cfFetch(`https://codeforces.com/api/user.rating?handle=${handle}`),
        fetchAllSubmissions(handle),
      ]);
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }

    // --- user stats ---
    const u = userResult[0];
    stats = {
      rating: u.rating ?? 0,
      max_rating: u.maxRating ?? 0,
      rank: capitalize(u.rank ?? ""),
      max_rank: capitalize(u.maxRank ?? ""),
      contribution: u.contribution ?? 0,
      friends: u.friendOfCount ?? 0,
      registered: isoDate(u.registrationTimeSeconds),
    };

    ratingHistory = ratingResult.map((entry) => ({
      c: entry.contestName,
      date: isoDate(entry.ratingUpdateTimeSeconds),
      rating: entry.newRating,
      delta: entry.newRating - entry.oldRating,
    }));

    // --- Codeforces problems ---
    const byProblem = new Map();
    for (const sub of statusResult) {
      const key = `${sub.contestId}${sub.problem.index}`;
      if (!byProblem.has(key)) byProblem.set(key, []);
      byProblem.get(key).push(sub);
    }

    for (const [key, subs] of byProblem) {
      const sorted = subs.slice().sort((a, b) => a.id - b.id);
      const acIdx = sorted.findIndex((s) => s.verdict === "OK");
      if (acIdx === -1) continue;

      const acSub = sorted[acIdx];
      const { problem } = acSub;
      cfProblems.push({
        user_id: user.id,
        id: key,
        platform: "codeforces",
        contest_id: acSub.contestId,
        problem_index: problem.index,
        name: problem.name,
        rating: problem.rating ?? null,
        lc_difficulty: null,
        problem_url: `https://codeforces.com/problemset/problem/${acSub.contestId}/${problem.index}`,
        tags: problem.tags ?? [],
        solved_at: isoDate(acSub.creationTimeSeconds),
        solved_at_ts: acSub.creationTimeSeconds * 1000,
        attempts: acIdx + 1,
        is_custom: false,
      });
    }
  }

  if (leetcodeUsername && syncLeetcode) {
    try {
      leetcodeProblems = await buildLeetcodeProblems(leetcodeUsername, user.id, lcLimit);
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
  }

  // --- persist (RLS scopes both writes to this user) ---
  const problems = [...cfProblems, ...leetcodeProblems];
  const [profileErr, problemsErr] = await Promise.all([
    stats
      ? supabase
          .from("profiles")
          .update({ ...stats, handle, rating_history: ratingHistory })
          .eq("id", user.id)
          .then(({ error }) => error)
      : Promise.resolve(null),
    problems.length
      ? supabase
          .from("problems")
          .upsert(problems, { onConflict: "user_id,id", ignoreDuplicates: false })
          .then(({ error }) => error)
      : Promise.resolve(null),
  ]);

  if (profileErr) console.error("update profile:", profileErr.message);
  if (problemsErr) console.error("upsert problems:", problemsErr.message);

  return NextResponse.json({
    user: stats ? {
      handle,
      rating: stats.rating,
      maxRating: stats.max_rating,
      rank: stats.rank,
      maxRank: stats.max_rank,
      contribution: stats.contribution,
      friends: stats.friends,
      registered: stats.registered,
    } : null,
    ratingHistory: stats ? ratingHistory : undefined,
    problems: problems.map((p) => ({
      id: p.id,
      platform: p.platform,
      contestId: p.contest_id,
      index: p.problem_index,
      name: p.name,
      rating: p.rating,
      lcDifficulty: p.lc_difficulty,
      url: p.problem_url,
      tags: p.tags,
      solvedAt: p.solved_at,
      solvedAtTs: p.solved_at_ts,
      attempts: p.attempts,
      isCustom: p.is_custom ?? false,
    })),
    leetcodeUsername,
    imported: {
      codeforces: cfProblems.length,
      leetcode: leetcodeProblems.length,
      leetcodeLimit: lcLimit,
    },
  });
}
