/**
 * POST /api/telegram/create-link
 * Generates a time-limited, single-use token for linking Telegram.
 * Returns the token so the frontend can build the deep link.
 * Requires Clerk authentication.
 */

import { createClient } from '@supabase/supabase-js';
import { createClerkClient } from '@clerk/backend';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify Clerk JWT
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let userId: string;
  try {
    const token = authHeader.replace('Bearer ', '');
    const payload = await clerk.verifyToken(token);
    userId = payload.sub;
    if (!userId) throw new Error('No sub in JWT');
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Generate a random UUID token with 10 minute expiry
  const linkToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

  const { error } = await supabaseAdmin
    .from('notification_preferences')
    .update({
      telegram_link_token: linkToken,
      telegram_link_expires: expiresAt,
    })
    .eq('user_id', userId);

  if (error) {
    console.error('[telegram/create-link] DB error:', error.code);
    return res.status(500).json({ error: 'Failed to create link' });
  }

  return res.status(200).json({ token: linkToken, expiresAt });
}
