import type { VercelRequest, VercelResponse } from '@vercel/node';
import aadhaarUploadHandler from '../../src/api/team/aadhaar-upload';
import availabilityHandler from '../../src/api/team/availability';

const handlers: Record<string, (req: VercelRequest, res: VercelResponse) => Promise<any>> = {
  'aadhaar-upload': aadhaarUploadHandler,
  'availability': availabilityHandler,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;
  const fn = handlers[action];
  if (!fn) return res.status(404).json({ error: 'Not found' });
  try {
    return await fn(req, res);
  } catch (err: any) {
    console.error(`[team/${action}] unhandled error:`, err?.message || err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}
