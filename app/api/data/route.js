import { NextResponse } from "next/server";
import { getSupabase } from "../../../lib/supabase";

const CF_HANDLE = process.env.CF_HANDLE ?? "jjelloo";

export async function GET() {
  const [{ data: profileData, error: profileErr }, { data: problemsData, error: problemsErr }] =
    await Promise.all([
      getSupabase().from("user_profiles").select("*").eq("handle", CF_HANDLE).single(),
      getSupabase().from("problems").select("*").eq("handle", CF_HANDLE).order("solved_at_ts", { ascending: false }),
    ]);

  if (profileErr && profileErr.code !== "PGRST116") {
    // PGRST116 = no rows found (not yet synced)
    console.error("fetch user_profiles:", profileErr.message);
  }
  if (problemsErr) console.error("fetch problems:", problemsErr.message);

  const user = profileData
    ? {
        handle: profileData.handle,
        rating: profileData.rating,
        maxRating: profileData.max_rating,
        rank: profileData.rank,
        maxRank: profileData.max_rank,
        contribution: profileData.contribution,
        friends: profileData.friends,
        registered: profileData.registered,
      }
    : null;

  const ratingHistory = profileData?.rating_history ?? [];
  const radarFilter = profileData?.radar_filter ?? null;

  const problems = (problemsData ?? []).map((p) => ({
    id: p.id,
    contestId: p.contest_id,
    index: p.problem_index,
    name: p.name,
    rating: p.rating,
    tags: p.tags ?? [],
    solvedAt: p.solved_at,
    solvedAtTs: p.solved_at_ts,
    attempts: p.attempts,
    note: p.note ?? null,
    tagOverride: p.tag_overrides ?? null,
  }));

  return NextResponse.json({ user, ratingHistory, problems, radarFilter });
}
