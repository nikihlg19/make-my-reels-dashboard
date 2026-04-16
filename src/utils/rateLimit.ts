import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Simple Supabase-backed rate limiter.
 * Checks how many requests a user has made to a route within `windowSeconds`.
 * Returns true if the request should be allowed, false if rate-limited.
 *
 * Requires table:
 *   CREATE TABLE IF NOT EXISTS rate_limit_log (
 *     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *     user_id TEXT NOT NULL,
 *     route TEXT NOT NULL,
 *     created_at TIMESTAMPTZ DEFAULT now()
 *   );
 *   CREATE INDEX idx_rate_limit_lookup ON rate_limit_log (user_id, route, created_at);
 */
export async function checkRateLimit(
  userId: string,
  route: string,
  maxRequests: number,
  windowSeconds: number
): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();

  const { count } = await supabaseAdmin
    .from('rate_limit_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('route', route)
    .gte('created_at', windowStart);

  if ((count ?? 0) >= maxRequests) {
    return false;
  }

  // Log this request
  await supabaseAdmin.from('rate_limit_log').insert({
    user_id: userId,
    route,
  });

  return true;
}
