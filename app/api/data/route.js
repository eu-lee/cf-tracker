import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: profileData, error: profileErr }, { data: problemsData, error: problemsErr }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("problems").select("*").eq("user_id", user.id).order("solved_at_ts", { ascending: false }),
    ]);

  if (profileErr && profileErr.code !== "PGRST116") {
    // PGRST116 = no rows found
    console.error("fetch profile:", profileErr.message);
  }
  if (problemsErr) console.error("fetch problems:", problemsErr.message);

  const handle = profileData?.handle ?? null;

  // Only expose CF stats once a handle is set and synced.
  const cfUser = handle
    ? {
        handle,
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
  const radarShowRating = profileData?.radar_show_rating ?? false;

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
    isCustom: p.is_custom ?? false,
    description: p.description ?? null,
    images: p.images ?? [],
  }));

  return NextResponse.json({ handle, user: cfUser, ratingHistory, problems, radarFilter, radarShowRating });
}
