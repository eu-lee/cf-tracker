import { NextResponse } from "next/server";

const CF_HANDLE = process.env.CF_HANDLE ?? "jjelloo";
const FETCH_COUNT = 50;

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isoDate(seconds) {
  return new Date(seconds * 1000).toISOString().split("T")[0];
}

async function cfFetch(url) {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (json.status !== "OK") throw new Error(json.comment ?? "CF API error");
  return json.result;
}

export async function POST() {
  let userResult, ratingResult, statusResult;
  try {
    [userResult, ratingResult, statusResult] = await Promise.all([
      cfFetch(`https://codeforces.com/api/user.info?handles=${CF_HANDLE}`),
      cfFetch(`https://codeforces.com/api/user.rating?handle=${CF_HANDLE}`),
      cfFetch(`https://codeforces.com/api/user.status?handle=${CF_HANDLE}&from=1&count=${FETCH_COUNT}`),
    ]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }

  // --- user info ---
  const u = userResult[0];
  const user = {
    handle: u.handle,
    rating: u.rating ?? 0,
    maxRating: u.maxRating ?? 0,
    rank: capitalize(u.rank ?? ""),
    maxRank: capitalize(u.maxRank ?? ""),
    contribution: u.contribution ?? 0,
    friends: u.friendOfCount ?? 0,
    registered: isoDate(u.registrationTimeSeconds),
  };

  // --- rating history ---
  const ratingHistory = ratingResult.map((entry) => ({
    c: entry.contestName,
    date: isoDate(entry.ratingUpdateTimeSeconds),
    rating: entry.newRating,
    delta: entry.newRating - entry.oldRating,
  }));

  // --- problems: group by problem key, find first AC, count attempts ---
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
      id: key,
      contestId: acSub.contestId,
      index: problem.index,
      name: problem.name,
      rating: problem.rating ?? null,
      tags: problem.tags ?? [],
      solvedAt: isoDate(acSub.creationTimeSeconds),
      solvedAtTs: acSub.creationTimeSeconds * 1000,
      attempts: acIdx + 1,
    });
  }

  return NextResponse.json({ user, ratingHistory, problems });
}
