/**
 * WhatsApp BSP API Client — Interakt (official Meta BSP, India-focused)
 * Docs: https://dev.interakt.ai/reference
 *
 * Swap BSP_API_URL / payload shape here if you migrate to Wati, Aisensy, etc.
 */

const BSP_API_URL = process.env.WHATSAPP_BSP_API_URL || 'https://api.interakt.ai/v1/public/message/';
const BSP_API_KEY = process.env.WHATSAPP_BSP_API_KEY || '';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssignmentRequestParams {
  /** E.164 phone (without leading +, e.g. "919876543210") */
  phone: string;
  memberName: string;
  projectTitle: string;
  shootDate: string;
  shootTime: string;
  location: string;
  role: string;
  /** Assignment UUID — embedded in button payloads so the webhook can resolve it */
  assignmentId: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Send an assignment request with Accept / Reject quick-reply buttons
// ---------------------------------------------------------------------------

export async function sendAssignmentRequest(params: AssignmentRequestParams): Promise<SendResult> {
  if (!BSP_API_KEY) {
    console.warn('[whatsapp] WHATSAPP_BSP_API_KEY not set — skipping send');
    return { success: false, error: 'WhatsApp BSP not configured' };
  }

  const payload = {
    countryCode: '+91',
    phoneNumber: params.phone.replace(/^\+?91/, ''),
    callbackData: `assignment:${params.assignmentId}`,
    type: 'Template',
    template: {
      name: 'assignment_request',   // Must be pre-approved in Meta Business Manager
      languageCode: 'en',
      bodyValues: [
        params.memberName,
        params.projectTitle,
        params.shootDate,
        params.shootTime,
        params.location,
        params.role,
      ],
      // Button payloads encode action + assignmentId so the webhook can act on them
      buttonValues: {
        '0': [`accept_${params.assignmentId}`],
        '1': [`reject_${params.assignmentId}`],
      },
    },
  };

  try {
    const res = await fetch(BSP_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${BSP_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      const errMsg = data?.message || data?.error || `HTTP ${res.status}`;
      console.error('[whatsapp] sendAssignmentRequest failed:', errMsg);
      return { success: false, error: errMsg };
    }

    // Interakt returns { result: true, id: "..." }
    return { success: true, messageId: data?.id || data?.messageId };
  } catch (err: any) {
    console.error('[whatsapp] sendAssignmentRequest exception:', err);
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Send a confirmation message after acceptance
// ---------------------------------------------------------------------------

export async function sendAssignmentConfirmation(params: {
  phone: string;
  memberName: string;
  projectTitle: string;
  shootDate: string;
  shootTime: string;
  location: string;
  role: string;
}): Promise<SendResult> {
  if (!BSP_API_KEY) return { success: false, error: 'WhatsApp BSP not configured' };

  const payload = {
    countryCode: '+91',
    phoneNumber: params.phone.replace(/^\+?91/, ''),
    callbackData: 'confirmation',
    type: 'Template',
    template: {
      name: 'assignment_confirmed',
      languageCode: 'en',
      bodyValues: [
        params.memberName,
        params.projectTitle,
        params.shootDate,
        params.shootTime,
        params.location,
        params.role,
      ],
    },
  };

  try {
    const res = await fetch(BSP_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${BSP_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data?.message || `HTTP ${res.status}` };
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Verify Interakt webhook HMAC signature
// ---------------------------------------------------------------------------

export function verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[whatsapp] WHATSAPP_WEBHOOK_SECRET not set — rejecting request');
    return false;
  }

  try {
    // Interakt sends X-Hub-Signature-256: sha256=<hmac>
    const crypto = require('crypto');
    const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Parse an inbound Interakt webhook event and extract the button reply
// Returns null if the event is not a button reply we care about
// ---------------------------------------------------------------------------

export interface ButtonReplyEvent {
  assignmentId: string;
  action: 'accept' | 'reject';
  phone: string;         // sender phone (E.164 without +)
  rawPayload: string;
}

export function parseButtonReply(body: any): ButtonReplyEvent | null {
  try {
    // Interakt wraps events in entry[].changes[].value.messages[]
    const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages;
    if (!Array.isArray(messages) || messages.length === 0) return null;

    const msg = messages[0];
    if (msg?.type !== 'interactive') return null;

    const replyId: string = msg?.interactive?.button_reply?.id || '';
    // Expected format: "accept_<uuid>" or "reject_<uuid>"
    const match = replyId.match(/^(accept|reject)_(.+)$/);
    if (!match) return null;

    const phone = msg?.from || '';
    return {
      action: match[1] as 'accept' | 'reject',
      assignmentId: match[2],
      phone,
      rawPayload: replyId,
    };
  } catch {
    return null;
  }
}
