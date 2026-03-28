import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ARCHIVE_MAX_AGE_DAYS = 30;
const BUCKET = 'documents';
const ARCHIVE_PREFIX = 'archive';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - ARCHIVE_MAX_AGE_DAYS);

    const filesToDelete: string[] = [];

    const { data: topLevel, error: listError } = await supabaseAdmin.storage
      .from(BUCKET)
      .list(ARCHIVE_PREFIX, { limit: 500, sortBy: { column: 'created_at', order: 'asc' } });

    if (listError) throw listError;

    for (const item of topLevel || []) {
      if (!item.id && item.name) {
        const { data: subFiles } = await supabaseAdmin.storage
          .from(BUCKET)
          .list(`${ARCHIVE_PREFIX}/${item.name}`, { limit: 1000, sortBy: { column: 'created_at', order: 'asc' } });

        for (const file of subFiles || []) {
          if (file.created_at && new Date(file.created_at) < cutoffDate) {
            filesToDelete.push(`${ARCHIVE_PREFIX}/${item.name}/${file.name}`);
          }
        }
      } else if (item.created_at && new Date(item.created_at) < cutoffDate) {
        filesToDelete.push(`${ARCHIVE_PREFIX}/${item.name}`);
      }
    }

    if (filesToDelete.length === 0) {
      return res.status(200).json({ message: 'No expired files to delete', deleted: 0 });
    }

    let totalDeleted = 0;
    for (let i = 0; i < filesToDelete.length; i += 100) {
      const batch = filesToDelete.slice(i, i + 100);
      const { error: deleteError } = await supabaseAdmin.storage.from(BUCKET).remove(batch);
      if (deleteError) {
        console.error(`Failed to delete batch at ${i}:`, deleteError.message);
      } else {
        totalDeleted += batch.length;
      }
    }

    return res.status(200).json({
      message: 'Cleanup complete',
      deleted: totalDeleted,
      files: filesToDelete,
    });
  } catch (err: any) {
    console.error('Cleanup error:', err);
    return res.status(500).json({ error: 'Cleanup failed' });
  }
}
