/**
 * POST /api/telegram/webhook
 * Receives updates from the Telegram Bot API.
 * Handles /start {linkToken} to link a Telegram chat to a dashboard user,
 * and /stop to unlink.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function sendTelegramReply(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  }).catch((err) => console.warn('[telegram] reply failed:', err.message));
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Mandatory: verify the secret token header set during setWebhook
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[telegram/webhook] TELEGRAM_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }
  if (req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const update = req.body;
  const message = update?.message;
  if (!message?.text || !message?.chat?.id) {
    return res.status(200).json({ ok: true }); // ignore non-text updates
  }

  const chatId = message.chat.id;
  const text = (message.text || '').trim();

  // ── /start {linkToken} ──────────────────────────────────────────────────────
  if (text.startsWith('/start')) {
    const linkToken = text.replace('/start', '').trim();

    if (!linkToken) {
      await sendTelegramReply(chatId,
        '👋 Welcome! To connect your dashboard, open <b>Notification Settings</b> in the Make My Reels app and click <b>Connect Telegram</b>.'
      );
      return res.status(200).json({ ok: true });
    }

    // Validate token format (UUID)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(linkToken)) {
      await sendTelegramReply(chatId, '❌ Invalid link. Please use the link from your dashboard.');
      return res.status(200).json({ ok: true });
    }

    // Look up the link token — must exist and not be expired
    const { data: linkData } = await supabaseAdmin
      .from('notification_preferences')
      .select('user_id, telegram_link_expires')
      .eq('telegram_link_token', linkToken)
      .single();

    if (!linkData) {
      await sendTelegramReply(chatId, '❌ Link not found or already used. Please generate a new link from dashboard settings.');
      return res.status(200).json({ ok: true });
    }

    // Check expiry (10 minutes)
    if (linkData.telegram_link_expires && new Date(linkData.telegram_link_expires) < new Date()) {
      // Clear expired token
      await supabaseAdmin
        .from('notification_preferences')
        .update({ telegram_link_token: null, telegram_link_expires: null })
        .eq('user_id', linkData.user_id);
      await sendTelegramReply(chatId, '⏰ This link has expired. Please generate a new one from your dashboard.');
      return res.status(200).json({ ok: true });
    }

    // Check if this chat_id is already linked to another user
    const { data: alreadyLinked } = await supabaseAdmin
      .from('notification_preferences')
      .select('user_id')
      .eq('telegram_chat_id', String(chatId))
      .single();

    if (alreadyLinked && alreadyLinked.user_id !== linkData.user_id) {
      await supabaseAdmin
        .from('notification_preferences')
        .update({ telegram_chat_id: null })
        .eq('user_id', alreadyLinked.user_id);
    }

    // Link this chat_id and clear the token (single-use)
    const { error } = await supabaseAdmin
      .from('notification_preferences')
      .update({
        telegram_chat_id: String(chatId),
        telegram_link_token: null,
        telegram_link_expires: null,
      })
      .eq('user_id', linkData.user_id);

    if (error) {
      console.error('[telegram/webhook] link error:', error.code);
      await sendTelegramReply(chatId, '⚠️ Something went wrong. Please try again.');
      return res.status(200).json({ ok: true });
    }

    await sendTelegramReply(chatId,
      '✅ <b>Connected!</b> You will now receive Make My Reels notifications here.\n\nSend /stop to disconnect.'
    );
    console.log('[telegram/webhook] chat linked successfully');
    return res.status(200).json({ ok: true });
  }

  // ── /stop ──────────────────────────────────────────────────────────────────
  if (text.startsWith('/stop')) {
    const { data: linked } = await supabaseAdmin
      .from('notification_preferences')
      .select('user_id')
      .eq('telegram_chat_id', String(chatId))
      .single();

    if (!linked) {
      await sendTelegramReply(chatId, 'ℹ️ This chat is not connected to any account.');
      return res.status(200).json({ ok: true });
    }

    await supabaseAdmin
      .from('notification_preferences')
      .update({ telegram_chat_id: null })
      .eq('user_id', linked.user_id);

    await sendTelegramReply(chatId,
      '🔕 <b>Disconnected.</b> You will no longer receive notifications here.\n\nTo reconnect, use the link in your dashboard settings.'
    );
    console.log('[telegram/webhook] chat unlinked');
    return res.status(200).json({ ok: true });
  }

  // ── Unknown command ────────────────────────────────────────────────────────
  await sendTelegramReply(chatId,
    'ℹ️ I only respond to:\n• /start — Connect your dashboard\n• /stop — Disconnect notifications'
  );
  return res.status(200).json({ ok: true });
}
