/**
 * GET /api/cron-assignments
 * Auth: CRON_SECRET (Vercel cron — runs every 30 min)
 *
 * Scans project_assignments for rows in status 'wa_sent' where auto_expire_at has passed.
 * Updates them to 'expired' and notifies admin.
 */

import { createClient } from '@supabase/supabase-js';
import { triggerAutoCascade } from '../utils/autoCascade';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Find expired assignments
  const { data: expired, error } = await supabaseAdmin
    .from('project_assignments')
    .select('id, project_id, team_member_id, role_needed, auto_expire_at, assignment_group_id')
    .eq('status', 'wa_sent')
    .lt('auto_expire_at', new Date().toISOString());

  if (error) {
    console.error('[cron-assignments] fetch error:', error);
    return res.status(500).json({ error: 'Database error' });
  }

  if (!expired || expired.length === 0) {
    return res.status(200).json({ processed: 0 });
  }

  const expiredIds = expired.map(a => a.id);

  // Bulk update to expired
  await supabaseAdmin
    .from('project_assignments')
    .update({ status: 'expired' })
    .in('id', expiredIds);

  // Fetch admin user IDs
  const { data: prefs } = await supabaseAdmin
    .from('notification_preferences')
    .select('user_id');
  const adminUserIds = prefs?.map(p => p.user_id) || [];

  if (adminUserIds.length === 0) {
    return res.status(200).json({ processed: expiredIds.length });
  }

  // Build one notification per expired assignment per admin
  const notificationsToInsert: any[] = [];

  for (const assignment of expired) {
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('title')
      .eq('id', assignment.project_id)
      .single();

    const { data: member } = await supabaseAdmin
      .from('team_members')
      .select('name')
      .eq('id', assignment.team_member_id)
      .single();

    const memberName = member?.name || 'Team member';
    const projectTitle = project?.title || 'a project';

    for (const userId of adminUserIds) {
      notificationsToInsert.push({
        user_id: userId,
        project_id: assignment.project_id,
        type: 'assignment_expired',
        title: `${memberName} didn't respond for ${projectTitle}`,
        message: `The assignment request for ${memberName} on "${projectTitle}" has expired. Please assign a replacement.`,
        urgency: 'high',
      });
    }
  }

  if (notificationsToInsert.length > 0) {
    await supabaseAdmin.from('notifications').insert(notificationsToInsert);
  }

  // Trigger auto-cascade for each expired assignment that has a group
  let cascadeCount = 0;
  for (const assignment of expired) {
    if (assignment.assignment_group_id) {
      const result = await triggerAutoCascade(
        supabaseAdmin,
        assignment.project_id,
        assignment.role_needed,
        assignment.assignment_group_id,
      );
      if (result.cascaded) cascadeCount++;
    }
  }

  console.log(`[cron-assignments] expired ${expiredIds.length}, cascaded ${cascadeCount}`);

  return res.status(200).json({ processed: expiredIds.length, cascaded: cascadeCount });
}
