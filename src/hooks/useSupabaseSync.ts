/**
 * useSupabaseSync — replaces useSheetSync
 *
 * Loads projects, team members, clients from Supabase on mount,
 * then subscribes to real-time changes so the UI updates instantly.
 * Falls back to localStorage for offline resilience.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { rowToProject, rowToTeamMember, rowToClient } from '../utils/dbMappers';
import type { Project, TeamMember, Client } from '../../types';

interface UseSupabaseSyncParams {
  projectsRef: React.MutableRefObject<Project[]>;
  teamRef: React.MutableRefObject<TeamMember[]>;
  clientsRef: React.MutableRefObject<Client[]>;
  setProjects: (p: Project[]) => void;
  setTeam: (t: TeamMember[]) => void;
  setClients: (c: Client[]) => void;
}

export function useSupabaseSync({
  projectsRef,
  teamRef,
  clientsRef,
  setProjects,
  setTeam,
  setClients,
}: UseSupabaseSyncParams) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [teamRoles, setTeamRoles] = useState<string[]>([]);
  const hasFetched = useRef(false);

  // ── Initial fetch ────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setIsSyncing(true);
    setLastSyncError(null);

    try {
      const [projectsRes, teamRes, clientsRes, rolesRes] = await Promise.all([
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
        supabase.from('team_members').select('*').order('name'),
        supabase.from('clients').select('*').order('created_at', { ascending: false }),
        supabase.from('team_roles').select('role_name').order('role_name'),
      ]);

      if (projectsRes.error) throw projectsRes.error;
      if (teamRes.error) throw teamRes.error;
      if (clientsRes.error) throw clientsRes.error;

      const projects = (projectsRes.data || []).map(rowToProject);
      const team = (teamRes.data || []).map(rowToTeamMember);
      const clients = (clientsRes.data || []).map(rowToClient);
      if (rolesRes.error) console.warn('[supabaseSync] team_roles fetch failed:', rolesRes.error.message);
      const roles = (rolesRes.data || []).map((r: any) => r.role_name);

      setProjects(projects);
      setTeam(team);
      setClients(clients);
      setTeamRoles(roles.length > 0 ? roles : [
        'Videographer', 'Photographer', 'Editor', 'Drone Operator',
        'Reel Maker', 'Anchor', 'Assistant', 'Makeup Artist',
      ]);

      // Cache to localStorage for offline fallback
      try {
        localStorage.setItem('mmr_projects', JSON.stringify(projects));
        localStorage.setItem('mmr_team', JSON.stringify(team));
        localStorage.setItem('mmr_clients', JSON.stringify(clients));
      } catch { /* quota exceeded — ignore */ }

      setLastSyncedTime(new Date().toLocaleTimeString());
    } catch (err: any) {
      console.error('[supabaseSync] fetch error:', err);
      setLastSyncError(err.message || 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }, [setProjects, setTeam, setClients]);

  // ── Real-time subscriptions ──────────────────────────────
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchAll();

    // Subscribe to real-time changes
    const channel = supabase
      .channel('db-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newProject = rowToProject(payload.new);
            const current = projectsRef.current;
            if (!current.find(p => p.id === newProject.id)) {
              setProjects([newProject, ...current]);
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = rowToProject(payload.new);
            setProjects(
              projectsRef.current.map(p => p.id === updated.id ? updated : p)
            );
          } else if (payload.eventType === 'DELETE') {
            setProjects(
              projectsRef.current.filter(p => p.id !== payload.old.id)
            );
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_members' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newMember = rowToTeamMember(payload.new);
            const current = teamRef.current;
            if (!current.find(m => m.id === newMember.id)) {
              setTeam([...current, newMember]);
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = rowToTeamMember(payload.new);
            setTeam(
              teamRef.current.map(m => m.id === updated.id ? updated : m)
            );
          } else if (payload.eventType === 'DELETE') {
            setTeam(
              teamRef.current.filter(m => m.id !== payload.old.id)
            );
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clients' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newClient = rowToClient(payload.new);
            const current = clientsRef.current;
            if (!current.find(c => c.id === newClient.id)) {
              setClients([newClient, ...current]);
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = rowToClient(payload.new);
            setClients(
              clientsRef.current.map(c => c.id === updated.id ? updated : c)
            );
          } else if (payload.eventType === 'DELETE') {
            setClients(
              clientsRef.current.filter(c => c.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAll, projectsRef, teamRef, clientsRef, setProjects, setTeam, setClients]);

  // Refetch on tab visibility (handles returning from sleep/background)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchAll();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchAll]);

  return {
    teamRoles,
    isSyncing,
    lastSyncedTime,
    lastSyncError,
    refetch: fetchAll,
  };
}
