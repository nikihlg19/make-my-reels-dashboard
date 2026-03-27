import { useEffect, useState, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import * as XLSX from 'xlsx';
import { Project, TeamMember, Client, PendingApproval, Priority, ProjectStatus } from '../../types';
import { parseTime, parseDate } from '../../constants';
import { getExportUrl, safeJsonParse, generateStableId } from '../utils/sheetSync';

export interface UseSheetSyncArgs {
  sheetReadUrl: string;
  lastLocalUpdate: number;
  projectsRef: MutableRefObject<Project[]>;
  teamRef: MutableRefObject<TeamMember[]>;
  clientsRef: MutableRefObject<Client[]>;
  setProjects: Dispatch<SetStateAction<Project[]>>;
  setTeam: Dispatch<SetStateAction<TeamMember[]>>;
  setClients: Dispatch<SetStateAction<Client[]>>;
  setPendingApprovals: Dispatch<SetStateAction<PendingApproval[]>>;
}

export interface UseSheetSyncReturn {
  teamRoles: string[];
  isSyncing: boolean;
  lastSyncedTime: string | null;
  lastSyncError: string | null;
  syncLogs: any[];
}

export const useSheetSync = ({
  sheetReadUrl,
  lastLocalUpdate,
  projectsRef,
  teamRef,
  clientsRef,
  setProjects,
  setTeam,
  setClients,
  setPendingApprovals,
}: UseSheetSyncArgs): UseSheetSyncReturn => {
  const [teamRoles, setTeamRoles] = useState<string[]>(['Videographer', 'Photographer', 'Editor', 'Sales', 'Marketing', 'Reelographer']);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);

  useEffect(() => {
    const fetchMasterSheet = async () => {
      if (Date.now() - lastLocalUpdate < 10000) {
        console.log("Skipping sync: Local changes pending upload.");
        return;
      }

      if (!sheetReadUrl) return;

      setIsSyncing(true);
      try {
        const exportUrl = getExportUrl(sheetReadUrl);
        const separator = exportUrl.includes('?') ? '&' : '?';
        const fetchUrl = `${exportUrl}${separator}t=${Date.now()}`;

        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error("Failed to fetch spreadsheet");

        const arrayBuffer = await response.arrayBuffer();
        const wb = XLSX.read(arrayBuffer, { type: 'array' });

        const getSheetData = (name: string) => {
          const matchedName = wb.SheetNames.find(n => n.toLowerCase() === name.toLowerCase());
          const ws = matchedName ? wb.Sheets[matchedName] : undefined;
          return ws ? XLSX.utils.sheet_to_json(ws) : [];
        };

        const rawProjects: any[] = getSheetData("Projects");
        const rawTeam: any[] = getSheetData("Team");
        const rawClients: any[] = getSheetData("Clients");
        const rawLogs: any[] = getSheetData("Logs");
        const rawTeamRoles: any[] = getSheetData("Team_Roles");

        if (rawLogs && rawLogs.length > 0) {
          setSyncLogs(rawLogs.slice(-50).reverse());
        }

        if (rawTeamRoles && rawTeamRoles.length > 0) {
          const roles = rawTeamRoles.map(r => String(r.Roles || r.Role || r.roles || r.role || Object.values(r)[0])).filter(Boolean);
          if (roles.length > 0) {
            setTeamRoles(roles);
          }
        }

        // SAFETY: If sheet is totally empty, ignore it completely if we have local data.
        if (rawProjects.length === 0 && projectsRef.current.length > 0) {
          console.warn("Safety Stop: Remote sheet is empty. Preserving local data.");
          setIsSyncing(false);
          setLastSyncedTime("Sync Blocked (Remote Empty)");
          return;
        }

        // Process Remote Projects
        const remoteProjects: Project[] = rawProjects.map(row => {
          const links = safeJsonParse(row.InstagramLinks, []);
          const fallbackId = `PRJ_${generateStableId((row.Title || '') + (row.ShootDate || '') + (row.Location || ''))}`;

          let shootDate = parseDate(row.ShootDate);
          let deadline = parseDate(row.Deadline);
          let dueDate = parseDate(row.DueDate);

          return {
            id: String(row.ID || fallbackId),
            title: String(row.Title || "Untitled Project"),
            status: (row.Status || "To Do") as ProjectStatus,
            priority: (row.Priority || "Medium") as Priority,
            eventDate: shootDate || new Date().toISOString().split('T')[0],
            eventTime: parseTime(row.ShootTime),
            submissionDeadline: deadline,
            dueDate: dueDate || shootDate || "",
            progress: Number(row.Progress) || 0,
            rating: row.Rating ? Number(row.Rating) : undefined,
            budget: Number(row.Budget) || 0,
            expenses: Number(row.Expenses) || 0,
            location: String(row.Location || "Unspecified"),
            description: String(row.Description || ""),
            notes: String(row.Notes || ""),
            clientId: String(row.ClientID || ""),
            clientIds: row.ClientIDs ? String(row.ClientIDs).split(',').map((s: string) => s.trim()).filter(Boolean) : (row.ClientID ? [String(row.ClientID)] : []),
            dependencies: row.Dependencies ? String(row.Dependencies).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
            tags: row.Tags ? String(row.Tags).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
            teamMemberIds: row.TeamMemberIDs ? String(row.TeamMemberIDs).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
            instaLinks: links,
            isOverdue: row.IsOverdue === true || row.IsOverdue === 'true',
            updatedAt: Number(row.UpdatedAt) || 0,
            isDeleted: row.IsDeleted === true || row.IsDeleted === 'true' || row.IsDeleted === 'TRUE'
          };
        });

        // SAFE MERGE for Projects
        setProjects(prevLocal => {
          const remoteMap = new Map(remoteProjects.map(p => [p.id, p]));
          const merged = [...remoteProjects];

          prevLocal.forEach(localP => {
            const remoteP = remoteMap.get(localP.id);
            if (!remoteP) {
              if (Date.now() - (localP.updatedAt || 0) < 10 * 60 * 1000) {
                merged.push(localP);
              } else {
                console.warn(`Dropping local-only record after sync timeout: ${localP.id} (${localP.title})`);
              }
            } else if ((localP.updatedAt || 0) > (remoteP.updatedAt || 0)) {
              const idx = merged.findIndex(p => p.id === localP.id);
              if (idx !== -1) merged[idx] = localP;
            } else {
              const idx = merged.findIndex(p => p.id === localP.id);
              if (idx !== -1) {
                const target = merged[idx];
                if (target.budget === 0 && (localP.budget ?? 0) > 0) target.budget = localP.budget;
                if (target.expenses === 0 && (localP.expenses ?? 0) > 0) target.expenses = localP.expenses;
              }
            }
          });
          return merged;
        });

        // Process Team (Safe Merge)
        const remoteTeam: TeamMember[] = rawTeam.map(row => {
          const fallbackId = `TM_${generateStableId(row.Name || '')}`;
          return {
            id: String(row.ID || fallbackId),
            name: String(row.Name || "New Member"),
            role: row.Roles ? String(row.Roles).split(',').map((s: string) => s.trim()) : ["Member"],
            phone: String(row.Phone || ""),
            location: String(row.Location || ""),
            avatar: String(row.Avatar || (row.Name || "M")[0]),
            color: String(row.Color || 'bg-slate-900'),
            activeProjects: Number(row.ActiveCount) || 0,
            completedProjects: Number(row.CompletedCount) || 0,
            avgRating: Number(row.AvgRating) || 5,
            avgEffort: Number(row.AvgEffort) || 0,
            onTimeRate: Number(row.OnTimeRate) || 100,
            tags: row.Tags ? String(row.Tags).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
            onboardingNotes: String(row.OnboardingNotes || ""),
            aadhaar_image_url: row.AadhaarImageUrl || undefined,
            kyc_declaration: row.KYCDeclaration === true || row.KYCDeclaration === 'true' || row.KYCDeclaration === 'TRUE',
            updatedAt: Number(row.UpdatedAt) || 0,
            isDeleted: row.IsDeleted === true || row.IsDeleted === 'true' || row.IsDeleted === 'TRUE'
          };
        });
        setTeam(prevLocal => {
          const remoteMap = new Map(remoteTeam.map(t => [t.id, t]));
          const merged = [...remoteTeam];
          prevLocal.forEach(localT => {
            const remoteT = remoteMap.get(localT.id);
            if (!remoteT) {
              if (Date.now() - (localT.updatedAt || 0) < 10 * 60 * 1000) {
                merged.push(localT);
              }
            } else if ((localT.updatedAt || 0) > (remoteT.updatedAt || 0)) {
              const idx = merged.findIndex(t => t.id === localT.id);
              if (idx !== -1) merged[idx] = localT;
            } else {
              if (localT.aadhaar_image_url && !remoteT.aadhaar_image_url) {
                const idx = merged.findIndex(t => t.id === localT.id);
                if (idx !== -1) merged[idx] = { ...merged[idx], aadhaar_image_url: localT.aadhaar_image_url };
              }
            }
          });
          return merged;
        });

        // Process Clients (Safe Merge)
        const remoteClients: Client[] = rawClients.map(row => {
          const fallbackId = `CL_${generateStableId(row.Company || '')}`;
          let createdAt = row.CreatedAt;
          if (createdAt instanceof Date) createdAt = createdAt.toISOString();

          return {
            id: String(row.ID || fallbackId),
            company: String(row.Company || "Unknown Brand"),
            name: String(row.Name || "Contact Person"),
            phone: String(row.Phone || ""),
            email: String(row.Email || ""),
            notes: String(row.Notes || ""),
            avatar: String(row.Avatar || (row.Company || "C")[0]),
            color: String(row.Color || 'bg-indigo-600'),
            createdAt: String(createdAt || new Date().toISOString()),
            updatedAt: Number(row.UpdatedAt) || 0,
            isDeleted: row.IsDeleted === true || row.IsDeleted === 'true' || row.IsDeleted === 'TRUE'
          };
        });
        setClients(prevLocal => {
          const remoteMap = new Map(remoteClients.map(c => [c.id, c]));
          const merged = [...remoteClients];
          prevLocal.forEach(localC => {
            const remoteC = remoteMap.get(localC.id);
            if (!remoteC) {
              if (Date.now() - (localC.updatedAt || 0) < 10 * 60 * 1000) {
                merged.push(localC);
              }
            } else if ((localC.updatedAt || 0) > (remoteC.updatedAt || 0)) {
              const idx = merged.findIndex(c => c.id === localC.id);
              if (idx !== -1) merged[idx] = localC;
            }
          });
          return merged;
        });

        // Process PendingApprovals from remote sheet
        const rawPendingApprovals: any[] = getSheetData("PendingApprovals");
        const remotePendings: PendingApproval[] = (rawPendingApprovals || []).map(row => ({
          id: String(row.ID || ''),
          type: (row.Type || 'edit') as PendingApproval['type'],
          entityType: (row.EntityType || 'project') as PendingApproval['entityType'],
          entityId: String(row.EntityID || ''),
          entityTitle: String(row.EntityTitle || ''),
          changes: (() => { try { return typeof row.Changes === 'string' ? JSON.parse(row.Changes || '{}') : (row.Changes || {}); } catch (e) { console.error('Failed to parse Changes JSON:', e); return {}; } })(),
          requestedBy: String(row.RequestedBy || ''),
          requestedByEmail: String(row.RequestedByEmail || ''),
          requestedAt: Number(row.RequestedAt) || Date.now(),
          status: (row.Status || 'pending') as PendingApproval['status'],
        })).filter(a => a.id);

        setPendingApprovals(prevLocal => {
          const remoteMap = new Map(remotePendings.map(a => [a.id, a]));
          const merged = [...remotePendings];
          prevLocal.forEach(localP => {
            if (!remoteMap.has(localP.id)) {
              if (Date.now() - (localP.requestedAt || 0) < 30 * 1000) {
                merged.push(localP);
              }
            }
          });
          localStorage.setItem('mmr_pending_approvals', JSON.stringify(merged));
          return merged;
        });

        setLastSyncedTime(new Date().toLocaleTimeString());
        setLastSyncError(null);
      } catch (err) {
        console.warn("Sheet Auto-Sync Failed.", err);
        setLastSyncError(err instanceof Error ? err.message : "Sync Failed");
      } finally {
        setIsSyncing(false);
      }
    };

    fetchMasterSheet();
    const intervalId = setInterval(fetchMasterSheet, 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchMasterSheet();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [sheetReadUrl, lastLocalUpdate]);

  return { teamRoles, isSyncing, lastSyncedTime, lastSyncError, syncLogs };
};
