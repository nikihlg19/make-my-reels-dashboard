import type { VercelRequest, VercelResponse } from '@vercel/node';

const handlers: Record<string, () => Promise<any>> = {
  send: () => import('../../src/api/whatsapp/send'),
  webhook: () => import('../../src/api/whatsapp/webhook'),
};

export const config = { api: { bodyParser: false } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;
  const loader = handlers[action];
  if (!loader) return res.status(404).json({ error: 'Not found' });
  const mod = await loader();
  return mod.default(req, res);
}
