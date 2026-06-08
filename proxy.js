import { updateSession } from "./lib/supabase/middleware";

// Next.js 16 "proxy" convention (replaces the old middleware.js). Refreshes the
// Supabase auth session cookie on every matched request.
export async function proxy(request) {
  return await updateSession(request);
}

export const config = {
  // Run on everything except static assets and image files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
