import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@clerk/react';
import { createClerkSupabaseClient } from '../lib/supabase';
import { ProjectAssignment, AssignmentStatus } from '../../types';

interface UseAssignmentsResult {
  assignments: ProjectAssignment[];
  loading: boolean;
  error: string | null;
  sendRequest: (projectId: string, teamMemberId: string, roleNeeded: string) => Promise<{ success: boolean; error?: string }>;
  cancelAssignment: (assignmentId: string) => Promise<{ success: boolean; error?: string }>;
  getAssignmentsForProject: (projectId: string) => ProjectAssignment[];
  getLatestAssignmentForMember: (projectId: string, teamMemberId: string) => ProjectAssignment | undefined;
}

/** Maps snake_case DB row to camelCase ProjectAssignment */
function mapRow(row: any): ProjectAssignment {
  return {
    id: row.id,
    projectId: row.project_id,
    teamMemberId: row.team_member_id,
    roleNeeded: row.role_needed,
    status: row.status as AssignmentStatus,
    whatsappMessageId: row.whatsapp_message_id,
    sentAt: row.sent_at,
    respondedAt: row.responded_at,
    declineReason: row.decline_reason,
    attemptNumber: row.attempt_number,
    assignmentGroupId: row.assignment_group_id,
    autoExpireAt: row.auto_expire_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function useAssignments(projectIds?: string[]): UseAssignmentsResult {
  const { session } = useSession();
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = session ? createClerkSupabaseClient(session) : null;

  const fetchAssignments = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);

    let query = supabase
      .from('project_assignments')
      .select('*')
      .not('status', 'in', '("cancelled")')
      .order('created_at', { ascending: false });

    if (projectIds && projectIds.length > 0) {
      query = query.in('project_id', projectIds);
    }

    const { data, error: fetchErr } = await query;
    if (fetchErr) {
      setError(fetchErr.message);
    } else {
      setAssignments((data || []).map(mapRow));
    }
    setLoading(false);
  }, [session, projectIds?.join(',')]);

  useEffect(() => {
    fetchAssignments();

    if (!supabase) return;

    // Real-time subscription
    const channel = supabase
      .channel('project_assignments_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_assignments' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setAssignments(prev => [mapRow(payload.new), ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setAssignments(prev =>
              prev.map(a => a.id === payload.new.id ? mapRow(payload.new) : a)
            );
          } else if (payload.eventType === 'DELETE') {
            setAssignments(prev => prev.filter(a => a.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchAssignments]);

  const sendRequest = useCallback(async (
    projectId: string,
    teamMemberId: string,
    roleNeeded: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!session) return { success: false, error: 'Not authenticated' };
    const token = await session.getToken();

    const res = await fetch('/api/assignment/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ projectId, teamMemberId, roleNeeded }),
    });

    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || 'Request failed' };
    return { success: true };
  }, [session]);

  const cancelAssignment = useCallback(async (
    assignmentId: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!session) return { success: false, error: 'Not authenticated' };
    const token = await session.getToken();

    const res = await fetch('/api/assignment/cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ assignmentId }),
    });

    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || 'Cancel failed' };
    return { success: true };
  }, [session]);

  const getAssignmentsForProject = useCallback(
    (projectId: string) => assignments.filter(a => a.projectId === projectId),
    [assignments]
  );

  const getLatestAssignmentForMember = useCallback(
    (projectId: string, teamMemberId: string) =>
      assignments.find(a => a.projectId === projectId && a.teamMemberId === teamMemberId),
    [assignments]
  );

  return {
    assignments,
    loading,
    error,
    sendRequest,
    cancelAssignment,
    getAssignmentsForProject,
    getLatestAssignmentForMember,
  };
}
