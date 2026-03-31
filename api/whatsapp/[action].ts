/**
 * Vercel catch-all for /api/whatsapp/* routes.
 * All utility code inlined — no local file imports (Vercel does not bundle src/).
 */

import { createClient } from '@supabase/supabase-js';
import { format, parseISO, addHours } from 'date-fns';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── WhatsApp BSP ─────────────────────────────────────────────────────────────
function parseLocationAddress(raw: string): string {
  if (!raw) return 'TBD';
  try { const p = JSON.parse(raw); return p?.address || p?.mainText || raw; } catch { return raw; }
}

const BSP_API_URL = 'https://api.interakt.ai/v1/public/message/';
const BSP_API_KEY = process.env.WHATSAPP_BSP_API_KEY || '';

async function sendWaTemplate(params: {
  phone: string;
  templateName: string;
  bodyValues: string[];
  callbackData: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const payload = {
    countryCode: '+91',
    phoneNumber: params.phone.replace(/^\+?91/, ''),
    callbackData: params.callbackData,
    type: 'Template',
    template: {
      name: params.templateName,
      languageCode: 'en',
      bodyValues: params.bodyValues,
    },
  };

  console.log('[sendWaTemplate] payload:', JSON.stringify(payload));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(BSP_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${BSP_API_KEY}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await res.json();
    console.log('[sendWaTemplate] interakt status:', res.status, JSON.stringify(data));
    if (!res.ok) return { success: false, error: data?.message || `HTTP ${res.status}` };
    return { success: true, messageId: data?.id || data?.messageId };
  } catch (err: any) {
    return { success: false, error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function sendAssignmentRequest(params: {
  phone: string; memberName: string; projectTitle: string; shootDate: string;
  shootTime: string; location: string; role: string; assignmentId: string;
  acceptUrl: string; declineUrl: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!BSP_API_KEY) return { success: false, error: 'WhatsApp BSP not configured' };
  return sendWaTemplate({
    phone: params.phone,
    templateName: 'assignment_request_v2',
    callbackData: `assignment:${params.assignmentId}`,
    bodyValues: [
      params.memberName, params.projectTitle, params.shootDate,
      params.shootTime, params.location, params.role,
      params.acceptUrl, params.declineUrl,
    ],
  });
}

async function sendAssignmentConfirmation(params: {
  phone: string; memberName: string; projectTitle: string;
  shootDate: string; shootTime: string; location: string; role: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!BSP_API_KEY) return { success: false, error: 'WhatsApp BSP not configured' };
  return sendWaTemplate({
    phone: params.phone,
    templateName: 'assignment_confirmed',
    callbackData: 'confirmation',
    bodyValues: [
      params.memberName, params.projectTitle, params.shootDate,
      params.shootTime, params.location, params.role,
    ],
  });
}

// ─── Webhook helpers ──────────────────────────────────────────────────────────
function verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!secret) {
    // No secret configured — allow all webhooks (log warning only)
    console.warn('[whatsapp] WHATSAPP_WEBHOOK_SECRET not set — accepting webhook without signature check');
    return true;
  }
  if (!signatureHeader) {
    console.warn('[whatsapp] No x-hub-signature-256 header present — accepting (no secret configured)');
    return true;
  }
  try {
    const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch { return false; }
}

function parseButtonReply(body: any): { assignmentId: string; action: 'accept' | 'reject'; phone: string; rawPayload: string } | null {
  try {
    // Log raw body for debugging
    console.log('[webhook] parseButtonReply raw body keys:', Object.keys(body || {}));

    // Format 1: Interakt webhook — body.messages array at root level
    const interaktMessages = body?.messages;
    if (Array.isArray(interaktMessages) && interaktMessages.length > 0) {
      const msg = interaktMessages[0];
      console.log('[webhook] Interakt msg type:', msg?.type, 'buttons:', JSON.stringify(msg?.button_reply || msg?.interactive));
      // Interakt sends button replies as type 'button' with button.payload or button.text
      const buttonPayload: string = msg?.button?.payload || msg?.button_reply?.id || msg?.interactive?.button_reply?.id || '';
      const phone: string = msg?.from || body?.contacts?.[0]?.wa_id || '';
      const match = buttonPayload.match(/^(accept|reject)_(.+)$/);
      if (match) return { action: match[1] as 'accept' | 'reject', assignmentId: match[2], phone, rawPayload: buttonPayload };
    }

    // Format 2: Interakt — body.data.messages
    const interaktData = body?.data?.messages;
    if (Array.isArray(interaktData) && interaktData.length > 0) {
      const msg = interaktData[0];
      const buttonPayload: string = msg?.button?.payload || msg?.button_reply?.id || msg?.interactive?.button_reply?.id || '';
      const phone: string = msg?.from || '';
      const match = buttonPayload.match(/^(accept|reject)_(.+)$/);
      if (match) return { action: match[1] as 'accept' | 'reject', assignmentId: match[2], phone, rawPayload: buttonPayload };
    }

    // Format 3: Meta Cloud API format — body.entry[0].changes[0].value.messages
    const metaMessages = body?.entry?.[0]?.changes?.[0]?.value?.messages;
    if (Array.isArray(metaMessages) && metaMessages.length > 0) {
      const msg = metaMessages[0];
      const replyId: string = msg?.interactive?.button_reply?.id || msg?.button?.payload || '';
      const match = replyId.match(/^(accept|reject)_(.+)$/);
      if (match) return { action: match[1] as 'accept' | 'reject', assignmentId: match[2], phone: msg?.from || '', rawPayload: replyId };
    }

    console.log('[webhook] No matching button reply format found. Full body:', JSON.stringify(body).slice(0, 1000));
    return null;
  } catch (e: any) {
    console.error('[webhook] parseButtonReply error:', e.message);
    return null;
  }
}

async function getRawBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => (data += chunk.toString()));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// ─── Auto-cascade ─────────────────────────────────────────────────────────────
function buildRespondUrl(_assignmentId: string, action: 'accept' | 'decline', token: string): string {
  const APP_URL = process.env.VITE_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173');
  return `${APP_URL}/api/assignment/respond?t=${encodeURIComponent(token)}&r=${action}`;
}

async function triggerAutoCascade(
  supabase: any,
  projectId: string,
  roleNeeded: string,
  assignmentGroupId: string,
): Promise<{ cascaded: boolean }> {
  const { data: next } = await supabase
    .from('assignment_candidates')
    .select('*, team_members(id, name, phone)')
    .eq('assignment_group_id', assignmentGroupId)
    .eq('was_attempted', false)
    .eq('is_available', true)
    .order('rank_position', { ascending: true })
    .limit(1)
    .single();

  if (!next) {
    const { data: prefs } = await supabase.from('notification_preferences').select('user_id');
    const adminIds = (prefs || []).map((p: any) => p.user_id);
    const { data: project } = await supabase.from('projects').select('title').eq('id', projectId).single();
    if (adminIds.length > 0) {
      await supabase.from('notifications').insert(
        adminIds.map((userId: string) => ({
          user_id: userId,
          project_id: projectId,
          type: 'assignment_exhausted',
          title: `No candidates left for ${project?.title || 'a project'}`,
          message: `All ranked ${roleNeeded}s have declined or not responded for "${project?.title}". Consider changing the date or adding new team members.`,
          urgency: 'high',
        }))
      );
    }
    return { cascaded: false };
  }

  const member = next.team_members;
  if (!member?.phone) return { cascaded: false };

  await supabase.from('assignment_candidates').update({ was_attempted: true }).eq('id', next.id);

  const { data: project } = await supabase
    .from('projects')
    .select('title, location, event_date, event_time')
    .eq('id', projectId)
    .single();

  if (!project) return { cascaded: false };

  const expireHours = Number(process.env.ASSIGNMENT_TIMEOUT_HOURS) || 4;
  const autoExpireAt = addHours(new Date(), expireHours).toISOString();

  const { data: newAssignment } = await supabase
    .from('project_assignments')
    .insert({
      project_id: projectId,
      team_member_id: member.id,
      role_needed: roleNeeded,
      status: 'pending',
      attempt_number: next.rank_position,
      assignment_group_id: assignmentGroupId,
      auto_expire_at: autoExpireAt,
      created_by: 'system',
    })
    .select('id, response_token')
    .single();

  if (!newAssignment) return { cascaded: false };

  const acceptUrl = buildRespondUrl(newAssignment.id, 'accept', newAssignment.response_token);
  const declineUrl = buildRespondUrl(newAssignment.id, 'decline', newAssignment.response_token);
  const shootDate = project.event_date ? format(parseISO(project.event_date), 'd MMM yyyy') : 'TBD';

  const waResult = await sendAssignmentRequest({
    phone: member.phone,
    memberName: member.name,
    projectTitle: project.title,
    shootDate,
    shootTime: project.event_time || 'TBD',
    location: parseLocationAddress(project.location),
    role: roleNeeded,
    assignmentId: newAssignment.id,
    acceptUrl,
    declineUrl,
  });

  await supabase
    .from('project_assignments')
    .update({
      status: waResult.success ? 'wa_sent' : 'pending',
      whatsapp_message_id: waResult.messageId || null,
      sent_at: waResult.success ? new Date().toISOString() : null,
    })
    .eq('id', newAssignment.id);

  const { data: prefs } = await supabase.from('notification_preferences').select('user_id');
  const adminIds = (prefs || []).map((p: any) => p.user_id);
  if (adminIds.length > 0) {
    await supabase.from('notifications').insert(
      adminIds.map((userId: string) => ({
        user_id: userId,
        project_id: projectId,
        type: 'assignment_cascaded',
        title: `Auto-sent to ${member.name} (rank #${next.rank_position})`,
        message: `Previous candidate declined/expired. Auto-sent request to ${member.name} (score: ${next.score}) for "${project.title}".`,
        urgency: 'medium',
      }))
    );
  }

  return { cascaded: true };
}

// ─── /api/whatsapp/send ───────────────────────────────────────────────────────
async function handleSend(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    try {
      const { verifyToken } = await import('@clerk/backend');
      const token = authHeader.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Unauthorized' });
      await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! });
    } catch {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const {
    phone, recipientType, recipientId,
    templateName, templateParams,
    messageType, relatedProjectId, relatedAssignmentId,
  } = req.body || {};

  if (!phone || !templateName || !messageType) {
    return res.status(400).json({ error: 'phone, templateName, and messageType are required' });
  }

  if (!BSP_API_KEY) {
    return res.status(503).json({ error: 'WhatsApp BSP not configured' });
  }

  const payload = {
    countryCode: '+91',
    phoneNumber: phone.replace(/^\+?91/, ''),
    callbackData: messageType,
    type: 'Template',
    template: {
      name: templateName,
      languageCode: 'en',
      bodyValues: Object.values(templateParams || {}),
    },
  };

  let waMessageId: string | null = null;
  let status: 'sent' | 'failed' = 'failed';
  let errorMessage: string | null = null;

  try {
    const waRes = await fetch(BSP_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${BSP_API_KEY}` },
      body: JSON.stringify(payload),
    });
    const data = await waRes.json();
    console.log('[whatsapp/send] interakt status:', waRes.status, JSON.stringify(data));
    if (waRes.ok) {
      status = 'sent';
      waMessageId = data?.id || null;
    } else {
      errorMessage = data?.message || `HTTP ${waRes.status}`;
    }
  } catch (err: any) {
    errorMessage = err.message;
    console.error('[whatsapp/send] fetch error:', err.message);
  }

  await supabaseAdmin.from('whatsapp_messages').insert({
    direction: 'outbound',
    recipient_phone: phone,
    recipient_type: recipientType || 'team_member',
    recipient_id: recipientId || null,
    template_name: templateName,
    template_params: templateParams || {},
    message_type: messageType,
    whatsapp_message_id: waMessageId,
    status,
    error_message: errorMessage,
    related_project_id: relatedProjectId || null,
    related_assignment_id: relatedAssignmentId || null,
  });

  if (status === 'failed') {
    console.error('[whatsapp/send] failed:', errorMessage);
    return res.status(500).json({ error: 'WhatsApp send failed' });
  }

  return res.status(200).json({ success: true, messageId: waMessageId });
}

// ─── /api/whatsapp/webhook ────────────────────────────────────────────────────
async function handleWebhook(req: VercelRequest, res: VercelResponse) {
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

  const signature = (req.headers['x-hub-signature-256'] as string) || '';

  // If Vercel has already parsed the body (req.body is set), use it directly.
  // Otherwise read raw stream (needed when bodyParser is disabled).
  let body: any;
  let rawBody: string;
  if (req.body && typeof req.body === 'object') {
    // Body already parsed — stringify for signature check
    rawBody = JSON.stringify(req.body);
    body = req.body;
  } else {
    rawBody = await getRawBody(req);
    try {
      body = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
  }

  if (!verifyWebhookSignature(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  console.log('[webhook] inbound:', JSON.stringify(body).slice(0, 500));

  const reply = parseButtonReply(body);
  if (!reply) return res.status(200).json({ received: true });

  const { assignmentId, action, phone } = reply;

  const { data: assignment, error: fetchErr } = await supabaseAdmin
    .from('project_assignments')
    .select('id, status, project_id, team_member_id, role_needed, assignment_group_id')
    .eq('id', assignmentId)
    .single();

  if (fetchErr || !assignment) {
    console.error('[webhook] assignment not found:', assignmentId);
    return res.status(200).json({ received: true });
  }

  if (['accepted', 'declined', 'expired', 'cancelled'].includes(assignment.status)) {
    return res.status(200).json({ received: true, skipped: 'already_resolved' });
  }

  const newStatus = action === 'accept' ? 'accepted' : 'declined';
  await supabaseAdmin
    .from('project_assignments')
    .update({ status: newStatus, responded_at: new Date().toISOString() })
    .eq('id', assignmentId);

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

  const memberName = (member as any)?.name || 'Team member';
  const projectTitle = (project as any)?.title || 'the project';

  const { data: prefs } = await supabaseAdmin.from('notification_preferences').select('user_id');
  const adminUserIds = prefs?.map((p: any) => p.user_id) || [];

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

  if (action === 'reject' && assignment.assignment_group_id) {
    await triggerAutoCascade(supabaseAdmin, assignment.project_id, assignment.role_needed, assignment.assignment_group_id);
  }

  if (action === 'accept' && (member as any)?.phone && (project as any)?.title) {
    const { data: fullProject } = await supabaseAdmin
      .from('projects')
      .select('title, location, event_date, event_time')
      .eq('id', assignment.project_id)
      .single();

    if (fullProject) {
      const shootDate = (fullProject as any).event_date
        ? format(parseISO((fullProject as any).event_date), 'd MMM yyyy')
        : 'TBD';
      await sendAssignmentConfirmation({
        phone: (member as any).phone,
        memberName,
        projectTitle: (fullProject as any).title,
        shootDate,
        shootTime: (fullProject as any).event_time || 'TBD',
        location: (fullProject as any).location || 'TBD',
        role: assignment.role_needed,
      });
    }
  }

  return res.status(200).json({ received: true, action, assignmentId });
}

// ─── Router ───────────────────────────────────────────────────────────────────
const handlers: Record<string, (req: VercelRequest, res: VercelResponse) => Promise<any>> = {
  send: handleSend,
  webhook: handleWebhook,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;
  const fn = handlers[action];
  if (!fn) return res.status(404).json({ error: 'Not found' });
  try {
    return await fn(req, res);
  } catch (err: any) {
    console.error(`[whatsapp/${action}] unhandled error:`, err?.message || err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}
