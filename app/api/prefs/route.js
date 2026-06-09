import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

export async function PATCH(req) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const updates = {};
  if (Object.hasOwn(body, "radarFilter")) updates.radar_filter = body.radarFilter ?? null;
  if (Object.hasOwn(body, "radarShowRating")) updates.radar_show_rating = Boolean(body.radarShowRating);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No preferences provided" }, { status: 400 });
  }

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
