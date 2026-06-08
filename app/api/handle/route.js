import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { cfFetch } from "../../../lib/cf";

// Sets the caller's Codeforces handle after validating it exists on CF.
export async function POST(req) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { handle: raw } = await req.json();
  const handle = (raw ?? "").trim();
  if (!handle) return NextResponse.json({ error: "missing handle" }, { status: 400 });

  // Validate against the CF API; canonicalize to CF's casing.
  let canonical = handle;
  try {
    const result = await cfFetch(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`);
    canonical = result[0]?.handle ?? handle;
  } catch {
    return NextResponse.json({ error: `Codeforces handle "${handle}" not found` }, { status: 404 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ handle: canonical })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, handle: canonical });
}
