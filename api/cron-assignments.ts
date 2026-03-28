/**
 * Vercel cron: /api/cron-assignments
 * All utility code inlined — no local file imports (Vercel does not bundle src/).
 */

import { createClient } from '@supabase/supabase-js';
import { format, parseISO, addHours } from 'date-fns';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── WhatsApp helpers ─────────────────────────────────────────────────────────
const BSP_API_URL = 'https://api.interakt.ai/v1/public/message/';
const BSP_API_KEY = process.env.WHATSAPP_BSP_API_KEY || '';

function buildRespondUrl(assignmentId: string, action: 'accept' | 'decline', token: string): string {
  const APP_URL = process.env.VITE_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173');
  return `${APP_URL}/api/assignment/respond?id=${encodeURIComponent(assignmentId)}&r=${action}&token=${encodeURIComponent(token)}`;
}

async function sendAssignmentRequest(params: {
  phone: string; memberName: string; projectTitle: string; shootDate: string;
  shootTime: string; location: string; role: string; assignmentId: string;
  acceptUrl: string; declineUrl: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!BSP_API_KEY) return { success: false, error: 'WhatsApp BSP not configured' };

  const payload = {
    countryCode: '+91',
    phoneNumber: params.phone.replace(/^\+?91/, ''),
    callbackData: `assignment:${params.assignmentId}`,
    type: 'Template',
    template: {
      name: 'assignment_request_v2',
      languageCode: 'en',
      bodyValues: [
        params.memberName,
        params.projectTitle,
        params.shootDate,
        params.shootTime,
        params.location,
        params.role,
        params.acceptUrl,
        params.declineUrl,
      ],
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(BSP_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${BSP_API_KEY}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data?.message || `HTTP ${res.status}` };
    return { success: true, messageId: data?.id || data?.messageId };
  } catch (err: any) {
    const isTimeout = err.name === 'AbortError';
    return { success: false, error: isTimeout ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Auto-cascade ─────────────────────────────────────────────────────────────
async function triggerAutoCascade(
  supabase: any,
  projectId: string,
  roleNeeded: string,
  assignmentGroupId: string,
): Promise<{ cascaded: boolean; nextMemberName?: string }> {
  const { data: next } = await supabase
    .from('assignment_candidates')
    .select('*, team_members(id, name, phone)')
    .eq('assignment_group_id', assignmentGroupId)
    .eq('was_attempted', false)
    .eq('is_available', true)
    .order('rank_position', { ascending: true })
    .limit(1)
    .single();

  if (!next) {
    const { data: prefs } = await supabase.from('notification_preferences').select('user_id');
    const adminIds = (prefs || []).map((p: any) => p.user_id);
    const { data: project } = await supabase.from('projects').select('title').eq('id', projectId).single();
    if (adminIds.length > 0) {
      await supabase.from('notifications').insert(
        adminIds.map((userId: string) => ({
          user_id: userId,
          project_id: projectId,
          type: 'assignment_exhausted',
          title: `No candidates left for ${project?.title || 'a project'}`,
          message: `All ranked ${roleNeeded}s have declined or not responded for "${project?.title}". Consider changing the date or adding new team members.`,
          urgency: 'high',
        }))
      );
    }
    return { cascaded: false };
  }

  const member = next.team_members;
  if (!member?.phone) return { cascaded: false };

  await supabase.from('assignment_candidates').update({ was_attempted: true }).eq('id', next.id);

  const { data: project } = await supabase
    .from('projects')
    .select('title, location, event_date, event_time')
    .eq('id', projectId)
    .single();

  if (!project) return { cascaded: false };

  const expireHours = Number(process.env.ASSIGNMENT_TIMEOUT_HOURS) || 4;
  const autoExpireAt = addHours(new Date(), expireHours).toISOString();

  const { data: newAssignment } = await supabase
    .from('project_assignments')
    .insert({
      project_id: projectId,
      team_member_id: member.id,
      role_needed: roleNeeded,
      status: 'pending',
      attempt_number: next.rank_position,
      assignment_group_id: assignmentGroupId,
      auto_expire_at: autoExpireAt,
      created_by: 'system',
    })
    .select('id, response_token')
    .single();

  if (!newAssignment) return { cascaded: false };

  const acceptUrl = buildRespondUrl(newAssignment.id, 'accept', newAssignment.response_token);
  const declineUrl = buildRespondUrl(newAssignment.id, 'decline', newAssignment.response_token);
  const shootDate = project.event_date ? format(parseISO(project.event_date), 'd MMM yyyy') : 'TBD';

  const waResult = await sendAssignmentRequest({
    phone: member.phone,
    memberName: member.name,
    projectTitle: project.title,
    shootDate,
    shootTime: project.event_time || 'TBD',
    location: project.location || 'TBD',
    role: roleNeeded,
    assignmentId: newAssignment.id,
    acceptUrl,
    declineUrl,
  });

  await supabase
    .from('project_assignments')
    .update({
      status: waResult.success ? 'wa_sent' : 'pending',
      whatsapp_message_id: waResult.messageId || null,
      sent_at: waResult.success ? new Date().toISOString() : null,
    })
    .eq('id', newAssignment.id);

  const { data: prefs } = await supabase.from('notification_preferences').select('user_id');
  const adminIds = (prefs || []).map((p: any) => p.user_id);
  if (adminIds.length > 0) {
    await supabase.from('notifications').insert(
      adminIds.map((userId: string) => ({
        user_id: userId,
        project_id: projectId,
        type: 'assignment_cascaded',
        title: `Auto-sent to ${member.name} (rank #${next.rank_position})`,
        message: `Previous candidate declined/expired. Auto-sent request to ${member.name} (score: ${next.score}) for "${project.title}".`,
        urgency: 'medium',
      }))
    );
  }

  return { cascaded: true, nextMemberName: member.name };
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

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

  const expiredIds = expired.map((a: any) => a.id);

  await supabaseAdmin
    .from('project_assignments')
    .update({ status: 'expired' })
    .in('id', expiredIds);

  const { data: prefs } = await supabaseAdmin
    .from('notification_preferences')
    .select('user_id');
  const adminUserIds = prefs?.map((p: any) => p.user_id) || [];

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

    const memberName = (member as any)?.name || 'Team member';
    const projectTitle = (project as any)?.title || 'a project';

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
