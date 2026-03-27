/**
 * GET /api/assignment/respond
 *
 * URL-based accept/decline flow — no webhook needed.
 *
 * Query params:
 *   id     — assignment UUID
 *   action — "accept" or "decline"
 *   token  — response_token (UUID, single-use)
 *
 * Returns a self-contained HTML page so the team member sees instant feedback
 * in their browser when they tap the link from WhatsApp.
 *
 * Security:
 *   - Token is unique per assignment (gen_random_uuid), not guessable
 *   - Token is single-use: once assignment status leaves pending/wa_sent, replays are rejected
 *   - Auto-expire check: if assignment is past auto_expire_at, it's treated as expired
 */

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ---------------------------------------------------------------------------
// HTML response helpers
// ---------------------------------------------------------------------------

function htmlPage(title: string, emoji: string, heading: string, message: string, color: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title} — Make My Reels</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#f8fafc 0%,#e2e8f0 100%);padding:24px}
    .card{background:#fff;border-radius:24px;padding:48px 32px;max-width:420px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
    .emoji{font-size:64px;margin-bottom:16px}
    h1{font-size:22px;font-weight:800;color:${color};margin-bottom:8px;text-transform:uppercase;letter-spacing:-0.5px}
    p{font-size:15px;color:#64748b;line-height:1.6}
    .brand{margin-top:32px;font-size:11px;font-weight:700;color:#cbd5e1;text-transform:uppercase;letter-spacing:2px}
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">${emoji}</div>
    <h1>${heading}</h1>
    <p>${message}</p>
    <div class="brand">Make My Reels</div>
  </div>
</body>
</html>`;
}

function sendHtml(res: any, status: number, html: string) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).end(html);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return sendHtml(res, 405, htmlPage('Error', '🚫', 'Method Not Allowed', 'This link only works when tapped directly.', '#ef4444'));
  }

  const { id, action, token } = req.query || {};

  // --- Input validation ---
  if (!id || !token || !['accept', 'decline'].includes(action)) {
    return sendHtml(res, 400, htmlPage('Invalid Link', '🔗', 'Invalid Link', 'This link is malformed or incomplete. Please use the link from your WhatsApp message.', '#ef4444'));
  }

  // --- Fetch assignment by ID + token (both must match) ---
  const { data: assignment, error: fetchErr } = await supabaseAdmin
    .from('project_assignments')
    .select('id, status, project_id, team_member_id, role_needed, assignment_group_id, auto_expire_at, response_token')
    .eq('id', id)
    .single();

  if (fetchErr || !assignment) {
    return sendHtml(res, 404, htmlPage('Not Found', '🔍', 'Assignment Not Found', 'This assignment does not exist. The link may have been invalidated.', '#ef4444'));
  }

  // --- Token validation (timing-safe comparison) ---
  const crypto = await import('crypto');
  const tokenStr = String(token);
  const dbToken = String(assignment.response_token || '');
  const tokenMatch = dbToken.length > 0 &&
    tokenStr.length === dbToken.length &&
    crypto.timingSafeEqual(Buffer.from(tokenStr), Buffer.from(dbToken));

  if (!tokenMatch) {
    return sendHtml(res, 403, htmlPage('Invalid Token', '🔒', 'Invalid Token', 'This link is not valid. Please use the link from your WhatsApp message.', '#ef4444'));
  }

  // --- Check if already resolved (single-use) ---
  if (['accepted', 'declined', 'expired', 'cancelled'].includes(assignment.status)) {
    const statusMessages: Record<string, { emoji: string; heading: string; msg: string; color: string }> = {
      accepted:  { emoji: '✅', heading: 'Already Accepted',  msg: 'You have already accepted this assignment. See you at the shoot!',      color: '#10b981' },
      declined:  { emoji: '👋', heading: 'Already Declined',  msg: 'You have already declined this assignment. No further action needed.', color: '#6366f1' },
      expired:   { emoji: '⏰', heading: 'Link Expired',      msg: 'This assignment has expired. Please contact the admin for reassignment.', color: '#f59e0b' },
      cancelled: { emoji: '❌', heading: 'Assignment Cancelled', msg: 'This assignment was cancelled by the admin.',                       color: '#ef4444' },
    };
    const s = statusMessages[assignment.status]!;
    return sendHtml(res, 200, htmlPage(s.heading, s.emoji, s.heading, s.msg, s.color));
  }

  // --- Check expiry ---
  if (assignment.auto_expire_at && new Date(assignment.auto_expire_at) < new Date()) {
    await supabaseAdmin
      .from('project_assignments')
      .update({ status: 'expired' })
      .eq('id', assignment.id);

    return sendHtml(res, 200, htmlPage('Expired', '⏰', 'Link Expired', 'This assignment request has expired. Please contact the admin if you are still interested.', '#f59e0b'));
  }

  // --- Apply the action ---
  const newStatus = action === 'accept' ? 'accepted' : 'declined';
  await supabaseAdmin
    .from('project_assignments')
    .update({ status: newStatus, responded_at: new Date().toISOString() })
    .eq('id', assignment.id);

  // --- Fetch project + member details for notifications ---
  const [{ data: project }, { data: member }] = await Promise.all([
    supabaseAdmin.from('projects').select('title, location, event_date, event_time').eq('id', assignment.project_id).single(),
    supabaseAdmin.from('team_members').select('name, phone').eq('id', assignment.team_member_id).single(),
  ]);

  const memberName = member?.name || 'Team member';
  const projectTitle = project?.title || 'the project';

  // --- Log inbound response ---
  await supabaseAdmin.from('whatsapp_messages').insert({
    direction: 'inbound',
    recipient_phone: member?.phone || '',
    recipient_type: 'team_member',
    recipient_id: assignment.team_member_id,
    message_type: action === 'accept' ? 'assignment_accepted' : 'assignment_rejected',
    status: 'delivered',
    related_project_id: assignment.project_id,
    related_assignment_id: assignment.id,
  });

  // --- Notify admin(s) in-app ---
  const { data: prefs } = await supabaseAdmin
    .from('notification_preferences')
    .select('user_id');

  const adminUserIds = (prefs || []).map((p: any) => p.user_id);

  if (adminUserIds.length > 0) {
    const notifTitle = action === 'accept'
      ? `${memberName} accepted ${projectTitle}`
      : `${memberName} declined ${projectTitle}`;
    const notifMessage = action === 'accept'
      ? `${memberName} confirmed availability for ${projectTitle}.`
      : `${memberName} declined ${projectTitle}. Consider assigning a replacement.`;

    await supabaseAdmin.from('notifications').insert(
      adminUserIds.map((userId: string) => ({
        user_id: userId,
        project_id: assignment.project_id,
        type: action === 'accept' ? 'assignment_accepted' : 'assignment_declined',
        title: notifTitle,
        message: notifMessage,
        urgency: action === 'accept' ? 'medium' : 'high',
      }))
    );
  }

  // --- If declined: trigger auto-cascade to next ranked candidate ---
  if (action === 'decline' && assignment.assignment_group_id) {
    try {
      const { triggerAutoCascade } = await import('../../utils/autoCascade');
      await triggerAutoCascade(
        supabaseAdmin,
        assignment.project_id,
        assignment.role_needed,
        assignment.assignment_group_id,
      );
    } catch (err) {
      console.error('[respond] auto-cascade error:', err);
    }
  }

  // --- If accepted: send confirmation WhatsApp ---
  if (action === 'accept' && member?.phone && project) {
    try {
      const { sendAssignmentConfirmation } = await import('../../services/whatsapp');
      const { format, parseISO } = await import('date-fns');
      const shootDate = project.event_date
        ? format(parseISO(project.event_date), 'd MMM yyyy')
        : 'TBD';
      await sendAssignmentConfirmation({
        phone: member.phone,
        memberName,
        projectTitle: project.title,
        shootDate,
        shootTime: project.event_time || 'TBD',
        location: project.location || 'TBD',
        role: assignment.role_needed,
      });
    } catch (err) {
      console.error('[respond] confirmation WA error:', err);
    }
  }

  // --- Return confirmation HTML ---
  if (action === 'accept') {
    const shootInfo = project
      ? `<br><br><strong>${project.title}</strong><br>${project.event_date || ''} ${project.event_time ? 'at ' + project.event_time : ''}<br>${project.location || ''}`
      : '';
    return sendHtml(res, 200, htmlPage(
      'Accepted',
      '🎬',
      "You're In!",
      `Thanks ${memberName}! You have confirmed your availability for this shoot.${shootInfo}`,
      '#10b981',
    ));
  } else {
    return sendHtml(res, 200, htmlPage(
      'Declined',
      '👋',
      'Assignment Declined',
      `Thanks ${memberName}. We'll find someone else for this one. No worries!`,
      '#6366f1',
    ));
  }
}
