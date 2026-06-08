import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

// Google redirects here with ?code=... after the user authorizes. We exchange
// it for a session (which sets the auth cookies) and send them to the app.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth`);
}
