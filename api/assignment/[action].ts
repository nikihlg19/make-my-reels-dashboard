/**
 * Vercel catch-all for /api/assignment/* routes.
 * All utility code is inlined — no local file imports (Vercel @vercel/node does not bundle src/).
 */

import { createClient } from '@supabase/supabase-js';
import { addHours, format, parseISO } from 'date-fns';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import webPush from 'web-push';

// ─── Location parser (mirrors src/utils/location.ts) ─────────────────────────
function parseLocationAddress(raw: string): string {
  if (!raw) return 'TBD';
  try {
    const parsed = JSON.parse(raw);
    return parsed?.address || parsed?.mainText || raw;
  } catch {
    return raw;
  }
}

// ─── Supabase admin ──────────────────────────────────────────────────────────
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Web Push ────────────────────────────────────────────────────────────────
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'admin@makemyreels.in'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

async function sendPushToAdmins(adminUserIds: string[], title: string, body: string, projectId?: string) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || adminUserIds.length === 0) return;
  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', adminUserIds);
  if (!subs || subs.length === 0) return;
  const payload = JSON.stringify({ title, body, data: { url: projectId ? `/?project=${projectId}` : '/' } });
  await Promise.allSettled(
    subs.map((sub: any) =>
      webPush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
        .catch(async (err: any) => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          }
        })
    )
  );
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────
async function verifyAdmin(req: any): Promise<{ userId: string; email: string } | null> {
  try {
    const { verifyToken } = await import('@clerk/backend');
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return null;
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! });
    const userId = payload.sub;
    if (!userId) return null;
    const adminIds = (process.env.VITE_ADMIN_USER_IDS || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    if (adminIds.length === 0) { console.error('[verifyAdmin] VITE_ADMIN_USER_IDS not configured — denying all admin access'); return null; }
    if (!adminIds.includes(userId)) return null;
    return { userId, email: '' };
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

// ─── WhatsApp helpers ─────────────────────────────────────────────────────────
const BSP_API_URL = 'https://api.interakt.ai/v1/public/message/';
const BSP_API_KEY = process.env.WHATSAPP_BSP_API_KEY || '';

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
      bodyValues: [params.memberName, params.projectTitle, params.shootDate, params.shootTime, params.location, params.role, params.acceptUrl, params.declineUrl],
    },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(BSP_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Basic ${BSP_API_KEY}` }, body: JSON.stringify(payload), signal: controller.signal });
    const data = await res.text().then(t => { console.log('[WA] interakt status:', res.status, t.slice(0,300)); try { return JSON.parse(t); } catch { throw new Error(`HTTP ${res.status}: ${t.slice(0,200)}`); } });
    if (!res.ok) return { success: false, error: data?.message || `HTTP ${res.status}` };
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    return { success: false, error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally { clearTimeout(timer); }
}

async function sendAssignmentConfirmation(params: {
  phone: string; memberName: string; projectTitle: string; shootDate: string;
  shootTime: string; location: string; role: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!BSP_API_KEY) return { success: false, error: 'WhatsApp BSP not configured' };
  const payload = {
    countryCode: '+91',
    phoneNumber: params.phone.replace(/^\+?91/, ''),
    callbackData: 'confirmation',
    type: 'Template',
    template: { name: 'assignment_confirmed', languageCode: 'en', bodyValues: [params.memberName, params.projectTitle, params.shootDate, params.shootTime, params.location, params.role] },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(BSP_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Basic ${BSP_API_KEY}` }, body: JSON.stringify(payload), signal: controller.signal });
    const data = await res.text().then(t => { console.log('[WA] interakt status:', res.status, t.slice(0,300)); try { return JSON.parse(t); } catch { throw new Error(`HTTP ${res.status}: ${t.slice(0,200)}`); } });
    if (!res.ok) return { success: false, error: data?.message || `HTTP ${res.status}` };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally { clearTimeout(timer); }
}

async function sendAssignmentCancellation(params: {
  phone: string; memberName: string; projectTitle: string; shootDate: string; role: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!BSP_API_KEY) return { success: false, error: 'WhatsApp BSP not configured' };
  const payload = {
    countryCode: '+91',
    phoneNumber: params.phone.replace(/^\+?91/, ''),
    callbackData: 'cancellation',
    type: 'Template',
    template: { name: 'assignment_cancelled', languageCode: 'en', bodyValues: [params.memberName, params.projectTitle, params.shootDate, params.role] },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(BSP_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Basic ${BSP_API_KEY}` }, body: JSON.stringify(payload), signal: controller.signal });
    const data = await res.text().then(t => { console.log('[WA] cancellation interakt status:', res.status, t.slice(0,300)); try { return JSON.parse(t); } catch { throw new Error(`HTTP ${res.status}: ${t.slice(0,200)}`); } });
    if (!res.ok) return { success: false, error: data?.message || `HTTP ${res.status}` };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally { clearTimeout(timer); }
}

// ─── URL helpers ──────────────────────────────────────────────────────────────
const APP_URL = process.env.VITE_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173');

function buildRespondUrl(_assignmentId: string, action: 'accept' | 'decline', token: string): string {
  return `${APP_URL}/api/assignment/respond?t=${encodeURIComponent(token)}&r=${action}`;
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
          user_id: userId, project_id: projectId, type: 'assignment_exhausted',
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

  // Atomic claim — only proceed if we're the first to set was_attempted (prevents double-send race)
  const { data: claimed } = await supabase
    .from('assignment_candidates')
    .update({ was_attempted: true })
    .eq('id', next.id)
    .eq('was_attempted', false)
    .select('id')
    .single();
  if (!claimed) return { cascaded: false };

  const { data: project } = await supabase.from('projects').select('title, location, event_date, event_time').eq('id', projectId).single();
  if (!project) return { cascaded: false };

  const expireHours = Number(process.env.ASSIGNMENT_TIMEOUT_HOURS) || 4;
  const autoExpireAt = addHours(new Date(), expireHours).toISOString();

  const { data: newAssignment } = await supabase
    .from('project_assignments')
    .insert({ project_id: projectId, team_member_id: member.id, role_needed: roleNeeded, status: 'pending', attempt_number: next.rank_position, assignment_group_id: assignmentGroupId, auto_expire_at: autoExpireAt, created_by: 'system' })
    .select('id, response_token')
    .single();

  if (!newAssignment) return { cascaded: false };

  const acceptUrl = buildRespondUrl(newAssignment.id, 'accept', newAssignment.response_token);
  const declineUrl = buildRespondUrl(newAssignment.id, 'decline', newAssignment.response_token);
  const shootDate = project.event_date ? format(parseISO(project.event_date), 'd MMM yyyy') : 'TBD';

  const waResult = await sendAssignmentRequest({ phone: member.phone, memberName: member.name, projectTitle: project.title, shootDate, shootTime: project.event_time || 'TBD', location: parseLocationAddress(project.location), role: roleNeeded, assignmentId: newAssignment.id, acceptUrl, declineUrl });

  await supabase.from('project_assignments').update({ status: waResult.success ? 'wa_sent' : 'pending', whatsapp_message_id: waResult.messageId || null, sent_at: waResult.success ? new Date().toISOString() : null }).eq('id', newAssignment.id);

  const { data: prefs } = await supabase.from('notification_preferences').select('user_id');
  const adminIds = (prefs || []).map((p: any) => p.user_id);
  if (adminIds.length > 0) {
    await supabase.from('notifications').insert(
      adminIds.map((userId: string) => ({
        user_id: userId, project_id: projectId, type: 'assignment_cascaded',
        title: `Auto-sent to ${member.name} (rank #${next.rank_position})`,
        message: `Previous candidate declined/expired. Auto-sent request to ${member.name} (score: ${next.score}) for "${project.title}".`,
        urgency: 'medium',
      }))
    );
  }
  return { cascaded: true, nextMemberName: member.name };
}

// ─── Candidate ranking ────────────────────────────────────────────────────────
function distanceScore(distanceKm: number | undefined): number {
  if (distanceKm === undefined) return 0.5;
  return Math.max(0, 1 - distanceKm / 100);
}

function availabilityScore(member: any, shootDate: string, shootLocation: string, allProjects: any[], allAvailability: any[]): number {
  const blocked = allAvailability.some((a: any) => a.teamMemberId === member.id && shootDate >= a.unavailableFrom && shootDate <= a.unavailableTo);
  if (blocked) return 0;
  const sameDay = allProjects.filter((p: any) => p.eventDate === shootDate && (p.teamMemberIds || []).includes(member.id) && p.status !== 'Completed' && p.status !== 'Expired');
  if (sameDay.length === 0) return 1.0;
  return sameDay.every((p: any) => p.location === shootLocation) ? 0.5 : 0.0;
}

function ratingScore(member: any): number {
  if (!member.avgRating || member.avgRating === 0) return 0.5;
  return Math.min(member.avgRating / 5, 1);
}

function workloadScore(member: any): number {
  return Math.max(0, 1 - (member.activeProjects ?? 0) / 5);
}

function skillsScore(member: any, roleNeeded: string): number {
  const memberRoles = Array.isArray(member.role) ? member.role : [member.role];
  let score = memberRoles.some((r: string) => r.toLowerCase() === roleNeeded.toLowerCase()) ? 0.7 : 0.1;
  const roleTags: Record<string, string[]> = { videographer: ['4k', 'drone', 'wedding', 'cinematic', 'reels'], photographer: ['portrait', 'wedding', 'product', 'event'], editor: ['premiere', 'aftereffects', 'reels', 'color', 'grading'] };
  const relevantTags = roleTags[roleNeeded.toLowerCase()] || [];
  const memberTags = (member.tags || []).map((t: string) => t.toLowerCase());
  score += Math.min(relevantTags.filter(t => memberTags.includes(t)).length * 0.1, 0.3);
  return Math.min(score, 1);
}

function recentDeclinePenalty(member: any, allAssignments: any[]): number {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return allAssignments.some((a: any) => a.teamMemberId === member.id && a.status === 'declined' && (a.respondedAt || '') >= sevenDaysAgo) ? -0.5 : 0;
}

function rankCandidates(members: any[], roleNeeded: string, shootDate: string, shootLocation: string, allProjects: any[], allAvailability: any[], allAssignments: any[], distanceMap: Record<string, number> = {}): any[] {
  return members.map(member => {
    const distanceKm = distanceMap[member.id];
    const d = distanceScore(distanceKm);
    const a = availabilityScore(member, shootDate, shootLocation, allProjects, allAvailability);
    const r = ratingScore(member);
    const w = workloadScore(member);
    const s = skillsScore(member, roleNeeded);
    const penalty = recentDeclinePenalty(member, allAssignments);
    const raw = 0.25 * d + 0.20 * a + 0.20 * r + 0.15 * w + 0.15 * s + 0.05 * penalty;
    const score = Math.max(0, Math.min(100, Math.round(raw * 100)));
    const breakdown = { distance: Math.round(d * 100) / 100, availability: Math.round(a * 100) / 100, rating: Math.round(r * 100) / 100, workload: Math.round(w * 100) / 100, skills: Math.round(s * 100) / 100, recentDecline: penalty };
    return { member, score, breakdown, isAvailable: breakdown.availability > 0 };
  }).sort((a, b) => b.score - a.score);
}

// ─── HTML helpers (for respond handler) ──────────────────────────────────────
function htmlPage(title: string, emoji: string, heading: string, message: string, color: string) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${title} — Make My Reels</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#f8fafc 0%,#e2e8f0 100%);padding:24px}.card{background:#fff;border-radius:24px;padding:48px 32px;max-width:420px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}.emoji{font-size:64px;margin-bottom:16px}h1{font-size:22px;font-weight:800;color:${color};margin-bottom:8px;text-transform:uppercase;letter-spacing:-0.5px}p{font-size:15px;color:#64748b;line-height:1.6}.brand{margin-top:32px;font-size:11px;font-weight:700;color:#cbd5e1;text-transform:uppercase;letter-spacing:2px}</style></head><body><div class="card"><div class="emoji">${emoji}</div><h1>${heading}</h1><p>${message}</p><div class="brand">Make My Reels</div></div></body></html>`;
}

function sendHtml(res: any, status: number, html: string) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).end(html);
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleCreate(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const admin = await verifyAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Forbidden: admin access required' });

  const { projectId, teamMemberId, roleNeeded, timeoutHours, skipWA } = req.body || {};
  if (!projectId || !teamMemberId || !roleNeeded) return res.status(400).json({ error: 'projectId, teamMemberId, and roleNeeded are required' });

  const expireHours = Number(timeoutHours) || Number(process.env.ASSIGNMENT_TIMEOUT_HOURS) || 4;

  const [{ data: project, error: projErr }, { data: member, error: memErr }] = await Promise.all([
    supabaseAdmin.from('projects').select('id,title,location,event_date,event_time').eq('id', projectId).single(),
    supabaseAdmin.from('team_members').select('id,name,phone').eq('id', teamMemberId).single(),
  ]);

  if (projErr || !project) return res.status(404).json({ error: 'Project not found' });
  if (memErr || !member) return res.status(404).json({ error: 'Team member not found' });

  const { data: existingAttempts } = await supabaseAdmin
    .from('project_assignments').select('attempt_number, assignment_group_id')
    .eq('project_id', projectId).eq('role_needed', roleNeeded)
    .order('attempt_number', { ascending: false }).limit(1);

  const prevAttempt = existingAttempts?.[0];
  const attemptNumber = prevAttempt ? prevAttempt.attempt_number + 1 : 1;
  const assignmentGroupId = prevAttempt?.assignment_group_id || undefined;
  const autoExpireAt = addHours(new Date(), expireHours).toISOString();

  const insertPayload: Record<string, any> = { project_id: projectId, team_member_id: teamMemberId, role_needed: roleNeeded, status: 'pending', attempt_number: attemptNumber, auto_expire_at: autoExpireAt, created_by: req.auth?.userId || 'system' };
  if (assignmentGroupId) insertPayload.assignment_group_id = assignmentGroupId;

  const { data: assignment, error: insertErr } = await supabaseAdmin.from('project_assignments').insert(insertPayload).select('id, response_token').single();
  if (insertErr || !assignment) {
    console.error('[assignment/create] insert error:', insertErr?.message);
    return res.status(500).json({ error: 'Failed to create assignment record' });
  }

  const acceptUrl = buildRespondUrl(assignment.id, 'accept', assignment.response_token);
  const declineUrl = buildRespondUrl(assignment.id, 'decline', assignment.response_token);

  // skipWA: return URLs for client-side wa.me direct send, skip Interakt
  if (skipWA) {
    return res.status(200).json({
      assignmentId: assignment.id,
      acceptUrl,
      declineUrl,
      whatsappSent: false,
    });
  }

  const shootDate = project.event_date ? format(parseISO(project.event_date), 'd MMM yyyy') : 'TBD';

  const waResult = await Promise.race([
    sendAssignmentRequest({ phone: member.phone, memberName: member.name, projectTitle: project.title, shootDate, shootTime: project.event_time || 'TBD', location: parseLocationAddress(project.location), role: roleNeeded, assignmentId: assignment.id, acceptUrl, declineUrl }),
    new Promise<{ success: boolean; error?: string }>(resolve => setTimeout(() => resolve({ success: false, error: 'timeout' }), 7000)),
  ]);

  console.log('[assignment/create] WA result:', JSON.stringify(waResult));
  if (waResult.success) {
    await supabaseAdmin.from('project_assignments').update({ status: 'wa_sent', whatsapp_message_id: (waResult as any).messageId || null, sent_at: new Date().toISOString() }).eq('id', assignment.id);
  }

  return res.status(200).json({ assignmentId: assignment.id, whatsappSent: waResult.success });
}

async function handleCancel(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const admin = await verifyAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Forbidden: admin access required' });

  const { assignmentId } = req.body || {};
  if (!assignmentId) return res.status(400).json({ error: 'assignmentId is required' });

  const { data: assignment, error: fetchErr } = await supabaseAdmin
    .from('project_assignments')
    .select('id, status, team_member_id, project_id, role_needed')
    .eq('id', assignmentId).single();
  if (fetchErr || !assignment) return res.status(404).json({ error: 'Assignment not found' });
  if (!['pending', 'wa_sent', 'accepted'].includes(assignment.status)) return res.status(400).json({ error: `Cannot cancel assignment in status: ${assignment.status}` });

  const previousStatus = assignment.status;
  const { error: updateErr } = await supabaseAdmin.from('project_assignments').update({ status: 'cancelled' }).eq('id', assignmentId);
  if (updateErr) return res.status(500).json({ error: 'Failed to cancel assignment' });

  // Send WhatsApp cancellation notification (only if WA was already sent or accepted)
  let whatsappSent = false;
  if (['wa_sent', 'accepted'].includes(previousStatus)) {
    try {
      const [{ data: member }, { data: project }] = await Promise.all([
        supabaseAdmin.from('team_members').select('name, phone').eq('id', assignment.team_member_id).single(),
        supabaseAdmin.from('projects').select('title, event_date').eq('id', assignment.project_id).single(),
      ]);
      if (member?.phone && project) {
        const shootDate = project.event_date ? format(parseISO(project.event_date), 'd MMM yyyy') : 'TBD';
        const waResult = await sendAssignmentCancellation({
          phone: member.phone,
          memberName: member.name,
          projectTitle: project.title,
          shootDate,
          role: assignment.role_needed || 'Team Member',
        });
        whatsappSent = waResult.success;
        if (!waResult.success) console.warn('[cancel] WA notification failed:', waResult.error);
      }
    } catch (err: any) {
      console.error('[cancel] WA notification error:', err.message);
    }
  }

  return res.status(200).json({ success: true, whatsappSent, previousStatus });
}

async function handleCandidates(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const admin = await verifyAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Forbidden: admin access required' });

  const { projectId, roleNeeded, assignmentGroupId } = req.body || {};
  if (!projectId) return res.status(400).json({ error: 'projectId is required' });
  // roleNeeded can be empty string / 'All' — means rank all members without role filter

  const [{ data: project }, { data: members }, { data: availabilityRows }, { data: assignmentRows }] = await Promise.all([
    supabaseAdmin.from('projects').select('*').eq('id', projectId).single(),
    supabaseAdmin.from('team_members').select('*').eq('is_deleted', false),
    supabaseAdmin.from('team_availability').select('*'),
    supabaseAdmin.from('project_assignments').select('*').neq('status', 'cancelled'),
  ]);

  if (!project) return res.status(404).json({ error: 'Project not found' });

  const teamMembers = (members || []).map((m: any) => ({ id: m.id, name: m.name, role: m.role, phone: m.phone, location: m.location, avatar: m.avatar, color: m.color, activeProjects: m.active_projects, completedProjects: m.completed_projects, avgRating: m.avg_rating, avgEffort: m.avg_effort, onTimeRate: m.on_time_rate, tags: m.tags || [] }));
  const projectData = { id: project.id, title: project.title, description: project.description || '', location: project.location || '', priority: project.priority, tags: project.tags || [], teamMemberIds: project.team_member_ids || [], eventDate: project.event_date, eventTime: project.event_time, dueDate: project.due_date || '', status: project.status, progress: project.progress || 0 };
  const allAvailability = (availabilityRows || []).map((a: any) => ({ id: a.id, teamMemberId: a.team_member_id, unavailableFrom: a.unavailable_from, unavailableTo: a.unavailable_to, reason: a.reason }));
  const allAssignments = (assignmentRows || []).map((a: any) => ({ id: a.id, projectId: a.project_id, teamMemberId: a.team_member_id, roleNeeded: a.role_needed, status: a.status, respondedAt: a.responded_at, attemptNumber: a.attempt_number, assignmentGroupId: a.assignment_group_id, createdBy: a.created_by, createdAt: a.created_at }));

  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
  const distanceMap: Record<string, number> = {};
  if (project.location && apiKey) {
    const membersWithLocation = teamMembers.filter((m: any) => m.location).slice(0, 10);
    await Promise.allSettled(membersWithLocation.map(async (m: any) => {
      try {
        const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(m.location)}&destinations=${encodeURIComponent(project.location)}&key=${apiKey}`);
        if (!res.ok) { console.warn('[distance] Maps API error:', res.status); return; }
        const data = await res.json();
        if (data.status === 'OK' && data.rows?.[0]?.elements?.[0]?.status === 'OK') distanceMap[m.id] = data.rows[0].elements[0].distance.value / 1000;
      } catch (e: any) { console.warn('[distance] calculation failed:', e.message); }
    }));
  }

  const ranked = rankCandidates(teamMembers, roleNeeded, project.event_date, project.location || '', [projectData], allAvailability, allAssignments, distanceMap);
  const groupId = assignmentGroupId || crypto.randomUUID();
  const candidateRows = ranked.map((r: any, idx: number) => ({ assignment_group_id: groupId, project_id: projectId, team_member_id: r.member.id, role_needed: roleNeeded, rank_position: idx + 1, score: r.score, score_breakdown: r.breakdown, distance_km: distanceMap[r.member.id] ?? null, is_available: r.isAvailable, was_attempted: allAssignments.some((a: any) => a.assignmentGroupId === groupId && a.teamMemberId === r.member.id) }));

  await supabaseAdmin.from('assignment_candidates').delete().eq('assignment_group_id', groupId);
  await supabaseAdmin.from('assignment_candidates').insert(candidateRows);

  return res.status(200).json({ assignmentGroupId: groupId, candidates: ranked.map((r: any, idx: number) => ({ rankPosition: idx + 1, score: r.score, breakdown: r.breakdown, isAvailable: r.isAvailable, distanceKm: distanceMap[r.member.id], member: { id: r.member.id, name: r.member.name, role: r.member.role, color: r.member.color, avatar: r.member.avatar, location: r.member.location, avgRating: r.member.avgRating, activeProjects: r.member.activeProjects, tags: r.member.tags } })) });
}

async function handleRespond(req: any, res: any) {
  if (req.method !== 'GET') return sendHtml(res, 405, htmlPage('Error', '🚫', 'Method Not Allowed', 'This link only works when tapped directly.', '#ef4444'));

  const { t: token, r: action } = req.query || {};
  // also support legacy ?id=...&token=... links already sent
  const legacyToken = req.query?.token;
  const resolvedToken = token || legacyToken;
  if (!resolvedToken || !['accept', 'decline'].includes(action as string)) return sendHtml(res, 400, htmlPage('Invalid Link', '🔗', 'Invalid Link', 'This link is malformed or incomplete.', '#ef4444'));

  const { data: assignment, error: fetchErr } = await supabaseAdmin
    .from('project_assignments')
    .select('id, status, project_id, team_member_id, role_needed, assignment_group_id, auto_expire_at, response_token')
    .eq('response_token', resolvedToken).single();

  if (fetchErr || !assignment) return sendHtml(res, 404, htmlPage('Not Found', '🔍', 'Assignment Not Found', 'This link is invalid or has expired.', '#ef4444'));

  if (['accepted', 'declined', 'expired', 'cancelled'].includes(assignment.status)) {
    const msgs: Record<string, any> = { accepted: { emoji: '✅', heading: 'Already Accepted', msg: 'You have already accepted this assignment.', color: '#10b981' }, declined: { emoji: '👋', heading: 'Already Declined', msg: 'You have already declined this assignment.', color: '#6366f1' }, expired: { emoji: '⏰', heading: 'Link Expired', msg: 'This assignment has expired.', color: '#f59e0b' }, cancelled: { emoji: '📋', heading: 'No Longer Needed', msg: 'Thanks for your interest! The admin has updated the team for this event. No action required on your end.', color: '#64748b' } };
    const s = msgs[assignment.status];
    return sendHtml(res, 200, htmlPage(s.heading, s.emoji, s.heading, s.msg, s.color));
  }

  if (assignment.auto_expire_at && new Date(assignment.auto_expire_at) < new Date()) {
    await supabaseAdmin.from('project_assignments').update({ status: 'expired' }).eq('id', assignment.id);
    return sendHtml(res, 200, htmlPage('Expired', '⏰', 'Link Expired', 'This assignment request has expired.', '#f59e0b'));
  }

  const newStatus = action === 'accept' ? 'accepted' : 'declined';
  // Atomic update — only succeeds if still in a respondable state (prevents double-submit race condition)
  const { data: updated } = await supabaseAdmin
    .from('project_assignments')
    .update({ status: newStatus, responded_at: new Date().toISOString() })
    .eq('id', assignment.id)
    .in('status', ['pending', 'wa_sent'])
    .select('id')
    .single();
  if (!updated) {
    // Another request already handled this assignment concurrently
    return sendHtml(res, 200, htmlPage('Already Handled', '✅', 'Already Responded', 'This assignment has already been responded to. No further action needed.', '#6366f1'));
  }

  const [{ data: project }, { data: member }] = await Promise.all([
    supabaseAdmin.from('projects').select('title, location, event_date, event_time').eq('id', assignment.project_id).single(),
    supabaseAdmin.from('team_members').select('name, phone').eq('id', assignment.team_member_id).single(),
  ]);

  const memberName = member?.name || 'Team member';
  const projectTitle = project?.title || 'the project';

  await supabaseAdmin.from('whatsapp_messages').insert({ direction: 'inbound', recipient_phone: member?.phone || '', recipient_type: 'team_member', recipient_id: assignment.team_member_id, message_type: action === 'accept' ? 'assignment_accepted' : 'assignment_rejected', status: 'delivered', related_project_id: assignment.project_id, related_assignment_id: assignment.id });

  // Run cascade first (on decline) so we can include the next person's name in the notification
  let cascadeResult: { cascaded: boolean; nextMemberName?: string } = { cascaded: false };
  if (action === 'decline' && assignment.assignment_group_id) {
    try { cascadeResult = await triggerAutoCascade(supabaseAdmin, assignment.project_id, assignment.role_needed, assignment.assignment_group_id); }
    catch (err) { console.error('[respond] auto-cascade error:', err); }
  }

  const { data: prefs } = await supabaseAdmin.from('notification_preferences').select('user_id');
  const adminUserIds = (prefs || []).map((p: any) => p.user_id);

  const notifTitle = action === 'accept'
    ? `✅ ${memberName} accepted — ${projectTitle}`
    : `❌ ${memberName} declined — ${projectTitle}`;
  const notifMessage = action === 'accept'
    ? `${memberName} confirmed availability for "${projectTitle}".`
    : cascadeResult.cascaded
      ? `${memberName} declined. Auto-sent request to ${cascadeResult.nextMemberName} next.`
      : `${memberName} declined "${projectTitle}". Open Smart Assign to find a replacement.`;

  if (adminUserIds.length > 0) {
    await supabaseAdmin.from('notifications').insert(adminUserIds.map((userId: string) => ({
      user_id: userId,
      project_id: assignment.project_id,
      type: action === 'accept' ? 'assignment_accepted' : 'assignment_declined',
      title: notifTitle,
      message: notifMessage,
      urgency: action === 'accept' ? 'medium' : 'high',
    })));
    await sendPushToAdmins(adminUserIds, notifTitle, notifMessage, assignment.project_id);
  }

  if (action === 'accept' && member?.phone && project) {
    try {
      const shootDate = project.event_date ? format(parseISO(project.event_date), 'd MMM yyyy') : 'TBD';
      await sendAssignmentConfirmation({ phone: member.phone, memberName, projectTitle: project.title, shootDate, shootTime: project.event_time || 'TBD', location: parseLocationAddress(project.location), role: assignment.role_needed });
    } catch (err) { console.error('[respond] confirmation WA error:', err); }
  }

  if (action === 'accept') {
    const shootInfo = project ? `<br><br><strong>${project.title}</strong><br>${project.event_date || ''} ${project.event_time ? 'at ' + project.event_time : ''}<br>${project.location || ''}` : '';
    return sendHtml(res, 200, htmlPage('Accepted', '🎬', "You're In!", `Thanks ${memberName}! You have confirmed your availability for this shoot.${shootInfo}`, '#10b981'));
  }
  return sendHtml(res, 200, htmlPage('Declined', '👋', 'Assignment Declined', `Thanks ${memberName}. We'll find someone else for this one.`, '#6366f1'));
}

// ─── Router ───────────────────────────────────────────────────────────────────
const handlers: Record<string, (req: any, res: any) => Promise<any>> = {
  create: handleCreate,
  cancel: handleCancel,
  candidates: handleCandidates,
  respond: handleRespond,
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
