import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Base client (no auth) — used by hooks that don't need RLS.
// Throws at startup if env vars are missing (app can't work without Supabase).
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set');
}
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Create a Supabase client using the native Clerk integration.
 * Automatically injects the Clerk session token so RLS policies
 * can identify the user via `auth.jwt()->>'sub'`.
 *
 * Usage (inside a React component):
 *   const { session } = useSession();           // from @clerk/clerk-react
 *   const client = createClerkSupabaseClient(session);
 *   const { data } = await client.from('projects').select('*');
 */
export function createClerkSupabaseClient(
  session: { getToken: () => Promise<string | null> } | null | undefined,
): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    async accessToken() {
      return session?.getToken() ?? null;
    },
  });
}
