import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

export async function PATCH(req) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { radarFilter } = await req.json();
  const { error } = await supabase
    .from("profiles")
    .update({ radar_filter: radarFilter ?? null })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
