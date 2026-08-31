import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    // Prefer the SERVER-ONLY service key when it exists, fall back to the public
    // anon key when it does not.
    //
    // Why: NEXT_PUBLIC_SUPABASE_ANON_KEY is shipped to every visitor's browser.
    // Verified 2026-08-31 that it currently reaches the tables — an INSERT into
    // news_items came back with `23502 null value in column`, a CONSTRAINT
    // error, meaning the write passed authorisation and only failed on a missing
    // field. Once RLS is switched on and anon is limited to SELECT, every
    // server-side write (the scan upsert, every cache write) needs a key that
    // is allowed to write, and that key must never be exposed to the client.
    // SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_ prefix, so Next.js never
    // bundles it into client JavaScript.
    //
    // Deliberately backwards compatible: with the variable unset this behaves
    // exactly as before, so this can ship safely BEFORE the key is added and
    // before RLS is enabled. Order matters — deploy, then add the key, then
    // enable RLS.
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    _supabase = createClient(supabaseUrl, key, {
      auth: { persistSession: false },
    });
  }
  return _supabase;
}

/** Which key the server actually picked up — surfaced by /api/feed-health so the
 *  switch can be confirmed without guessing. Never returns the key itself. */
export function supabaseKeyKind(): "service_role" | "anon" {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ? "service_role" : "anon";
}

/** @deprecated Use getSupabase() instead — kept for backward compat */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
