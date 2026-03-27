/**
 * POST /api/whatsapp/webhook   — receives Accept / Reject button clicks from Interakt
 * GET  /api/whatsapp/webhook   — webhook verification handshake (Meta / Interakt)
 *
 * Security: HMAC-SHA256 signature verification via WHATSAPP_WEBHOOK_SECRET
 */

import { createClient } from '@supabase/supabase-js';
import { parseButtonReply, verifyWebhookSignature, sendAssignmentConfirmation } from '../../services/whatsapp';
import { triggerAutoCascade } from '../../utils/autoCascade';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Vercel serverless functions need the raw body for HMAC verification.
// We collect it manually when it's a POST.
export const config = { api: { bodyParser: false } };

async function getRawBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => (data += chunk.toString()));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req: any, res: any) {
  // ---- GET: verification handshake ----
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Verification failed' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ---- POST: receive inbound message ----
  const rawBody = await getRawBody(req);
  const signature = req.headers['x-hub-signature-256'] || '';

  if (!verifyWebhookSignature(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Log raw inbound message for debugging
  console.log('[webhook] inbound:', JSON.stringify(body).slice(0, 500));

  const reply = parseButtonReply(body);
  if (!reply) {
    // Not a button reply we care about — acknowledge and move on
    return res.status(200).json({ received: true });
  }

  const { assignmentId, action, phone } = reply;

  // --- Fetch assignment ---
  const { data: assignment, error: fetchErr } = await supabaseAdmin
    .from('project_assignments')
    .select('id, status, project_id, team_member_id, role_needed')
    .eq('id', assignmentId)
    .single();

  if (fetchErr || !assignment) {
    console.error('[webhook] assignment not found:', assignmentId);
    return res.status(200).json({ received: true }); // always 200 to BSP
  }

  // Ignore duplicate callbacks
  if (['accepted', 'declined', 'expired', 'cancelled'].includes(assignment.status)) {
    return res.status(200).json({ received: true, skipped: 'already_resolved' });
  }

  const newStatus = action === 'accept' ? 'accepted' : 'declined';
  await supabaseAdmin
    .from('project_assignments')
    .update({ status: newStatus, responded_at: new Date().toISOString() })
    .eq('id', assignmentId);

  // Log inbound message
  await supabaseAdmin.from('whatsapp_messages').insert({
    direction: 'inbound',
    recipient_phone: phone,
    recipient_type: 'team_member',
    recipient_id: assignment.team_member_id,
    message_type: action === 'accept' ? 'assignment_accepted' : 'assignment_rejected',
    status: 'delivered',
    related_project_id: assignment.project_id,
    related_assignment_id: assignmentId,
  });

  // Notify admin in-app
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('title')
    .eq('id', assignment.project_id)
    .single();

  const { data: member } = await supabaseAdmin
    .from('team_members')
    .select('name, phone')
    .eq('id', assignment.team_member_id)
    .single();

  const memberName = member?.name || 'Team member';
  const projectTitle = project?.title || 'the project';

  // Fetch all admin user IDs from notification_preferences (or use a fixed admin ID)
  const { data: prefs } = await supabaseAdmin
    .from('notification_preferences')
    .select('user_id');

  const adminUserIds = prefs?.map(p => p.user_id) || [];

  if (adminUserIds.length > 0) {
    const notifTitle = action === 'accept'
      ? `${memberName} accepted ${projectTitle}`
      : `${memberName} declined ${projectTitle}`;
    const notifMessage = action === 'accept'
      ? `${memberName} confirmed availability for ${projectTitle}.`
      : `${memberName} declined ${projectTitle}. Consider assigning a replacement.`;

    await supabaseAdmin.from('notifications').insert(
      adminUserIds.map(userId => ({
        user_id: userId,
        project_id: assignment.project_id,
        type: action === 'accept' ? 'assignment_accepted' : 'assignment_declined',
        title: notifTitle,
        message: notifMessage,
        urgency: action === 'accept' ? 'medium' : 'high',
      }))
    );
  }

  // If declined: trigger auto-cascade to next ranked candidate
  if (action === 'reject' && assignment.assignment_group_id) {
    await triggerAutoCascade(
      supabaseAdmin,
      assignment.project_id,
      assignment.role_needed,
      assignment.assignment_group_id,
    );
  }

  // If accepted: send confirmation WhatsApp to member
  if (action === 'accept' && member?.phone && project?.title) {
    const { data: fullProject } = await supabaseAdmin
      .from('projects')
      .select('title, location, event_date, event_time')
      .eq('id', assignment.project_id)
      .single();

    if (fullProject) {
      const { format, parseISO } = await import('date-fns');
      const shootDate = fullProject.event_date
        ? format(parseISO(fullProject.event_date), 'd MMM yyyy')
        : 'TBD';
      await sendAssignmentConfirmation({
        phone: member.phone,
        memberName,
        projectTitle: fullProject.title,
        shootDate,
        shootTime: fullProject.event_time || 'TBD',
        location: fullProject.location || 'TBD',
        role: assignment.role_needed,
      });
    }
  }

  return res.status(200).json({ received: true, action, assignmentId });
}
