import { useState, useCallback, useRef, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import { Project, TeamMember, Client, PendingApproval } from '../../types';

export interface UseCloudCommitArgs {
  scriptUrl: string;
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
  setShowSyncModal: Dispatch<SetStateAction<boolean>>;
}

export interface UseCloudCommitReturn {
  commitToCloud: (p: Project[], t: TeamMember[], c: Client[], pa: PendingApproval[]) => Promise<void>;
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

export const useCloudCommit = ({
  scriptUrl,
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
  setShowSyncModal,
}: UseCloudCommitArgs): UseCloudCommitReturn => {
  const [isSaving, setIsSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  const lastActionRef = useRef<string>("Initial Sync / Bulk Update");
  const lastFieldsRef = useRef<string>("");

  const toIST = () => {
    const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    return ist.toISOString().replace('T', ' ').replace('Z', ' IST');
  };

  const updateLocalTimestamp = useCallback(() => {
    const now = Date.now();
    setLastLocalUpdate(now);
    localStorage.setItem('mmr_last_local_update', String(now));
  }, [setLastLocalUpdate]);

  const commitToCloud = useCallback(async (p: Project[], t: TeamMember[], c: Client[], pa: PendingApproval[]) => {
    try {
      localStorage.setItem('mmr_projects', JSON.stringify(p));
      localStorage.setItem('mmr_team', JSON.stringify(t));
      localStorage.setItem('mmr_clients', JSON.stringify(c));
    } catch (e) {
      console.warn("LocalStorage quota exceeded. Changes saved in memory only.", e);
    }

    if (scriptUrl) {
      try {
        const parsed = new URL(scriptUrl);
        if (parsed.hostname !== 'script.google.com') {
          console.warn("Invalid script URL: hostname must be script.google.com");
          return;
        }
      } catch {
        console.warn("Invalid script URL format.");
        return;
      }

      setIsSaving(true);
      try {
        const payload = {
          action: lastActionRef.current,
          projects: p.map(proj => {
            const client = c.find(client => client.id === proj.clientId);
            return {
              ID: proj.id,
              Title: proj.title,
              Status: proj.status,
              Priority: proj.priority,
              ShootDate: proj.eventDate,
              ShootTime: proj.eventTime || '',
              Deadline: proj.submissionDeadline || '',
              DueDate: proj.dueDate,
              Progress: proj.progress,
              Rating: proj.rating,
              Budget: proj.budget,
              Expenses: proj.expenses,
              Location: proj.location,
              Description: proj.description,
              Notes: proj.notes,
              ClientID: proj.clientId,
              ClientIDs: (proj.clientIds || []).join(', '),
              ClientName: client ? client.company : '',
              Dependencies: (proj.dependencies || []).join(', '),
              Tags: proj.tags.join(', '),
              TeamMemberIDs: proj.teamMemberIds.join(', '),
              InstagramLinks: JSON.stringify(proj.instaLinks || []),
              IsOverdue: proj.isOverdue,
              UpdatedAt: proj.updatedAt || Date.now(),
              IsDeleted: proj.isDeleted || false
            };
          }),
          team: t.map(tm => ({
            ID: tm.id,
            Name: tm.name,
            Roles: Array.isArray(tm.role) ? tm.role.join(', ') : tm.role,
            Phone: tm.phone,
            Location: tm.location || '',
            Avatar: tm.avatar,
            Color: tm.color,
            ActiveCount: tm.activeProjects,
            CompletedCount: tm.completedProjects,
            AvgRating: tm.avgRating,
            AvgEffort: tm.avgEffort,
            OnTimeRate: tm.onTimeRate,
            Tags: (tm.tags || []).join(', '),
            OnboardingNotes: tm.onboardingNotes,
            AadhaarImageUrl: tm.aadhaar_image_url,
            KYCDeclaration: tm.kyc_declaration,
            UpdatedAt: tm.updatedAt || Date.now(),
            IsDeleted: tm.isDeleted || false
          })),
          clients: c.map(cl => ({
            ID: cl.id,
            Name: cl.name,
            Company: cl.company,
            Phone: cl.phone,
            Email: cl.email,
            Notes: cl.notes,
            Avatar: cl.avatar,
            Color: cl.color,
            CreatedAt: cl.createdAt,
            UpdatedAt: cl.updatedAt || Date.now(),
            IsDeleted: cl.isDeleted || false
          })),
          pendingApprovals: pa.filter(a => a.status === 'pending').map(a => ({
            ID: a.id,
            Type: a.type,
            EntityType: a.entityType,
            EntityID: a.entityId,
            EntityTitle: a.entityTitle,
            Changes: JSON.stringify(a.changes),
            RequestedBy: a.requestedBy,
            RequestedByEmail: a.requestedByEmail,
            RequestedAt: a.requestedAt,
            Status: a.status
          })),
          logEntry: {
            Timestamp: toIST(),
            User: currentUserName,
            UserEmail: currentUserEmail,
            Action: lastActionRef.current,
            Fields: lastFieldsRef.current,
            IsAdmin: isAdmin
          },
          secret: import.meta.env.VITE_CRON_SECRET || ''
        };

        const body = JSON.stringify(payload);

        await fetch(scriptUrl, {
          method: 'POST',
          mode: 'no-cors',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain' },
          body: body
        });

        console.log("Sent update to Google Sheet");
        setLastSyncError(null);
        lastActionRef.current = "Auto-sync";
      } catch (e) {
        console.error("Google Script Sync failed:", e);
        setLastSyncError(e instanceof Error ? e.message : "Network Error");
      } finally {
        setTimeout(() => setIsSaving(false), 1000);
      }
    }
  }, [scriptUrl, currentUserName, currentUserEmail, isAdmin]);

  // Debounce logic for cloud commits
  const pendingCommitRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedCommit = useCallback(() => {
    if (pendingCommitRef.current) clearTimeout(pendingCommitRef.current);
    pendingCommitRef.current = setTimeout(() => {
      commitToCloud(projectsRef.current, teamRef.current, clientsRef.current, pendingApprovalsRef.current);
    }, 2000);
  }, [commitToCloud, projectsRef, teamRef, clientsRef, pendingApprovalsRef]);

  const updateProjects = useCallback((next: Project[], action: string = "Updated Projects", fields: string = "") => {
    lastActionRef.current = action;
    lastFieldsRef.current = fields;
    updateLocalTimestamp();
    setProjects(next);
    debouncedCommit();
  }, [updateLocalTimestamp, setProjects, debouncedCommit]);

  const updateTeam = useCallback((next: TeamMember[], action: string = "Updated Team") => {
    lastActionRef.current = action;
    updateLocalTimestamp();
    setTeam(next);
    debouncedCommit();
  }, [updateLocalTimestamp, setTeam, debouncedCommit]);

  const updateClients = useCallback((next: Client[], action: string = "Updated Clients") => {
    lastActionRef.current = action;
    updateLocalTimestamp();
    setClients(next);
    debouncedCommit();
  }, [updateLocalTimestamp, setClients, debouncedCommit]);

  const handleExcelImport = useCallback((data: { projects: Project[]; team: TeamMember[]; clients: Client[] }) => {
    updateLocalTimestamp();
    const stampedProjects = data.projects.map(p => ({...p, updatedAt: Date.now()}));
    const stampedTeam = data.team.map(t => ({...t, updatedAt: Date.now()}));
    const stampedClients = data.clients.map(c => ({...c, updatedAt: Date.now()}));

    setProjects(stampedProjects);
    setTeam(stampedTeam);
    setClients(stampedClients);
    lastActionRef.current = "Excel Import";
    commitToCloud(stampedProjects, stampedTeam, stampedClients, pendingApprovalsRef.current);
  }, [commitToCloud, updateLocalTimestamp, setProjects, setTeam, setClients, pendingApprovalsRef]);

  const handleForcePush = useCallback(() => {
    if (projects.length === 0 && team.length === 0 && clients.length === 0) {
      alert("Cannot Push: Your local database is empty.");
      return;
    }
    const confirmed = confirm(
      "FORCE PUSH: This will overwrite the Google Sheet with your current local data. Are you sure?"
    );
    if (confirmed) {
      updateLocalTimestamp();
      lastActionRef.current = "Force Push";
      commitToCloud(projects, team, clients, pendingApprovalsRef.current);
    }
  }, [projects, team, clients, commitToCloud, updateLocalTimestamp, pendingApprovalsRef]);

  const testConnection = useCallback(async () => {
    if (!scriptUrl) {
      setShowSyncModal(true);
      return;
    }
    setTestStatus('testing');
    try {
      const payload = {
        projects: [{ id: "TEST_" + Date.now(), title: "Connection Test", status: "To Do", updatedAt: Date.now() }],
        team: [],
        clients: []
      };

      await fetch(scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });

      setTestStatus('success');
      setTimeout(() => setTestStatus('idle'), 3000);
    } catch (e) {
      setTestStatus('failed');
      setTimeout(() => setTestStatus('idle'), 3000);
    }
  }, [scriptUrl, setShowSyncModal]);

  return {
    commitToCloud,
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
