/**
 * Candidate ranking algorithm — shared between client and server.
 *
 * SCORE (0–100) = weighted sum of 6 sub-scores (each normalised 0–1):
 *   25% Distance     — proximity to shoot location
 *   20% Availability — no conflicting shoots / not blocked
 *   20% Rating       — historical avg rating (0–5 → 0–1)
 *   15% Workload     — fewer active projects is better
 *   15% Skills       — role match + tag match
 *    5% Recent Decline penalty — -0.5 if declined in last 7 days
 */

import type { TeamMember, Project, TeamAvailability, ProjectAssignment, ScoreBreakdown } from '../../types';

export interface RankInput {
  member: TeamMember;
  roleNeeded: string;
  shootDate: string;
  shootLocation: string;
  allProjects: Project[];
  allAvailability: TeamAvailability[];
  allAssignments: ProjectAssignment[];
  /** Distance in km (undefined = not yet fetched; use 0.5 as neutral score) */
  distanceKm?: number;
}

// ─── sub-scores ─────────────────────────────────────────────

function distanceScore(distanceKm: number | undefined): number {
  if (distanceKm === undefined) return 0.5; // neutral when unknown
  return Math.max(0, 1 - distanceKm / 100);
}

function availabilityScore(
  member: TeamMember,
  shootDate: string,
  shootLocation: string,
  allProjects: Project[],
  allAvailability: TeamAvailability[],
): number {
  // Check explicit blocked dates
  const blocked = allAvailability.some(a => {
    if (a.teamMemberId !== member.id) return false;
    return shootDate >= a.unavailableFrom && shootDate <= a.unavailableTo;
  });
  if (blocked) return 0;

  // Check conflicting shoots on same date
  const sameDay = allProjects.filter(p =>
    p.eventDate === shootDate &&
    p.teamMemberIds.includes(member.id) &&
    p.status !== 'Completed' &&
    p.status !== 'Expired'
  );

  if (sameDay.length === 0) return 1.0;
  // Same location (back-to-back feasible) → partial
  const allSameLocation = sameDay.every(p => p.location === shootLocation);
  return allSameLocation ? 0.5 : 0.0;
}

function ratingScore(member: TeamMember): number {
  if (!member.avgRating || member.avgRating === 0) return 0.5; // unknown → neutral
  return Math.min(member.avgRating / 5, 1);
}

function workloadScore(member: TeamMember): number {
  const active = member.activeProjects ?? 0;
  return Math.max(0, 1 - active / 5);
}

function skillsScore(member: TeamMember, roleNeeded: string): number {
  const memberRoles = Array.isArray(member.role) ? member.role : [member.role];
  const roleMatch = memberRoles.some(r => r.toLowerCase() === roleNeeded.toLowerCase());
  let score = roleMatch ? 0.7 : 0.1;

  // Tag bonus (up to +0.3)
  const roleTags: Record<string, string[]> = {
    videographer: ['4k', 'drone', 'wedding', 'cinematic', 'reels'],
    photographer: ['portrait', 'wedding', 'product', 'event'],
    editor: ['premiere', 'aftereffects', 'reels', 'color', 'grading'],
  };
  const relevantTags = roleTags[roleNeeded.toLowerCase()] || [];
  const memberTags = (member.tags || []).map(t => t.toLowerCase());
  const tagMatches = relevantTags.filter(t => memberTags.includes(t)).length;
  score += Math.min(tagMatches * 0.1, 0.3);

  return Math.min(score, 1);
}

function recentDeclinePenalty(
  member: TeamMember,
  allAssignments: ProjectAssignment[],
): number {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recentDecline = allAssignments.some(a =>
    a.teamMemberId === member.id &&
    a.status === 'declined' &&
    (a.respondedAt || '') >= sevenDaysAgo
  );
  return recentDecline ? -0.5 : 0;
}

// ─── main ranking function ───────────────────────────────────

export function scoreMember(input: RankInput): { score: number; breakdown: ScoreBreakdown } {
  const {
    member, roleNeeded, shootDate, shootLocation,
    allProjects, allAvailability, allAssignments, distanceKm,
  } = input;

  const d = distanceScore(distanceKm);
  const a = availabilityScore(member, shootDate, shootLocation, allProjects, allAvailability);
  const r = ratingScore(member);
  const w = workloadScore(member);
  const s = skillsScore(member, roleNeeded);
  const penalty = recentDeclinePenalty(member, allAssignments);

  const raw = 0.25 * d + 0.20 * a + 0.20 * r + 0.15 * w + 0.15 * s + 0.05 * penalty;
  const score = Math.max(0, Math.min(100, Math.round(raw * 100)));

  return {
    score,
    breakdown: {
      distance: Math.round(d * 100) / 100,
      availability: Math.round(a * 100) / 100,
      rating: Math.round(r * 100) / 100,
      workload: Math.round(w * 100) / 100,
      skills: Math.round(s * 100) / 100,
      recentDecline: penalty,
    },
  };
}

export function rankCandidates(
  members: TeamMember[],
  roleNeeded: string,
  shootDate: string,
  shootLocation: string,
  allProjects: Project[],
  allAvailability: TeamAvailability[],
  allAssignments: ProjectAssignment[],
  distanceMap: Record<string, number> = {},
): Array<{ member: TeamMember; score: number; breakdown: ScoreBreakdown; isAvailable: boolean }> {
  return members
    .map(member => {
      const distanceKm = distanceMap[member.id];
      const { score, breakdown } = scoreMember({
        member, roleNeeded, shootDate, shootLocation,
        allProjects, allAvailability, allAssignments, distanceKm,
      });
      const isAvailable = breakdown.availability > 0;
      return { member, score, breakdown, isAvailable };
    })
    .sort((a, b) => b.score - a.score);
}
