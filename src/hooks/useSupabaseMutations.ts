/**
 * useSupabaseMutations — replaces useCloudCommit
 *
 * Writes projects, team members, clients directly to Supabase.
 * Also logs audit entries to audit_logs table.
 * Maintains the same API surface so App.tsx can swap with minimal changes.
 */

import { useState, useCallback, useRef, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import { supabase } from '../lib/supabase';
import { projectToRow, teamMemberToRow, clientToRow } from '../utils/dbMappers';
import type { Project, TeamMember, Client, PendingApproval } from '../../types';

export interface UseSupabaseMutationsArgs {
  projectsRef: MutableRefObject<Project[]>;
  teamRef: MutableRefObject<TeamMember[]>;
  clientsRef: MutableRefObject<Client[]>;
  pendingApprovalsRef: MutableRefObject<PendingApproval[]>;
  setProjects: Dispatch<SetStateAction<Project[]>>;
  setTeam: Dispatch<SetStateAction<TeamMember[]>>;
  setClients: Dispatch<SetStateAction<Client[]>>;
  setLastLocalUpdate: Dispatch<SetStateAction<number>>;
  currentUserName: string;
  currentUserEmail: string;
  isAdmin: boolean;
  projects: Project[];
  team: TeamMember[];
  clients: Client[];
}

export interface UseSupabaseMutationsReturn {
  debouncedCommit: () => void;
  updateProjects: (next: Project[], action?: string, fields?: string) => void;
  updateTeam: (next: TeamMember[], action?: string) => void;
  updateClients: (next: Client[], action?: string) => void;
  updateLocalTimestamp: () => void;
  isSaving: boolean;
  testConnection: () => Promise<void>;
  testStatus: 'idle' | 'testing' | 'success' | 'failed';
  handleExcelImport: (data: { projects: Project[]; team: TeamMember[]; clients: Client[] }) => void;
  handleForcePush: () => void;
  lastActionRef: MutableRefObject<string>;
}

export const useSupabaseMutations = ({
  projectsRef,
  teamRef,
  clientsRef,
  pendingApprovalsRef,
  setProjects,
  setTeam,
  setClients,
  setLastLocalUpdate,
  currentUserName,
  currentUserEmail,
  isAdmin,
  projects,
  team,
  clients,
}: UseSupabaseMutationsArgs): UseSupabaseMutationsReturn => {
  const [isSaving, setIsSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');

  const lastActionRef = useRef<string>('Initial Sync');
  const lastFieldsRef = useRef<string>('');

  const updateLocalTimestamp = useCallback(() => {
    const now = Date.now();
    setLastLocalUpdate(now);
    localStorage.setItem('mmr_last_local_update', String(now));
  }, [setLastLocalUpdate]);

  // ── Log audit entry ──────────────────────────────────────
  const logAudit = useCallback(async (action: string, fields: string = '') => {
    try {
      await supabase.from('audit_logs').insert({
        user_name: currentUserName,
        user_email: currentUserEmail,
        action,
        fields: fields || null,
        is_admin: isAdmin,
      });
    } catch (e) {
      console.warn('[audit] log failed:', e);
    }
  }, [currentUserName, currentUserEmail, isAdmin]);

  // ── Sync all entities to Supabase ────────────────────────
  const syncToSupabase = useCallback(async (
    p: Project[],
    t: TeamMember[],
    c: Client[],
  ) => {
    setIsSaving(true);
    try {
      // Cache to localStorage for offline fallback
      try {
        localStorage.setItem('mmr_projects', JSON.stringify(p));
        localStorage.setItem('mmr_team', JSON.stringify(t));
        localStorage.setItem('mmr_clients', JSON.stringify(c));
      } catch { /* quota exceeded */ }

      // Upsert projects
      if (p.length > 0) {
        const rows = p.map(projectToRow);
        const { error } = await supabase
          .from('projects')
          .upsert(rows, { onConflict: 'id' });
        if (error) console.error('[sync] projects upsert error:', error);
      }

      // Upsert team members
      if (t.length > 0) {
        const rows = t.map(teamMemberToRow);
        const { error } = await supabase
          .from('team_members')
          .upsert(rows, { onConflict: 'id' });
        if (error) console.error('[sync] team upsert error:', error);
      }

      // Upsert clients
      if (c.length > 0) {
        const rows = c.map(clientToRow);
        const { error } = await supabase
          .from('clients')
          .upsert(rows, { onConflict: 'id' });
        if (error) console.error('[sync] clients upsert error:', error);
      }

      // Log the action
      await logAudit(lastActionRef.current, lastFieldsRef.current);

      lastActionRef.current = 'Auto-sync';
    } catch (e) {
      console.error('[sync] failed:', e);
    } finally {
      setTimeout(() => setIsSaving(false), 500);
    }
  }, [logAudit]);

  // ── Debounced commit (same 2s delay as old GAS approach) ─
  const pendingCommitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedCommit = useCallback(() => {
    if (pendingCommitRef.current) clearTimeout(pendingCommitRef.current);
    pendingCommitRef.current = setTimeout(() => {
      syncToSupabase(projectsRef.current, teamRef.current, clientsRef.current);
    }, 2000);
  }, [syncToSupabase, projectsRef, teamRef, clientsRef]);

  // ── Entity updaters (same API as useCloudCommit) ─────────
  const updateProjects = useCallback((next: Project[], action: string = 'Updated Projects', fields: string = '') => {
    lastActionRef.current = action;
    lastFieldsRef.current = fields;
    updateLocalTimestamp();
    setProjects(next);
    debouncedCommit();
  }, [updateLocalTimestamp, setProjects, debouncedCommit]);

  const updateTeam = useCallback((next: TeamMember[], action: string = 'Updated Team') => {
    lastActionRef.current = action;
    updateLocalTimestamp();
    setTeam(next);
    debouncedCommit();
  }, [updateLocalTimestamp, setTeam, debouncedCommit]);

  const updateClients = useCallback((next: Client[], action: string = 'Updated Clients') => {
    lastActionRef.current = action;
    updateLocalTimestamp();
    setClients(next);
    debouncedCommit();
  }, [updateLocalTimestamp, setClients, debouncedCommit]);

  // ── Excel/Bulk import ────────────────────────────────────
  const handleExcelImport = useCallback((data: { projects: Project[]; team: TeamMember[]; clients: Client[] }) => {
    updateLocalTimestamp();
    const stampedProjects = data.projects.map(p => ({ ...p, updatedAt: Date.now() }));
    const stampedTeam = data.team.map(t => ({ ...t, updatedAt: Date.now() }));
    const stampedClients = data.clients.map(c => ({ ...c, updatedAt: Date.now() }));

    setProjects(stampedProjects);
    setTeam(stampedTeam);
    setClients(stampedClients);
    lastActionRef.current = 'Excel Import';
    syncToSupabase(stampedProjects, stampedTeam, stampedClients);
  }, [syncToSupabase, updateLocalTimestamp, setProjects, setTeam, setClients]);

  // ── Force push (overwrite Supabase with local state) ─────
  const handleForcePush = useCallback(() => {
    if (projects.length === 0 && team.length === 0 && clients.length === 0) {
      alert('Cannot Push: Your local database is empty.');
      return;
    }
    const confirmed = confirm(
      'FORCE PUSH: This will overwrite Supabase with your current local data. Are you sure?'
    );
    if (confirmed) {
      updateLocalTimestamp();
      lastActionRef.current = 'Force Push';
      syncToSupabase(projects, team, clients);
    }
  }, [projects, team, clients, syncToSupabase, updateLocalTimestamp]);

  // ── Test connection ──────────────────────────────────────
  const testConnection = useCallback(async () => {
    setTestStatus('testing');
    try {
      const { error } = await supabase.from('projects').select('id').limit(1);
      if (error) throw error;
      setTestStatus('success');
      setTimeout(() => setTestStatus('idle'), 3000);
    } catch {
      setTestStatus('failed');
      setTimeout(() => setTestStatus('idle'), 3000);
    }
  }, []);

  return {
    debouncedCommit,
    updateProjects,
    updateTeam,
    updateClients,
    updateLocalTimestamp,
    isSaving,
    testConnection,
    testStatus,
    handleExcelImport,
    handleForcePush,
    lastActionRef,
  };
};
