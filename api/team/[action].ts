/**
 * Vercel catch-all for /api/team/* routes.
 * All utility code inlined — no local file imports (Vercel does not bundle src/).
 */

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Auth helpers ─────────────────────────────────────────────────────────────
async function verifyAdmin(req: any): Promise<{ userId: string; email: string } | null> {
  try {
    const { createClerkClient, verifyToken } = await import('@clerk/backend');
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return null;
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! });
    const userId = payload.sub;
    if (!userId) return null;
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const user = await clerk.users.getUser(userId);
    const email = user.emailAddresses?.[0]?.emailAddress || '';
    const adminEmails = (process.env.VITE_ADMIN_EMAILS || '').split(',').map((e: string) => e.trim().toLowerCase());
    if (!adminEmails.includes(email.toLowerCase())) return null;
    return { userId, email };
  } catch (err: any) { console.error('[verifyAdmin] exception:', err?.message); return null; }
}

async function verifyAuth(req: any): Promise<{ userId: string } | null> {
  try {
    const { verifyToken } = await import('@clerk/backend');
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return null;
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! });
    return payload.sub ? { userId: payload.sub } : null;
  } catch { return null; }
}

// ─── Storage helpers ──────────────────────────────────────────────────────────
const BUCKET = 'documents';

function extractStoragePath(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const parts = urlObj.pathname.split(`/${BUCKET}/`);
    if (parts.length < 2) return null;
    return parts[1].split('?')[0];
  } catch { return null; }
}

async function archiveFile(filePath: string): Promise<void> {
  const archivePath = `archive/${filePath}`;
  try {
    await supabaseAdmin.storage.from(BUCKET).copy(filePath, archivePath);
  } catch (e) { console.warn('[aadhaar] archive copy failed:', e); }
  try {
    await supabaseAdmin.storage.from(BUCKET).remove([filePath]);
  } catch (e) { console.warn('[aadhaar] remove original failed:', e); }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────
async function handleAadhaarUpload(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const admin = await verifyAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Forbidden: admin access required' });

  const { memberId, action, oldUrl, newUrl } = req.body || {};

  if (!memberId || !action) {
    return res.status(400).json({ error: 'memberId and action required' });
  }

  if (action === 'archive' || action === 'delete') {
    if (oldUrl) {
      const oldPath = extractStoragePath(oldUrl);
      if (oldPath) await archiveFile(oldPath);
    }

    const imageUrl = action === 'delete' ? null : (newUrl || null);
    const { error } = await supabaseAdmin
      .from('team_members')
      .update({ aadhaar_image_url: imageUrl })
      .eq('id', memberId);

    if (error) {
      console.error('[aadhaar] DB update error:', error);
      return res.status(500).json({ error: 'Failed to update record' });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: 'Invalid action. Use "archive" or "delete".' });
}

async function handleAvailability(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
  } else if (req.method === 'POST' || req.method === 'DELETE') {
    const admin = await verifyAdmin(req);
    if (!admin) return res.status(403).json({ error: 'Forbidden: admin access required' });
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.method === 'GET') {
    const memberId = req.query.memberId;
    let query = supabaseAdmin.from('team_availability').select('*').order('unavailable_from');
    if (memberId) query = query.eq('team_member_id', memberId);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: 'Failed to fetch availability' });
    return res.status(200).json(data || []);
  }

  if (req.method === 'POST') {
    const { teamMemberId, unavailableFrom, unavailableTo, reason } = req.body || {};
    if (!teamMemberId || !unavailableFrom || !unavailableTo) {
      return res.status(400).json({ error: 'teamMemberId, unavailableFrom, unavailableTo required' });
    }
    const { data, error } = await supabaseAdmin
      .from('team_availability')
      .insert({ team_member_id: teamMemberId, unavailable_from: unavailableFrom, unavailable_to: unavailableTo, reason: reason || null })
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'Failed to create availability record' });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id is required' });
    const { error } = await supabaseAdmin.from('team_availability').delete().eq('id', id);
    if (error) return res.status(500).json({ error: 'Failed to delete availability record' });
    return res.status(200).json({ success: true });
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────
const handlers: Record<string, (req: VercelRequest, res: VercelResponse) => Promise<any>> = {
  'aadhaar-upload': handleAadhaarUpload,
  'availability': handleAvailability,
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
