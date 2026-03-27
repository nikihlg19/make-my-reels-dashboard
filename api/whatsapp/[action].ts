import type { VercelRequest, VercelResponse } from '@vercel/node';
import sendHandler from '../../src/api/whatsapp/send';
import webhookHandler from '../../src/api/whatsapp/webhook';

const handlers: Record<string, (req: VercelRequest, res: VercelResponse) => Promise<any>> = {
  send: sendHandler,
  webhook: webhookHandler,
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
