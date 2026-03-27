/**
 * POST /api/assignment/cancel
 * Auth: Clerk JWT (admin only)
 *
 * Cancels a pending or wa_sent assignment.
 *
 * Body: { assignmentId }
 */

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { verifyAdmin } = await import('../../utils/apiAuth');
  const admin = await verifyAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Forbidden: admin access required' });

  const { assignmentId } = req.body || {};
  if (!assignmentId) return res.status(400).json({ error: 'assignmentId is required' });

  const { data: assignment, error: fetchErr } = await supabaseAdmin
    .from('project_assignments')
    .select('id, status')
    .eq('id', assignmentId)
    .single();

  if (fetchErr || !assignment) return res.status(404).json({ error: 'Assignment not found' });

  if (!['pending', 'wa_sent'].includes(assignment.status)) {
    return res.status(400).json({ error: `Cannot cancel assignment in status: ${assignment.status}` });
  }

  const { error: updateErr } = await supabaseAdmin
    .from('project_assignments')
    .update({ status: 'cancelled' })
    .eq('id', assignmentId);

  if (updateErr) return res.status(500).json({ error: 'Failed to cancel assignment' });

  return res.status(200).json({ success: true });
}
