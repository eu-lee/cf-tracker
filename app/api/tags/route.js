import { NextResponse } from "next/server";
import { getSupabase } from "../../../lib/supabase";

export async function PATCH(req) {
  const { id, tags } = await req.json();
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const { error } = await getSupabase().from("problems").update({ tag_overrides: tags }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
