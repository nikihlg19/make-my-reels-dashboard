import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Base client (no auth) — used by server-side code and as a fallback.
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

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
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase credentials are not configured');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    async accessToken() {
      return session?.getToken() ?? null;
    },
  });
}
