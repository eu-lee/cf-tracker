import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Google redirects here with ?code=... after the user authorizes. We exchange
// it for a session (which sets the auth cookies) and send them to the app.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    // The code exchange creates the session cookies. They must be added to the
    // redirect response itself; mutating `cookies()` alone does not attach them
    // to this response, so the browser appeared signed out after OAuth.
    const response = NextResponse.redirect(`${origin}${next}`);
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth`);
}
