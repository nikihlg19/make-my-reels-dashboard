import { useCallback, useEffect, type Dispatch, type SetStateAction, type MutableRefObject } from 'react';
import { Project, TeamMember, Client, PendingApproval } from '../../types';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { approvalToRow, rowToApproval } from '../utils/dbMappers';

export interface UseApprovalQueueArgs {
  pendingApprovals: PendingApproval[];
  setPendingApprovals: Dispatch<SetStateAction<PendingApproval[]>>;
  pendingApprovalsRef: MutableRefObject<PendingApproval[]>;
  projectsRef: MutableRefObject<Project[]>;
  teamRef: MutableRefObject<TeamMember[]>;
  clientsRef: MutableRefObject<Client[]>;
  updateProjects: (next: Project[], action?: string) => void;
  updateTeam: (next: TeamMember[], action?: string) => void;
  updateClients: (next: Client[], action?: string) => void;
  debouncedCommit: () => void;
  updateLocalTimestamp: () => void;
  currentUserName: string;
  currentUserEmail: string;
  isAdmin: boolean;
  projects: Project[];
  team: TeamMember[];
  clients: Client[];
}

export interface UseApprovalQueueReturn {
  queueForApproval: (approval: Omit<PendingApproval, 'id' | 'requestedAt' | 'status' | 'requestedBy' | 'requestedByEmail'>) => void;
  onCancelApproval: (approvalId: string) => void;
  handleApproveChange: (approvalId: string) => void;
  handleRejectChange: (approvalId: string) => void;
}

export const useApprovalQueue = ({
  pendingApprovals,
  setPendingApprovals,
  pendingApprovalsRef,
  updateProjects,
  updateTeam,
  updateClients,
  debouncedCommit,
  updateLocalTimestamp,
  currentUserName,
  currentUserEmail,
  projects,
  team,
  clients,
}: UseApprovalQueueArgs): UseApprovalQueueReturn => {

  // ── Load approvals from Supabase on mount ────────────────
  const loadApprovals = useCallback(async () => {
    const { data, error } = await supabase
      .from('pending_approvals')
      .select('*')
      .eq('status', 'pending')
      .order('requested_at', { ascending: false });

    if (!error && data) {
      const approvals = data.map(rowToApproval);
      setPendingApprovals(approvals);
      pendingApprovalsRef.current = approvals;
    }
  }, [supabase, setPendingApprovals, pendingApprovalsRef]);

  useEffect(() => {
    loadApprovals();

    // Real-time subscription for approval changes
    const channel = supabase
      .channel('approvals-watch')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pending_approvals' },
        () => loadApprovals()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadApprovals, supabase]);

  const queueForApproval = useCallback(async (approval: Omit<PendingApproval, 'id' | 'requestedAt' | 'status' | 'requestedBy' | 'requestedByEmail'>) => {
    const newApproval: PendingApproval = {
      ...approval,
      id: `APR_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      requestedBy: currentUserName,
      requestedByEmail: currentUserEmail,
      requestedAt: Date.now(),
      status: 'pending',
    };

    // Save to Supabase
    await supabase.from('pending_approvals').upsert(approvalToRow(newApproval));

    const next = [newApproval, ...pendingApprovals];
    setPendingApprovals(next);
    pendingApprovalsRef.current = next;
    toast.info("Change queued for Admin approval");

    updateLocalTimestamp();
    debouncedCommit();
  }, [pendingApprovals, setPendingApprovals, pendingApprovalsRef, currentUserName, currentUserEmail, updateLocalTimestamp, debouncedCommit]);

  const onCancelApproval = useCallback(async (approvalId: string) => {
    // Remove from Supabase
    await supabase.from('pending_approvals').delete().eq('id', approvalId);

    const next = pendingApprovals.filter(a => a.id !== approvalId);
    setPendingApprovals(next);
    pendingApprovalsRef.current = next;
    toast.success("Pending change cancelled");

    updateLocalTimestamp();
    debouncedCommit();
  }, [pendingApprovals, setPendingApprovals, pendingApprovalsRef, updateLocalTimestamp, debouncedCommit]);

  const handleApproveChange = useCallback(async (approvalId: string) => {
    const approval = pendingApprovals.find(a => a.id === approvalId);
    if (!approval) return;

    if (approval.type === 'delete') {
      if (approval.entityType === 'project') {
        const proj = projects.find(p => p.id === approval.entityId);
        updateProjects(projects.map(p => p.id === approval.entityId ? { ...p, isDeleted: true, updatedAt: Date.now() } : p), `Admin Approved Delete: ${proj?.title || approval.entityId}`);
      } else if (approval.entityType === 'team') {
        updateTeam(team.map(m => m.id === approval.entityId ? { ...m, isDeleted: true, updatedAt: Date.now() } : m), `Admin Approved Delete Team: ${approval.entityTitle}`);
      } else if (approval.entityType === 'client') {
        updateClients(clients.map(c => c.id === approval.entityId ? { ...c, isDeleted: true, updatedAt: Date.now() } : c), `Admin Approved Delete Client: ${approval.entityTitle}`);
      }
    } else if (approval.type === 'edit' || approval.type === 'statusChange') {
      const afterValues = Object.fromEntries(Object.entries(approval.changes).map(([k, v]) => [k, v.after]));
      if (approval.entityType === 'project') {
        updateProjects(projects.map(p => p.id === approval.entityId ? { ...p, ...afterValues, updatedAt: Date.now() } : p), `Admin Approved Edit: ${approval.entityTitle}`);
      } else if (approval.entityType === 'team') {
        updateTeam(team.map(m => m.id === approval.entityId ? { ...m, ...afterValues, updatedAt: Date.now() } : m), `Admin Approved Edit Team: ${approval.entityTitle}`);
      } else if (approval.entityType === 'client') {
        updateClients(clients.map(c => c.id === approval.entityId ? { ...c, ...afterValues, updatedAt: Date.now() } : c), `Admin Approved Edit Client: ${approval.entityTitle}`);
      }
    } else if (approval.type === 'create') {
      const afterValues = Object.fromEntries(Object.entries(approval.changes).map(([k, v]) => [k, v.after]));
      if (approval.entityType === 'project') {
        updateProjects([{ ...afterValues as any, updatedAt: Date.now() }, ...projects], `Admin Approved Create: ${approval.entityTitle}`);
      } else if (approval.entityType === 'team') {
        updateTeam([...team, { ...afterValues as any, updatedAt: Date.now() }], `Admin Approved Create Team: ${approval.entityTitle}`);
      } else if (approval.entityType === 'client') {
        updateClients([{ ...afterValues as any, updatedAt: Date.now() }, ...clients], `Admin Approved Create Client: ${approval.entityTitle}`);
      }
    }

    // Update status in Supabase
    await supabase.from('pending_approvals').update({ status: 'approved' }).eq('id', approvalId);
    setPendingApprovals(prev => prev.map(a => a.id === approvalId ? { ...a, status: 'approved' } : a));
  }, [pendingApprovals, projects, team, clients, updateProjects, updateTeam, updateClients, setPendingApprovals]);

  const handleRejectChange = useCallback(async (approvalId: string) => {
    await supabase.from('pending_approvals').update({ status: 'rejected' }).eq('id', approvalId);
    setPendingApprovals(prev => prev.map(a => a.id === approvalId ? { ...a, status: 'rejected' } : a));
  }, [setPendingApprovals]);

  return { queueForApproval, onCancelApproval, handleApproveChange, handleRejectChange };
};
