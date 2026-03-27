/**
 * POST /api/assignment/create
 * Auth: Clerk JWT (admin only)
 *
 * Creates a project_assignment record and sends a WhatsApp request
 * to the team member with Accept / Reject buttons.
 *
 * Body: { projectId, teamMemberId, roleNeeded, timeoutHours? }
 */

import { createClient } from '@supabase/supabase-js';
import { createClerkClient } from '@clerk/backend';
import { sendAssignmentRequest } from '../../services/whatsapp';
import { format, parseISO, addHours } from 'date-fns';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // --- Auth (admin only) ---
  const { verifyAdmin } = await import('../../utils/apiAuth');
  const admin = await verifyAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Forbidden: admin access required' });

  const { projectId, teamMemberId, roleNeeded, timeoutHours } = req.body || {};
  if (!projectId || !teamMemberId || !roleNeeded) {
    return res.status(400).json({ error: 'projectId, teamMemberId, and roleNeeded are required' });
  }

  const expireHours = Number(timeoutHours) || Number(process.env.ASSIGNMENT_TIMEOUT_HOURS) || 4;

  // --- Fetch project + member ---
  const [{ data: project, error: projErr }, { data: member, error: memErr }] = await Promise.all([
    supabaseAdmin.from('projects').select('id,title,location,event_date,event_time').eq('id', projectId).single(),
    supabaseAdmin.from('team_members').select('id,name,phone').eq('id', teamMemberId).single(),
  ]);

  if (projErr || !project) return res.status(404).json({ error: 'Project not found' });
  if (memErr || !member) return res.status(404).json({ error: 'Team member not found' });

  // --- Look up existing active attempt count for this group ---
  const { data: existingAttempts } = await supabaseAdmin
    .from('project_assignments')
    .select('attempt_number, assignment_group_id')
    .eq('project_id', projectId)
    .eq('role_needed', roleNeeded)
    .order('attempt_number', { ascending: false })
    .limit(1);

  const prevAttempt = existingAttempts?.[0];
  const attemptNumber = prevAttempt ? prevAttempt.attempt_number + 1 : 1;
  // Reuse group ID if one exists for this project+role, else generate new
  const assignmentGroupId = prevAttempt?.assignment_group_id || undefined;

  const autoExpireAt = addHours(new Date(), expireHours).toISOString();

  // --- Create assignment record (status: pending) ---
  const insertPayload: Record<string, any> = {
    project_id: projectId,
    team_member_id: teamMemberId,
    role_needed: roleNeeded,
    status: 'pending',
    attempt_number: attemptNumber,
    auto_expire_at: autoExpireAt,
    created_by: req.auth?.userId || 'system',
  };
  if (assignmentGroupId) insertPayload.assignment_group_id = assignmentGroupId;

  const { data: assignment, error: insertErr } = await supabaseAdmin
    .from('project_assignments')
    .insert(insertPayload)
    .select()
    .single();

  if (insertErr || !assignment) {
    console.error('[assignment/create] insert error:', insertErr?.message);
    return res.status(500).json({ error: 'Failed to create assignment record' });
  }

  // --- Send WhatsApp ---
  const shootDate = project.event_date
    ? format(parseISO(project.event_date), 'd MMM yyyy')
    : 'TBD';
  const shootTime = project.event_time || 'TBD';

  const waResult = await sendAssignmentRequest({
    phone: member.phone,
    memberName: member.name,
    projectTitle: project.title,
    shootDate,
    shootTime,
    location: project.location || 'TBD',
    role: roleNeeded,
    assignmentId: assignment.id,
  });

  // --- Update assignment status based on WhatsApp result ---
  const newStatus = waResult.success ? 'wa_sent' : 'pending';
  await supabaseAdmin
    .from('project_assignments')
    .update({
      status: newStatus,
      whatsapp_message_id: waResult.messageId || null,
      sent_at: waResult.success ? new Date().toISOString() : null,
    })
    .eq('id', assignment.id);

  // --- Log WhatsApp message ---
  await supabaseAdmin.from('whatsapp_messages').insert({
    direction: 'outbound',
    recipient_phone: member.phone,
    recipient_type: 'team_member',
    recipient_id: teamMemberId,
    template_name: 'assignment_request',
    template_params: { projectTitle: project.title, shootDate, shootTime, location: project.location, role: roleNeeded },
    message_type: 'assignment_request',
    whatsapp_message_id: waResult.messageId || null,
    status: waResult.success ? 'sent' : 'failed',
    error_message: waResult.error || null,
    related_project_id: projectId,
    related_assignment_id: assignment.id,
  });

  return res.status(200).json({
    assignmentId: assignment.id,
    status: newStatus,
    whatsappSent: waResult.success,
    whatsappError: waResult.error || null,
  });
}
