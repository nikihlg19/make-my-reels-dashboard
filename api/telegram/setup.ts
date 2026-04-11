/**
 * POST /api/telegram/setup
 * One-time endpoint to register the webhook URL with Telegram.
 * Call once after deploy: curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/telegram/setup
 */

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({ error: 'Server configuration incomplete' });
  }

  const appUrl = process.env.VITE_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

  if (!appUrl) {
    return res.status(500).json({ error: 'Server configuration incomplete' });
  }

  const webhookUrl = `${appUrl}/api/telegram/webhook`;

  if (!webhookUrl.startsWith('https://')) {
    return res.status(500).json({ error: 'Webhook URL must use HTTPS' });
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';

  const body: Record<string, any> = {
    url: webhookUrl,
    allowed_updates: ['message'],
  };
  if (secret) {
    body.secret_token = secret;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error('[telegram/setup] setWebhook failed:', JSON.stringify(data));
      return res.status(500).json({ error: 'Webhook registration failed' });
    }

    console.log('[telegram/setup] webhook registered successfully');
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('[telegram/setup] error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
