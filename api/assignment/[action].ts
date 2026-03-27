import type { VercelRequest, VercelResponse } from '@vercel/node';
import createHandler from '../../src/api/assignment/create';
import cancelHandler from '../../src/api/assignment/cancel';
import candidatesHandler from '../../src/api/assignment/candidates';
import respondHandler from '../../src/api/assignment/respond';

const handlers: Record<string, (req: VercelRequest, res: VercelResponse) => Promise<any>> = {
  create: createHandler,
  cancel: cancelHandler,
  candidates: candidatesHandler,
  respond: respondHandler,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;
  const fn = handlers[action];
  if (!fn) return res.status(404).json({ error: 'Not found' });
  try {
    return await fn(req, res);
  } catch (err: any) {
    console.error(`[assignment/${action}] unhandled error:`, err?.message || err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}
