/**
 * POST /api/team/aadhaar-upload
 * Auth: Clerk JWT (admin only)
 *
 * Handles Aadhaar image archive + DB update (server-side with service role).
 * The actual file upload is done client-side to Supabase Storage.
 *
 * Body: {
 *   memberId: string,
 *   action: 'archive' | 'delete',
 *   oldUrl?: string,       // URL of previous image to archive
 *   newUrl?: string,        // URL of newly uploaded image (for 'archive' action)
 * }
 */

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = 'documents';

function extractStoragePath(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const parts = urlObj.pathname.split(`/${BUCKET}/`);
    if (parts.length < 2) return null;
    return parts[1].split('?')[0];
  } catch {
    return null;
  }
}

async function archiveFile(filePath: string): Promise<void> {
  const archivePath = `archive/${filePath}`;
  try {
    await supabaseAdmin.storage.from(BUCKET).copy(filePath, archivePath);
  } catch (e) {
    console.warn('[aadhaar] archive copy failed:', e);
  }
  try {
    await supabaseAdmin.storage.from(BUCKET).remove([filePath]);
  } catch (e) {
    console.warn('[aadhaar] remove original failed:', e);
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { verifyAdmin } = await import('../../utils/apiAuth');
  const admin = await verifyAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Forbidden: admin access required' });

  const { memberId, action, oldUrl, newUrl } = req.body || {};

  if (!memberId || !action) {
    return res.status(400).json({ error: 'memberId and action required' });
  }

  if (action === 'archive' || action === 'delete') {
    // Archive the old file if provided
    if (oldUrl) {
      const oldPath = extractStoragePath(oldUrl);
      if (oldPath) await archiveFile(oldPath);
    }

    // Update DB with new URL (or null for delete)
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
