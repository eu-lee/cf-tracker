import { NextResponse } from "next/server";
import { getSupabase } from "../../../lib/supabase";

const CF_HANDLE = process.env.CF_HANDLE ?? "jjelloo";

export async function PATCH(req) {
  const { radarFilter } = await req.json();
  const { error } = await getSupabase()
    .from("user_profiles")
    .update({ radar_filter: radarFilter ?? null })
    .eq("handle", CF_HANDLE);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
