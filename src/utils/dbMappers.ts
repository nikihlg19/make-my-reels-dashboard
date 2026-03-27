/**
 * Field mapping utilities for converting between
 * TypeScript camelCase types and Supabase snake_case columns.
 */

import type { Project, TeamMember, Client, PendingApproval } from '../../types';

// ── Project ──────────────────────────────────────────────────

export function projectToRow(p: Project): Record<string, any> {
  return {
    id: p.id,
    title: p.title,
    description: p.description || null,
    notes: p.notes || null,
    location: p.location || null,
    priority: p.priority,
    tags: p.tags || [],
    client_id: p.clientId || null,
    client_ids: p.clientIds || [],
    client_name: (p as any).client_name || null,
    team_member_ids: p.teamMemberIds || [],
    event_date: p.eventDate || null,
    event_time: p.eventTime || null,
    due_date: p.dueDate || null,
    submission_deadline: p.submissionDeadline || null,
    status: p.status,
    progress: p.progress ?? 0,
    budget: p.budget ?? 0,
    expenses: p.expenses ?? 0,
    rating: p.rating ?? 0,
    requires_payment: p.requires_payment ?? false,
    invoice_amount: p.invoice_amount ?? 0,
    payment_status: p.payment_status || null,
    razorpay_link_id: p.razorpay_link_id || null,
    razorpay_link_url: p.razorpay_link_url || null,
    instagram_links: p.instaLinks || [],
    dependencies: p.dependencies || [],
    is_deleted: p.isDeleted ?? false,
    updated_at: p.updatedAt ? new Date(p.updatedAt).toISOString() : new Date().toISOString(),
  };
}

function excelTimeToString(val: any): string | undefined {
  if (!val) return undefined;
  const str = String(val);
  // Already a time string like "09:00" or "09:00:00"
  if (/^\d{1,2}:\d{2}/.test(str)) return str.slice(0, 5);
  // Excel decimal fraction (e.g. 0.375 = 09:00)
  const num = parseFloat(str);
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMinutes = Math.round(num * 24 * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  return undefined;
}

export function rowToProject(r: Record<string, any>): Project {
  return {
    id: r.id,
    title: r.title || '',
    description: r.description || '',
    notes: r.notes || '',
    location: r.location || '',
    priority: r.priority || 'Medium',
    tags: r.tags || [],
    clientId: r.client_id || undefined,
    clientIds: r.client_ids || [],
    client_name: r.client_name || undefined,
    teamMemberIds: r.team_member_ids || [],
    eventDate: r.event_date || '',
    eventTime: excelTimeToString(r.event_time),
    dueDate: r.due_date || '',
    submissionDeadline: r.submission_deadline || undefined,
    status: r.status || 'Lead',
    progress: r.progress ?? 0,
    budget: r.budget ?? 0,
    expenses: r.expenses ?? 0,
    rating: r.rating ?? 0,
    requires_payment: r.requires_payment ?? false,
    invoice_amount: r.invoice_amount ?? 0,
    payment_status: r.payment_status || undefined,
    razorpay_link_id: r.razorpay_link_id || undefined,
    razorpay_link_url: r.razorpay_link_url || undefined,
    instaLinks: r.instagram_links || [],
    dependencies: r.dependencies || [],
    isDeleted: r.is_deleted ?? false,
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
  };
}

// ── TeamMember ───────────────────────────────────────────────

export function teamMemberToRow(m: TeamMember): Record<string, any> {
  return {
    id: m.id,
    name: m.name,
    phone: m.phone,
    role: Array.isArray(m.role) ? m.role.join(', ') : m.role,
    location: m.location || null,
    avatar: m.avatar || null,
    color: m.color || null,
    active_projects: m.activeProjects ?? 0,
    completed_projects: m.completedProjects ?? 0,
    avg_rating: m.avgRating ?? 0,
    avg_effort: m.avgEffort ?? 0,
    on_time_rate: m.onTimeRate ?? 0,
    tags: m.tags || [],
    onboarding_notes: m.onboardingNotes || null,
    aadhaar_image_url: m.aadhaar_image_url || null,
    kyc_declaration: m.kyc_declaration ?? false,
    is_deleted: m.isDeleted ?? false,
    updated_at: m.updatedAt ? new Date(m.updatedAt).toISOString() : new Date().toISOString(),
  };
}

export function rowToTeamMember(r: Record<string, any>): TeamMember {
  const roleStr = r.role || '';
  const roles = typeof roleStr === 'string'
    ? roleStr.split(',').map((s: string) => s.trim()).filter(Boolean)
    : Array.isArray(roleStr) ? roleStr : [roleStr];

  return {
    id: r.id,
    name: r.name || '',
    phone: r.phone || '',
    role: roles.length > 0 ? roles : ['Member'],
    location: r.location || '',
    avatar: r.avatar || '',
    color: r.color || '',
    activeProjects: r.active_projects ?? 0,
    completedProjects: r.completed_projects ?? 0,
    avgRating: r.avg_rating ?? 0,
    avgEffort: r.avg_effort ?? 0,
    onTimeRate: r.on_time_rate ?? 0,
    tags: r.tags || [],
    onboardingNotes: r.onboarding_notes || '',
    aadhaar_image_url: r.aadhaar_image_url || undefined,
    kyc_declaration: r.kyc_declaration ?? false,
    isDeleted: r.is_deleted ?? false,
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
  };
}

// ── Client ───────────────────────────────────────────────────

export function clientToRow(c: Client): Record<string, any> {
  return {
    id: c.id,
    name: c.name,
    company: c.company || '',
    phone: c.phone || '',
    email: c.email || null,
    location: c.location || null,
    notes: c.notes || null,
    avatar: c.avatar || null,
    color: c.color || null,
    is_deleted: c.isDeleted ?? false,
    created_at: c.createdAt || new Date().toISOString(),
    updated_at: c.updatedAt ? new Date(c.updatedAt).toISOString() : new Date().toISOString(),
  };
}

export function rowToClient(r: Record<string, any>): Client {
  return {
    id: r.id,
    name: r.name || r.company || r.contact_person || '',
    company: r.company || '',
    phone: r.phone || '',
    email: r.email || undefined,
    location: r.location || undefined,
    notes: r.notes || undefined,
    avatar: r.avatar || '',
    color: r.color || '',
    createdAt: r.created_at || new Date().toISOString(),
    isDeleted: r.is_deleted ?? false,
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
  };
}

// ── PendingApproval ──────────────────────────────────────────

export function approvalToRow(a: PendingApproval): Record<string, any> {
  return {
    id: a.id,
    type: a.type,
    entity_type: a.entityType,
    entity_id: a.entityId,
    entity_title: a.entityTitle,
    changes: a.changes,
    requested_by: a.requestedBy,
    requested_by_email: a.requestedByEmail,
    requested_at: new Date(a.requestedAt).toISOString(),
    status: a.status,
  };
}

export function rowToApproval(r: Record<string, any>): PendingApproval {
  return {
    id: r.id,
    type: r.type,
    entityType: r.entity_type,
    entityId: r.entity_id,
    entityTitle: r.entity_title,
    changes: r.changes || {},
    requestedBy: r.requested_by,
    requestedByEmail: r.requested_by_email,
    requestedAt: r.requested_at ? new Date(r.requested_at).getTime() : Date.now(),
    status: r.status || 'pending',
  };
}
