import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { verifyLeetcodeUsername } from "../../../lib/leetcode";

export async function POST(req) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { username: raw } = await req.json();
  const username = (raw ?? "").trim();
  if (!username) return NextResponse.json({ error: "missing username" }, { status: 400 });

  let canonical = username;
  try {
    canonical = await verifyLeetcodeUsername(username);
  } catch {
    return NextResponse.json({ error: `LeetCode user "${username}" not found` }, { status: 404 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ leetcode_username: canonical })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, username: canonical });
}
