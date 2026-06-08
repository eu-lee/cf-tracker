import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client for client components (sign-in button, session
// subscription). Safe to share a single instance across the app.
let _client;
export function createClient() {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return _client;
}
