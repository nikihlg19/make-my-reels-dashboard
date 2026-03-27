/**
 * /api/team/availability
 * GET  — list unavailability windows (optionally filter by ?memberId=)
 * POST — create a new blocked date range
 * DELETE — delete a window by ?id=
 * Auth: Clerk JWT
 */

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  // GET: any authenticated user. POST/DELETE: admin only.
  if (req.method === 'GET') {
    const { verifyAuth } = await import('../../utils/apiAuth');
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
  } else if (req.method === 'POST' || req.method === 'DELETE') {
    const { verifyAdmin } = await import('../../utils/apiAuth');
    const admin = await verifyAdmin(req);
    if (!admin) return res.status(403).json({ error: 'Forbidden: admin access required' });
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.method === 'GET') {
    const memberId = req.query.memberId;
    let query = supabaseAdmin.from('team_availability').select('*').order('unavailable_from');
    if (memberId) query = query.eq('team_member_id', memberId);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: 'Failed to fetch availability' });
    return res.status(200).json(data || []);
  }

  if (req.method === 'POST') {
    const { teamMemberId, unavailableFrom, unavailableTo, reason } = req.body || {};
    if (!teamMemberId || !unavailableFrom || !unavailableTo) {
      return res.status(400).json({ error: 'teamMemberId, unavailableFrom, unavailableTo required' });
    }
    const { data, error } = await supabaseAdmin
      .from('team_availability')
      .insert({ team_member_id: teamMemberId, unavailable_from: unavailableFrom, unavailable_to: unavailableTo, reason: reason || null })
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'Failed to create availability record' });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id is required' });
    const { error } = await supabaseAdmin.from('team_availability').delete().eq('id', id);
    if (error) return res.status(500).json({ error: 'Failed to delete availability record' });
    return res.status(200).json({ success: true });
  }
}
