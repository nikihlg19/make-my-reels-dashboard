import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@clerk/backend';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! });
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { userId, endpoint, p256dh, auth, userAgent } = req.body || {};
  if (!userId || !endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: 'userId, endpoint, p256dh, and auth are required' });
  }

  const { error } = await supabaseAdmin.from('push_subscriptions').upsert(
    { user_id: userId, endpoint, p256dh, auth, user_agent: userAgent || '' },
    { onConflict: 'user_id, endpoint' }
  );

  if (error) {
    console.error('[subscribe-push] DB error:', error);
    return res.status(500).json({ error: 'Failed to save subscription' });
  }

  return res.status(200).json({ success: true });
}
