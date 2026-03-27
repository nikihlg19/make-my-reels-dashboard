import type { VercelRequest, VercelResponse } from '@vercel/node';

const handlers: Record<string, () => Promise<any>> = {
  create: () => import('../../src/api/assignment/create'),
  cancel: () => import('../../src/api/assignment/cancel'),
  candidates: () => import('../../src/api/assignment/candidates'),
  respond: () => import('../../src/api/assignment/respond'),
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;
  const loader = handlers[action];
  if (!loader) return res.status(404).json({ error: 'Not found' });
  const mod = await loader();
  return mod.default(req, res);
}
