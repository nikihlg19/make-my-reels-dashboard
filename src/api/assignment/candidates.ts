/**
 * POST /api/assignment/candidates
 * Auth: Clerk JWT
 *
 * Returns a ranked list of eligible team members for a given project + role.
 * Uses real Google Maps distance data. Persists candidates to assignment_candidates table.
 *
 * Body: { projectId, roleNeeded, assignmentGroupId? }
 */

import { createClient } from '@supabase/supabase-js';
import { rankCandidates } from '../../utils/candidateRanking';
import type { TeamMember, Project, TeamAvailability, ProjectAssignment } from '../../../types';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fetchDistance(origin: string, destination: string): Promise<number | undefined> {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey || !origin || !destination) return undefined;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${apiKey}`
    );
    const data = await res.json();
    if (data.status === 'OK' && data.rows?.[0]?.elements?.[0]?.status === 'OK') {
      return data.rows[0].elements[0].distance.value / 1000; // metres → km
    }
  } catch { /* ignore */ }
  return undefined;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { verifyAdmin } = await import('../../utils/apiAuth');
  const admin = await verifyAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Forbidden: admin access required' });

  const { projectId, roleNeeded, assignmentGroupId } = req.body || {};
  if (!projectId || !roleNeeded) {
    return res.status(400).json({ error: 'projectId and roleNeeded are required' });
  }

  // Fetch all data in parallel
  const [
    { data: project },
    { data: members },
    { data: availabilityRows },
    { data: assignmentRows },
  ] = await Promise.all([
    supabaseAdmin.from('projects').select('*').eq('id', projectId).single(),
    supabaseAdmin.from('team_members').select('*').eq('is_deleted', false),
    supabaseAdmin.from('team_availability').select('*'),
    supabaseAdmin.from('project_assignments').select('*').neq('status', 'cancelled'),
  ]);

  if (!project) return res.status(404).json({ error: 'Project not found' });

  const teamMembers: TeamMember[] = (members || []).map((m: any) => ({
    id: m.id, name: m.name, role: m.role, phone: m.phone,
    location: m.location, avatar: m.avatar, color: m.color,
    activeProjects: m.active_projects, completedProjects: m.completed_projects,
    avgRating: m.avg_rating, avgEffort: m.avg_effort, onTimeRate: m.on_time_rate,
    tags: m.tags || [],
  }));

  const projectData: Project = {
    id: project.id, title: project.title, description: project.description || '',
    location: project.location || '', priority: project.priority,
    tags: project.tags || [], teamMemberIds: project.team_member_ids || [],
    eventDate: project.event_date, eventTime: project.event_time,
    dueDate: project.due_date || '', status: project.status,
    progress: project.progress || 0,
  };

  const allProjects: Project[] = [projectData]; // simplified — enough for conflict detection
  const allAvailability: TeamAvailability[] = (availabilityRows || []).map((a: any) => ({
    id: a.id, teamMemberId: a.team_member_id,
    unavailableFrom: a.unavailable_from, unavailableTo: a.unavailable_to, reason: a.reason,
  }));
  const allAssignments: ProjectAssignment[] = (assignmentRows || []).map((a: any) => ({
    id: a.id, projectId: a.project_id, teamMemberId: a.team_member_id,
    roleNeeded: a.role_needed, status: a.status, respondedAt: a.responded_at,
    attemptNumber: a.attempt_number, assignmentGroupId: a.assignment_group_id,
    createdBy: a.created_by, createdAt: a.created_at,
  }));

  // Fetch distances in parallel (capped at 10 to save API quota)
  const membersWithLocation = teamMembers.filter(m => m.location).slice(0, 10);
  const distanceMap: Record<string, number> = {};

  if (project.location) {
    await Promise.allSettled(
      membersWithLocation.map(async m => {
        const km = await fetchDistance(m.location!, project.location);
        if (km !== undefined) distanceMap[m.id] = km;
      })
    );
  }

  // Rank all members
  const ranked = rankCandidates(
    teamMembers, roleNeeded, project.event_date,
    project.location || '', allProjects, allAvailability, allAssignments, distanceMap
  );

  // Persist to assignment_candidates (upsert by group+member)
  const groupId = assignmentGroupId || crypto.randomUUID();
  const candidateRows = ranked.map((r, idx) => ({
    assignment_group_id: groupId,
    project_id: projectId,
    team_member_id: r.member.id,
    role_needed: roleNeeded,
    rank_position: idx + 1,
    score: r.score,
    score_breakdown: r.breakdown,
    distance_km: distanceMap[r.member.id] ?? null,
    is_available: r.isAvailable,
    was_attempted: allAssignments.some(a =>
      a.assignmentGroupId === groupId && a.teamMemberId === r.member.id
    ),
  }));

  // Delete old candidates for this group+role, then insert fresh
  await supabaseAdmin
    .from('assignment_candidates')
    .delete()
    .eq('assignment_group_id', groupId);
  await supabaseAdmin.from('assignment_candidates').insert(candidateRows);

  return res.status(200).json({
    assignmentGroupId: groupId,
    candidates: ranked.map((r, idx) => ({
      rankPosition: idx + 1,
      score: r.score,
      breakdown: r.breakdown,
      isAvailable: r.isAvailable,
      distanceKm: distanceMap[r.member.id],
      member: {
        id: r.member.id, name: r.member.name, role: r.member.role,
        color: r.member.color, avatar: r.member.avatar, location: r.member.location,
        avgRating: r.member.avgRating, activeProjects: r.member.activeProjects,
        tags: r.member.tags,
      },
    })),
  });
}
