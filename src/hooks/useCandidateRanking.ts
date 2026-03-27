import { useState, useCallback } from 'react';
import { useSession } from '@clerk/react';

export interface RankedCandidate {
  rankPosition: number;
  score: number;
  isAvailable: boolean;
  distanceKm?: number;
  breakdown: {
    distance: number;
    availability: number;
    rating: number;
    workload: number;
    skills: number;
    recentDecline: number;
  };
  member: {
    id: string;
    name: string;
    role: string | string[];
    color: string;
    avatar: string;
    location?: string;
    avgRating: number;
    activeProjects: number;
    tags?: string[];
  };
}

interface UseCandidateRankingResult {
  candidates: RankedCandidate[];
  assignmentGroupId: string | null;
  loading: boolean;
  error: string | null;
  fetchCandidates: (projectId: string, roleNeeded: string, existingGroupId?: string) => Promise<void>;
}

export function useCandidateRanking(): UseCandidateRankingResult {
  const { session } = useSession();
  const [candidates, setCandidates] = useState<RankedCandidate[]>([]);
  const [assignmentGroupId, setAssignmentGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCandidates = useCallback(async (
    projectId: string,
    roleNeeded: string,
    existingGroupId?: string,
  ) => {
    if (!session) return;
    setLoading(true);
    setError(null);

    try {
      const token = await session.getToken();
      const res = await fetch('/api/assignment/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectId, roleNeeded, assignmentGroupId: existingGroupId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch candidates');
      setCandidates(data.candidates || []);
      setAssignmentGroupId(data.assignmentGroupId || null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [session]);

  return { candidates, assignmentGroupId, loading, error, fetchCandidates };
}
