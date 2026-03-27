/**
 * autoCascade — shared helper used by both the webhook (on decline)
 * and the cron (on expiry) to automatically send to the next ranked candidate.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { sendAssignmentRequest } from '../services/whatsapp';
import { format, parseISO, addHours } from 'date-fns';

export async function triggerAutoCascade(
  supabase: SupabaseClient,
  projectId: string,
  roleNeeded: string,
  assignmentGroupId: string,
): Promise<{ cascaded: boolean; nextMemberName?: string }> {
  // Find the next un-attempted candidate in ranked order
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
    // No more candidates — notify admin
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

  const member = (next as any).team_members;
  if (!member?.phone) return { cascaded: false };

  // Mark this candidate as attempted
  await supabase
    .from('assignment_candidates')
    .update({ was_attempted: true })
    .eq('id', next.id);

  // Fetch project details for the WA message
  const { data: project } = await supabase
    .from('projects')
    .select('title, location, event_date, event_time')
    .eq('id', projectId)
    .single();

  if (!project) return { cascaded: false };

  const expireHours = Number(process.env.ASSIGNMENT_TIMEOUT_HOURS) || 4;
  const autoExpireAt = addHours(new Date(), expireHours).toISOString();

  // Create new assignment record
  const { data: newAssignment } = await supabase
    .from('project_assignments')
    .insert({
      project_id: projectId,
      team_member_id: member.id,
      role_needed: roleNeeded,
      status: 'pending',
      attempt_number: (next.rank_position),
      assignment_group_id: assignmentGroupId,
      auto_expire_at: autoExpireAt,
      created_by: 'system',
    })
    .select()
    .single();

  if (!newAssignment) return { cascaded: false };

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
  });

  await supabase
    .from('project_assignments')
    .update({
      status: waResult.success ? 'wa_sent' : 'pending',
      whatsapp_message_id: waResult.messageId || null,
      sent_at: waResult.success ? new Date().toISOString() : null,
    })
    .eq('id', newAssignment.id);

  // Notify admin of auto-cascade
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
