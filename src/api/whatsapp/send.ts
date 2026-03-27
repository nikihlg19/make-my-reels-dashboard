/**
 * POST /api/whatsapp/send
 * Auth: Clerk JWT or CRON_SECRET
 *
 * Generic helper to send any WhatsApp template message and log it.
 *
 * Body: {
 *   phone: string,           // E.164 without leading +
 *   recipientType: 'team_member' | 'client',
 *   recipientId?: string,
 *   templateName: string,
 *   templateParams: Record<string, any>,
 *   messageType: string,
 *   relatedProjectId?: string,
 *   relatedAssignmentId?: string,
 * }
 */

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BSP_API_URL = process.env.WHATSAPP_BSP_API_URL || 'https://api.interakt.ai/v1/public/message/';
const BSP_API_KEY = process.env.WHATSAPP_BSP_API_KEY || '';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth: accept either CRON_SECRET or Clerk JWT
  const authHeader = req.headers.authorization || '';
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    try {
      const { createClerkClient } = await import('@clerk/backend');
      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
      await clerk.authenticateRequest(req, { secretKey: process.env.CLERK_SECRET_KEY });
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
    if (waRes.ok) {
      status = 'sent';
      waMessageId = data?.id || null;
    } else {
      errorMessage = data?.message || `HTTP ${waRes.status}`;
    }
  } catch (err: any) {
    errorMessage = err.message;
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
