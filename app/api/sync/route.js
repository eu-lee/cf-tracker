import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { capitalize, isoDate, cfFetch } from "../../../lib/cf";

// CF allows large page sizes; walk the full submission history in batches
// (newest-first) until a short page signals the end.
const BATCH = 2000;

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

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Handle comes from the caller's profile, not an env var.
  const { data: profile } = await supabase
    .from("profiles")
    .select("handle")
    .eq("id", user.id)
    .single();
  const handle = profile?.handle;
  if (!handle) return NextResponse.json({ error: "no handle set" }, { status: 400 });

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
  const stats = {
    rating: u.rating ?? 0,
    max_rating: u.maxRating ?? 0,
    rank: capitalize(u.rank ?? ""),
    max_rank: capitalize(u.maxRank ?? ""),
    contribution: u.contribution ?? 0,
    friends: u.friendOfCount ?? 0,
    registered: isoDate(u.registrationTimeSeconds),
  };

  const ratingHistory = ratingResult.map((entry) => ({
    c: entry.contestName,
    date: isoDate(entry.ratingUpdateTimeSeconds),
    rating: entry.newRating,
    delta: entry.newRating - entry.oldRating,
  }));

  // --- problems ---
  const byProblem = new Map();
  for (const sub of statusResult) {
    const key = `${sub.contestId}${sub.problem.index}`;
    if (!byProblem.has(key)) byProblem.set(key, []);
    byProblem.get(key).push(sub);
  }

  const problems = [];
  for (const [key, subs] of byProblem) {
    const sorted = subs.slice().sort((a, b) => a.id - b.id);
    const acIdx = sorted.findIndex((s) => s.verdict === "OK");
    if (acIdx === -1) continue;

    const acSub = sorted[acIdx];
    const { problem } = acSub;
    problems.push({
      user_id: user.id,
      id: key,
      contest_id: acSub.contestId,
      problem_index: problem.index,
      name: problem.name,
      rating: problem.rating ?? null,
      tags: problem.tags ?? [],
      solved_at: isoDate(acSub.creationTimeSeconds),
      solved_at_ts: acSub.creationTimeSeconds * 1000,
      attempts: acIdx + 1,
    });
  }

  // --- persist (RLS scopes both writes to this user) ---
  const [profileErr, problemsErr] = await Promise.all([
    supabase
      .from("profiles")
      .update({ ...stats, handle, rating_history: ratingHistory })
      .eq("id", user.id)
      .then(({ error }) => error),
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
    user: {
      handle,
      rating: stats.rating,
      maxRating: stats.max_rating,
      rank: stats.rank,
      maxRank: stats.max_rank,
      contribution: stats.contribution,
      friends: stats.friends,
      registered: stats.registered,
    },
    ratingHistory,
    problems: problems.map((p) => ({
      id: p.id,
      contestId: p.contest_id,
      index: p.problem_index,
      name: p.name,
      rating: p.rating,
      tags: p.tags,
      solvedAt: p.solved_at,
      solvedAtTs: p.solved_at_ts,
      attempts: p.attempts,
    })),
  });
}
