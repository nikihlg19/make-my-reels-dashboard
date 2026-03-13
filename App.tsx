
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { QRCodeSVG } from 'qrcode.react';
import { 
  LayoutGrid, Calendar as CalendarIcon, Users, BarChart3, 
  Instagram, QrCode, Lock, Plus, Search,
  ChevronDown, EyeOff, X, Copy, CreditCard, Menu, Filter, Tag, Check,
  Bell, AlertCircle, Clock as ClockIcon, ChevronLeft, ChevronRight, Trash2, Database, RefreshCw,
  Globe, Link, PlusCircle, ExternalLink, Cloud, Briefcase, FileSpreadsheet, CheckCircle, Wifi, Zap, UploadCloud, AlertTriangle, Rows, Columns
} from 'lucide-react';
import { Project, TeamMember, Priority, ProjectStatus, Client, InstaLink } from './types';
import { INITIAL_PROJECTS, INITIAL_TEAM, INITIAL_CLIENTS, PASSCODE, parseTime, parseDate } from './constants';
import Board, { EditProjectModal } from './components/Board';
import Team, { TeamMemberCard } from './components/Team';
import Analytics from './components/Analytics';
import Calendar from './components/Calendar';
import NewProjectModal from './components/NewProjectModal';
import PasscodeLock from './components/PasscodeLock';
import NewClientModal from './components/NewClientModal';
import Clients, { ClientCard } from './components/Clients';
import ExcelDatabase from './components/ExcelDatabase';
import NotificationBell from './components/NotificationBell';

const CLOUD_API_BASE = 'https://kv.pydantic.dev'; 
const MASTER_DB_URL = 'https://docs.google.com/spreadsheets/d/1BTv0o0eufro8BOcuhJAkqZpGOfqr-L8fXVg2cUP0AjE/export?format=xlsx';
// Default is empty to force user configuration
const DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxhA0atP1dSd964MjOBYTU0lh_W427zFCPdPvvgOdloxY_18RhIV_JDgUzJUoUXDQxr/exec';

export type DateFilterType = '1m' | '1y' | 'all' | 'custom';

export interface DateFilter {
  type: DateFilterType;
  start?: string;
  end?: string;
}

// Helper for stable IDs (prevents flickering when ID is missing in sheet)
const generateStableId = (seed: string) => {
  let hash = 0;
  const str = seed.toString();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).substring(0, 9).toUpperCase();
};

// Safe JSON parser to prevent sync crashes
const safeJsonParse = (str: any, fallback: any = []) => {
  if (!str) return fallback;
  if (typeof str !== 'string') return str;
  try {
    return JSON.parse(str);
  } catch (e) {
    console.warn("JSON Parse Error:", e);
    return fallback;
  }
};

// Helper to robustly parse dates from various formats (ISO, DD-MM-YYYY, Excel string)
const parseDateSafe = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  
  // Try standard ISO first (YYYY-MM-DD)
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;

  // Try splitting by - or / for DD-MM-YY or DD-MM-YYYY
  const parts = dateStr.split(/[-/]/);
  if (parts.length === 3) {
    const p1 = parseInt(parts[0], 10);
    const p2 = parseInt(parts[1], 10);
    const p3 = parseInt(parts[2], 10);

    // Heuristic: If first part > 12, it's definitely day. Or if last part is year.
    // Assuming DD-MM-YY or DD-MM-YYYY
    if (p1 <= 31 && p2 <= 12) {
      let year = p3;
      if (year < 100) year += 2000; // Handle YY -> 20YY
      return new Date(year, p2 - 1, p1);
    }
  }
  return null;
};

// Helper to automatically convert regular Google Sheet URLs to export URLs
const getExportUrl = (url: string) => {
  if (!url) return '';
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=xlsx`;
  }
  return url;
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'Board' | 'Calendar' | 'Clients' | 'Team' | 'Analytics'>('Board');
  
  const [syncCode, setSyncCode] = useState<string>(() => localStorage.getItem('mmr_sync_code') || '');
  const [scriptUrl, setScriptUrl] = useState<string>(() => {
    const saved = localStorage.getItem('mmr_script_url');
    if (!saved || saved === 'https://script.google.com/macros/s/AKfycbwJIPYSXThWJqyIKN9EzAm4xO6J8gdftPgWBY8JZi1WEUhpZI1e-tEiKUXWRqv4mG2_/exec' || saved === 'https://script.google.com/macros/s/AKfycbxRo_PVsykIbhO9j-hvfKdN0fHK8cdWTYg5UZZZPcIMspd8_cfmAAcJ9UXJT1jCgkaY/exec' || saved === 'https://script.google.com/macros/s/AKfycbzZzOZ1xrhXuhfOIvkGGOCMeRDW7p17wgQHUq36qw1U9KVL9l6iEXBG_AURZELz1CIw/exec' || saved === 'https://script.google.com/macros/s/AKfycbwtmiyi8VB1iioVZSjp5jgb8alLuS5aKkJW8yjU1TDVm7g6yz9-0bZJ0aM3TMYToWVv/exec') {
      return DEFAULT_SCRIPT_URL;
    }
    return saved;
  });
  const [sheetReadUrl, setSheetReadUrl] = useState<string>(() => localStorage.getItem('mmr_remote_db_url') || MASTER_DB_URL);

  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('mmr_projects');
    return saved ? JSON.parse(saved) : INITIAL_PROJECTS;
  });
  const [team, setTeam] = useState<TeamMember[]>(() => {
    const saved = localStorage.getItem('mmr_team');
    return saved ? JSON.parse(saved) : INITIAL_TEAM;
  });
  const [clients, setClients] = useState<Client[]>(() => {
    const saved = localStorage.getItem('mmr_clients');
    return saved ? JSON.parse(saved) : INITIAL_CLIENTS;
  });
  const [teamRoles, setTeamRoles] = useState<string[]>(['Videographer', 'Photographer', 'Editor', 'Sales', 'Marketing', 'Reelographer']);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [tempSyncCode, setTempSyncCode] = useState('');
  
  // Persistent Last Update Time: Allows refreshing the page without losing the "Don't Sync Yet" safety buffer
  const [lastLocalUpdate, setLastLocalUpdate] = useState<number>(() => {
    return Number(localStorage.getItem('mmr_last_local_update') || 0);
  });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<Priority | 'All'>('All');
  const [selectedMemberFilter, setSelectedMemberFilter] = useState<string | 'All'>('All');
  const [selectedTagsFilter, setSelectedTagsFilter] = useState<string[]>([]);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [initialProjectStatus, setInitialProjectStatus] = useState<ProjectStatus | undefined>(undefined);
  const [isNewClientModalOpen, setIsNewClientModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  
  const [dateFilter, setDateFilter] = useState<DateFilter>({ type: 'all' });
  
  // Refs to track latest state for debounced commits (prevents stale closures)
  const projectsRef = useRef(projects);
  const teamRef = useRef(team);
  const clientsRef = useRef(clients);

  useEffect(() => { projectsRef.current = projects; }, [projects]);
  useEffect(() => { teamRef.current = team; }, [team]);
  useEffect(() => { clientsRef.current = clients; }, [clients]);
  
  // Persistent Unlock State (Requirement: Lock active on fresh load)
  const [isFinancialsUnlocked, setIsFinancialsUnlocked] = useState(false);
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [financialMonth, setFinancialMonth] = useState(new Date());
  const [isMobileStacked, setIsMobileStacked] = useState(false);

  const [previewMember, setPreviewMember] = useState<TeamMember | null>(null);
  const [previewClient, setPreviewClient] = useState<Client | null>(null);
  const [memberForTags, setMemberForTags] = useState<TeamMember | null>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);
  const [showPaymentQR, setShowPaymentQR] = useState(false);
  
  const lastActionRef = useRef<string>("Initial Sync / Bulk Update");

  // Detect configuration mismatch
  const hasConfigMismatch = useMemo(() => {
    return !scriptUrl || scriptUrl.length < 10;
  }, [scriptUrl]);

  // --- AUTOMATIC SPREADSHEET SYNC (Source of Truth with Safe Merge) ---
  useEffect(() => {
    const fetchMasterSheet = async () => {
      // PERSISTENT SAFETY: If local data was updated within last 10 seconds (10,000ms), 
      // DO NOT fetch from sheet. This prevents "Empty Sheet" overwriting local work.
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
        if (rawProjects.length === 0 && projects.length > 0) {
           console.warn("Safety Stop: Remote sheet is empty. Preserving local data.");
           setIsSyncing(false);
           setLastSyncedTime("Sync Blocked (Remote Empty)");
           return;
        }

        // Process Remote Projects
        const remoteProjects: Project[] = rawProjects.map(row => {
          const links = safeJsonParse(row.InstagramLinks, []);
          const fallbackId = `PRJ_${generateStableId((row.Title || '') + (row.ShootDate || '') + (row.Location || ''))}`;

          // Handle Excel Date Objects
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

        // SAFE MERGE for Projects:
        // Use UpdatedAt to decide which version to keep, with financial data protection.
        setProjects(prevLocal => {
            const remoteMap = new Map(remoteProjects.map(p => [p.id, p]));
            const merged = [...remoteProjects];
            
            prevLocal.forEach(localP => {
                const remoteP = remoteMap.get(localP.id);
                if (!remoteP) {
                    // If local record is very new (updated < 2 mins ago), keep it (pending sync).
                    // Otherwise, assume it was deleted from the remote sheet and drop it.
                    if (Date.now() - (localP.updatedAt || 0) < 2 * 60 * 1000) {
                        merged.push(localP);
                    }
                } else if ((localP.updatedAt || 0) > (remoteP.updatedAt || 0)) {
                    const idx = merged.findIndex(p => p.id === localP.id);
                    if (idx !== -1) merged[idx] = localP;
                } else {
                    // Remote is newer or same, but check for masked financial data
                    const idx = merged.findIndex(p => p.id === localP.id);
                    if (idx !== -1) {
                        const target = merged[idx];
                        // If remote has 0/NaN but local has values, and remote might be masked
                        if (target.budget === 0 && localP.budget > 0) target.budget = localP.budget;
                        if (target.expenses === 0 && localP.expenses > 0) target.expenses = localP.expenses;
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
              kyc_status: row.KYCStatus || 'none',
              kyc_aadhaar: row.KYCAadhaar || '',
              kyc_aadhaar_image: row.KYCAadhaarImage || '',
              kyc_id_type: row.KYCIDType || '',
              kyc_id_number: row.KYCIDNumber || '',
              kyc_declaration: row.KYCDeclaration === true || row.KYCDeclaration === 'true' || row.KYCDeclaration === 'TRUE',
              kyc_digio_ref: row.KYCDigioRef || '',
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
                    if (Date.now() - (localT.updatedAt || 0) < 2 * 60 * 1000) {
                        merged.push(localT);
                    }
                } else if ((localT.updatedAt || 0) > (remoteT.updatedAt || 0)) {
                    const idx = merged.findIndex(t => t.id === localT.id);
                    if (idx !== -1) merged[idx] = localT;
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
                    if (Date.now() - (localC.updatedAt || 0) < 2 * 60 * 1000) {
                        merged.push(localC);
                    }
                } else if ((localC.updatedAt || 0) > (remoteC.updatedAt || 0)) {
                    const idx = merged.findIndex(c => c.id === localC.id);
                    if (idx !== -1) merged[idx] = localC;
                }
            });
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
    const intervalId = setInterval(fetchMasterSheet, 60000); // Relaxed to 60s
    
    // Sync on tab focus
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchMasterSheet();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [sheetReadUrl, lastLocalUpdate, projects.length]); 

  // Centralized Live Sync Committer (Debounced)
  const commitToCloud = useCallback(async (p: Project[], t: TeamMember[], c: Client[]) => {
    try {
      localStorage.setItem('mmr_projects', JSON.stringify(p));
      localStorage.setItem('mmr_team', JSON.stringify(t));
      localStorage.setItem('mmr_clients', JSON.stringify(c));
    } catch (e) {
      console.warn("LocalStorage quota exceeded. Changes saved in memory only.", e);
    }
    
    if (scriptUrl) {
      if (!scriptUrl.includes('script.google.com')) {
         console.warn("Invalid script URL.");
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
            KYCStatus: tm.kyc_status,
            KYCAadhaar: tm.kyc_aadhaar,
            KYCAadhaarImage: tm.kyc_aadhaar_image,
            KYCIDType: tm.kyc_id_type,
            KYCIDNumber: tm.kyc_id_number,
            KYCDeclaration: tm.kyc_declaration,
            KYCDigioRef: tm.kyc_digio_ref,
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
          }))
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
  }, [scriptUrl]);

  // Debounce logic for cloud commits
  const pendingCommitRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedCommit = useCallback(() => {
    if (pendingCommitRef.current) clearTimeout(pendingCommitRef.current);
    pendingCommitRef.current = setTimeout(() => {
      commitToCloud(projectsRef.current, teamRef.current, clientsRef.current);
    }, 2000); // 2 second debounce
  }, [commitToCloud]);

  const updateLocalTimestamp = () => {
    const now = Date.now();
    setLastLocalUpdate(now);
    localStorage.setItem('mmr_last_local_update', String(now));
  };

  const updateProjects = (next: Project[], action: string = "Updated Projects") => {
    lastActionRef.current = action;
    updateLocalTimestamp();
    setProjects(next);
    debouncedCommit();
  };

  const updateTeam = (next: TeamMember[], action: string = "Updated Team") => {
    lastActionRef.current = action;
    updateLocalTimestamp();
    setTeam(next);
    debouncedCommit();
  };

  const updateClients = (next: Client[], action: string = "Updated Clients") => {
    lastActionRef.current = action;
    updateLocalTimestamp();
    setClients(next);
    debouncedCommit();
  };

  const handleExcelImport = useCallback((data: { projects: Project[]; team: TeamMember[]; clients: Client[] }) => {
    updateLocalTimestamp();
    // Import assumes new data, stamp it.
    const stampedProjects = data.projects.map(p => ({...p, updatedAt: Date.now()}));
    const stampedTeam = data.team.map(t => ({...t, updatedAt: Date.now()}));
    const stampedClients = data.clients.map(c => ({...c, updatedAt: Date.now()}));
    
    setProjects(stampedProjects);
    setTeam(stampedTeam);
    setClients(stampedClients);
    lastActionRef.current = "Excel Import";
    commitToCloud(stampedProjects, stampedTeam, stampedClients);
  }, [commitToCloud]);

  const handleForcePush = () => {
    if (projects.length === 0 && team.length === 0 && clients.length === 0) {
      alert("Cannot push an empty database. Add some data first!");
      return;
    }
    const confirmed = confirm(
      "This will overwrite the remote Google Sheet with your current local data.\n\n" +
      "IMPORTANT: Ensure your Google Sheet has tabs named 'Projects', 'Team', and 'Clients' before proceeding, or data may be lost."
    );
    if (confirmed) {
      updateLocalTimestamp();
      lastActionRef.current = "Force Push";
      commitToCloud(projects, team, clients);
    }
  };

  const onProjectUpdate = (updatedProject: Project) => {
    const existingProject = projects.find(p => p.id === updatedProject.id);
    let actionDesc = `Updated Project: ${updatedProject.title}`;
    
    if (existingProject && existingProject.status !== updatedProject.status) {
      actionDesc = `Moved '${updatedProject.title}' to ${updatedProject.status}`;
    }

    // Optimistic update with timestamp
    const stamped = { ...updatedProject, updatedAt: Date.now() };
    const next = projects.map(p => p.id === stamped.id ? stamped : p);
    updateProjects(next, actionDesc);
  };

  const onProjectDelete = (projectId: string) => {
    const proj = projects.find(p => p.id === projectId);
    const next = projects.map(p => p.id === projectId ? { ...p, isDeleted: true, updatedAt: Date.now() } : p);
    updateProjects(next, `Deleted Project: ${proj?.title || projectId}`);
  };

  const handleUnlockSuccess = () => {
    setIsFinancialsUnlocked(true);
    localStorage.setItem('mmr_unlocked', 'true');
    setShowPasscodeModal(false);
  };

  const handleLockState = () => {
    setIsFinancialsUnlocked(false);
    localStorage.setItem('mmr_unlocked', 'false');
  };

  const handleReadUrlSave = (url: string) => {
    setSheetReadUrl(url);
    localStorage.setItem('mmr_remote_db_url', url);
  };

  const activeProjects = useMemo(() => projects.filter(p => !p.isDeleted), [projects]);
  const activeTeam = useMemo(() => team.filter(t => !t.isDeleted), [team]);
  const activeClients = useMemo(() => clients.filter(c => !c.isDeleted), [clients]);

  const filteredProjects = useMemo(() => {
    return activeProjects.filter(p => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = p.title.toLowerCase().includes(searchLower) || 
                           (p.tags || []).some(t => t.toLowerCase().includes(searchLower));
      const matchesPriority = selectedPriority === 'All' || p.priority === selectedPriority;
      const matchesMember = selectedMemberFilter === 'All' || p.teamMemberIds.includes(selectedMemberFilter);
      return matchesSearch && matchesPriority && matchesMember;
    });
  }, [projects, searchQuery, selectedPriority, selectedMemberFilter]);

  const stats = useMemo(() => {
    const targetMonth = financialMonth.getMonth(); // 0-11
    const targetYear = financialMonth.getFullYear();

    const monthProjects = activeProjects.filter(p => {
      const d = parseDateSafe(p.eventDate);
      if (!d) return false;
      
      const isCorrectMonth = d.getFullYear() === targetYear && d.getMonth() === targetMonth;
      
      // Filter for Confirmed Revenue: To Do (Booked), In Progress, Completed
      const isConfirmed = ['To Do', 'In Progress', 'Completed'].includes(p.status);

      return isCorrectMonth && isConfirmed;
    });

    const revenue = monthProjects.reduce((acc, p) => acc + (p.budget || 0), 0);
    const burn = monthProjects.reduce((acc, p) => acc + (p.expenses || 0), 0);
    
    return { 
      revenue, 
      burn, 
      month: financialMonth.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).toUpperCase() 
    };
  }, [projects, financialMonth]);

  const testConnection = async () => {
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
  };

  const handleSaveScriptUrl = (url: string) => {
    const cleanUrl = url.trim();
    setScriptUrl(cleanUrl);
    localStorage.setItem('mmr_script_url', cleanUrl);
    
    if (cleanUrl) {
       alert("Write URL Saved. Use the Test button to verify.");
    }
  };

  const navItems = [
    { id: 'Board', icon: LayoutGrid },
    { id: 'Calendar', icon: CalendarIcon },
    { id: 'Clients', icon: Briefcase },
    { id: 'Team', icon: Users },
    { id: 'Analytics', icon: BarChart3 }
  ];

  return (
    <div className="h-screen flex flex-col bg-[#F8FAFC] text-slate-900 overflow-hidden font-sans">
      <header className="bg-white border-b px-4 md:px-6 py-2 flex flex-col md:flex-row md:items-center justify-between z-[60] shrink-0 md:h-16 shadow-sm gap-2 md:gap-0">
        <div className="flex items-center justify-between w-full md:w-auto md:gap-8">
          <div className="flex flex-col leading-none cursor-pointer group" onClick={() => setActiveTab('Board')}>
            <span className="text-base font-black tracking-tighter text-slate-900 uppercase">Make My</span>
            <span className="text-base font-black tracking-tighter text-[#4F46E5] uppercase">Reels</span>
          </div>
          <nav className="flex md:hidden items-center gap-1 overflow-x-auto scrollbar-hide max-w-[60vw]">
            {navItems.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-1 px-2 py-1.5 rounded-lg transition-all shrink-0 ${activeTab === tab.id ? 'bg-[#4F46E5] text-white font-bold shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
                <tab.icon size={12} /><span className="text-[9px] uppercase tracking-widest">{tab.id}</span>
              </button>
            ))}
          </nav>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${activeTab === tab.id ? 'bg-[#4F46E5] text-white font-bold shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
                <tab.icon size={14} /><span className="text-[10px] uppercase tracking-widest">{tab.id}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2 md:gap-4 overflow-x-auto scrollbar-hide pb-1 md:pb-0 w-full md:w-auto">
          <div className={`flex items-center gap-2 px-2 md:px-3 py-1.5 rounded-xl border transition-all shadow-sm shrink-0 ${lastSyncError ? 'bg-rose-50 border-rose-100 text-rose-600' : isSaving ? 'bg-amber-100 border-amber-200 text-amber-700' : isSyncing ? 'bg-indigo-50 border-indigo-100 text-indigo-500' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}>
            {lastSyncError ? <AlertTriangle size={14} /> : isSaving ? <UploadCloud size={14} className="animate-pulse" /> : isSyncing ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle size={12} />}
            <span className="text-[9px] font-black uppercase tracking-widest hidden sm:inline">
              {lastSyncError ? 'Sync Failed' : isSaving ? 'Pushing Updates...' : isSyncing ? 'Syncing...' : `Sheet: ${lastSyncedTime || 'Ready'}`}
            </span>
          </div>

          <button 
            onClick={() => setShowSyncModal(true)}
            className={`flex items-center gap-1.5 px-2 md:px-3 py-2 rounded-lg font-black text-[10px] transition-all border shrink-0 ${hasConfigMismatch ? 'bg-rose-50 border-rose-200 text-rose-600 animate-pulse' : scriptUrl ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
          >
            {hasConfigMismatch ? <AlertTriangle size={14} /> : scriptUrl ? <Cloud size={14} /> : <Database size={14} />}
            <span className="uppercase tracking-widest hidden xl:inline">{hasConfigMismatch ? 'Setup Required' : scriptUrl ? 'Cloud Bridge Connected' : 'Sync Engine'}</span>
          </button>

          <button onClick={() => isFinancialsUnlocked ? handleLockState() : setShowPasscodeModal(true)} className={`flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-lg font-black text-[10px] transition-all shadow-sm shrink-0 ${isFinancialsUnlocked ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-900 text-white hover:bg-black'}`}>
            {isFinancialsUnlocked ? <EyeOff size={12} /> : <Lock size={12} />}
            <span className="uppercase tracking-widest hidden lg:inline">{isFinancialsUnlocked ? 'Unlocked Session' : 'Unlock Access'}</span>
          </button>
          
          <button onClick={() => setIsNewProjectModalOpen(true)} className="bg-[#4F46E5] text-white px-4 md:px-5 py-2 rounded-lg font-black shadow-lg hover:bg-[#3f38c2] transition-all text-[10px] uppercase tracking-widest shrink-0">
            New Project
          </button>
        </div>
      </header>

      <div className="bg-white border-b px-4 md:px-6 py-2 flex flex-col sm:flex-row sm:items-center justify-between shrink-0 shadow-sm z-40 gap-2 sm:gap-0">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search..." className="w-full pl-8 pr-3 py-1.5 border border-slate-100 rounded-lg bg-slate-50 text-xs font-medium focus:bg-white transition-all outline-none" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto scrollbar-hide w-full sm:w-auto">
          <NotificationBell projects={projects} onProjectClick={(id) => { setActiveTab('Board'); setEditingProject(projects.find(p => p.id === id) || null); }} />
          <button 
            onClick={() => setShowPaymentQR(true)}
            className="flex items-center justify-center w-9 h-9 bg-slate-900 rounded-xl text-white shadow-sm hover:shadow-md transition-all hover:scale-105 shrink-0"
            title="Payment QR Code"
          >
            <QrCode size={18} />
          </button>
          <a 
            href="https://www.instagram.com/make.my_reels?igsh=OGxrcm1hdXY3Nm5v" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center justify-center w-9 h-9 bg-gradient-to-tr from-[#f09433] via-[#e6683c] to-[#bc1888] rounded-xl text-white shadow-sm hover:shadow-md transition-all hover:scale-105 shrink-0"
            title="Instagram Profile"
          >
            <Instagram size={18} />
          </a>
          <div className="flex items-center gap-4 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 cursor-pointer shrink-0" onClick={() => !isFinancialsUnlocked && setShowPasscodeModal(true)}>
            <div className="flex flex-col">
              <span className="text-[7px] text-slate-400 uppercase tracking-widest font-black leading-none mb-1">{stats.month} Revenue</span>
              <span className={`text-[11px] font-black text-slate-900 tabular-nums ${!isFinancialsUnlocked ? 'blur-[4px] select-none' : ''}`}>₹{stats.revenue.toLocaleString()}</span>
            </div>
            <div className="w-px h-6 bg-slate-200" />
            <div className="flex flex-col">
              <span className="text-[7px] text-slate-400 uppercase tracking-widest font-black leading-none mb-1">{stats.month} Burn</span>
              <span className={`text-[11px] font-black text-rose-500 tabular-nums ${!isFinancialsUnlocked ? 'blur-[4px] select-none' : ''}`}>₹{stats.burn.toLocaleString()}</span>
            </div>
          </div>
          {activeTab === 'Board' && (
            <button 
              onClick={(e) => { e.stopPropagation(); setIsMobileStacked(!isMobileStacked); }}
              className="md:hidden p-2 rounded-xl bg-slate-50 border border-slate-100 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors shrink-0"
            >
              {isMobileStacked ? <Rows size={16} /> : <Columns size={16} />}
            </button>
          )}
        </div>
      </div>

      <main className="flex-1 relative overflow-hidden bg-[#F4F5F7]">
        {activeTab === 'Board' && <Board projects={filteredProjects} team={activeTeam} clients={activeClients} onProjectUpdate={onProjectUpdate} onProjectDelete={onProjectDelete} onEditProject={setEditingProject} onCreateProjectWithStatus={(status) => { setInitialProjectStatus(status); setIsNewProjectModalOpen(true); }} isFinancialsUnlocked={isFinancialsUnlocked} onRequestUnlock={() => setShowPasscodeModal(true)} onPreviewMember={setPreviewMember} onClientClick={(clientId) => { const client = activeClients.find(c => c.id === clientId); if (client) { setPreviewClient(client); } }} isMobileStacked={isMobileStacked} />}
        {activeTab === 'Calendar' && <Calendar projects={activeProjects} onCreateProject={() => setIsNewProjectModalOpen(true)} onEditProject={(id) => setEditingProject(projects.find(p => p.id === id) || null)} />}
        {activeTab === 'Clients' && <Clients clients={activeClients} projects={activeProjects} team={activeTeam} onAddClient={() => setIsNewClientModalOpen(true)} onUpdateClient={(c) => updateClients(clients.map(old => old.id === c.id ? {...c, updatedAt: Date.now()} : old), `Updated Client: ${c.company}`)} onDeleteClient={(id) => updateClients(clients.map(c => c.id === id ? { ...c, isDeleted: true, updatedAt: Date.now() } : c), `Deleted Client ID: ${id}`)} onEditProject={setEditingProject} onDeleteProject={onProjectDelete} onPreviewMember={setPreviewMember} editingClient={editingClient} setEditingClient={setEditingClient} isFinancialsUnlocked={isFinancialsUnlocked} globalSearchQuery={searchQuery} />}
        {activeTab === 'Team' && <Team team={activeTeam} projects={activeProjects} teamRoles={teamRoles} onAddMember={(m) => updateTeam([...team, {...m, updatedAt: Date.now()}], `Added Team Member: ${m.name}`)} onDeleteMember={(id) => updateTeam(team.map(m => m.id === id ? { ...m, isDeleted: true, updatedAt: Date.now() } : m), `Deleted Team Member ID: ${id}`)} onUpdateMember={(updated) => updateTeam(team.map(m => m.id === updated.id ? {...updated, updatedAt: Date.now()} : m), `Updated Team Member: ${updated.name}`)} onUpdateMemberTags={(id, tags) => updateTeam(team.map(m => m.id === id ? {...m, tags, updatedAt: Date.now()} : m), `Updated Tags for Team Member ID: ${id}`)} onUpdateMemberNotes={(id, notes) => updateTeam(team.map(m => m.id === id ? {...m, onboardingNotes: notes, updatedAt: Date.now()} : m), `Updated Notes for Team Member ID: ${id}`)} onEditProject={setEditingProject} isFinancialsUnlocked={isFinancialsUnlocked} whatsappMember={null} setWhatsappMember={() => {}} memberForTags={memberForTags} setMemberForTags={setMemberForTags} onGlobalUnlock={handleUnlockSuccess} globalSearchQuery={searchQuery} />}
        {activeTab === 'Analytics' && <Analytics team={activeTeam} projects={filteredProjects} clients={activeClients} dateFilter={dateFilter} setDateFilter={setDateFilter} onPreviewMember={setPreviewMember} onEditProject={setEditingProject} />}
      </main>

      {/* Payment QR Modal */}
      {showPaymentQR && (
        <div 
          onClick={() => setShowPaymentQR(false)}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300"
        >
          <div 
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-[32px] w-full max-w-sm shadow-2xl p-8 animate-in zoom-in-95 duration-300 relative border border-white/20 flex flex-col items-center text-center"
          >
            <button 
              onClick={() => setShowPaymentQR(false)} 
              className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-900 transition-all"
            >
              <X size={20} />
            </button>
            
            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-4">
              <QrCode size={32} />
            </div>
            
            <h3 className="text-xl font-black text-slate-800 tracking-tight uppercase mb-1">Payment QR</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-6">Scan to pay</p>
            
            <div className="bg-[#141414] p-6 rounded-2xl border border-slate-800 w-full aspect-square flex items-center justify-center overflow-hidden shadow-inner">
              <QRCodeSVG 
                value="upi://pay?pa=nikhil.gandham@ybl&pn=Nikhil%20Gandham" 
                size={256}
                bgColor="#141414"
                fgColor="#ffffff"
                level="H"
                includeMargin={false}
                imageSettings={{
                  src: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/PhonePe_Logo.svg/512px-PhonePe_Logo.svg.png",
                  height: 48,
                  width: 48,
                  excavate: true,
                }}
                style={{ width: '100%', height: '100%' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Sync Modal */}
      {showSyncModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setShowSyncModal(false)} />
          <div className="relative bg-white rounded-[40px] p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Production Cloud Host</h3>
              <button onClick={() => setShowSyncModal(false)} className="text-slate-300 hover:text-slate-800"><X size={24} /></button>
            </div>
            <ExcelDatabase 
              onImport={handleExcelImport}
              currentData={{ projects, team, clients }}
              isUnlocked={isFinancialsUnlocked}
              preconfiguredUrl={MASTER_DB_URL}
              scriptUrl={scriptUrl}
              onSaveScriptUrl={handleSaveScriptUrl}
              onSaveReadUrl={handleReadUrlSave}
              syncLogs={syncLogs}
            />
            <div className="mt-8 pt-6 border-t space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl border border-slate-100 mt-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${scriptUrl ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      {scriptUrl ? 'Cloud Connection Active' : 'No Connection Configured'}
                    </span>
                  </div>
                  <button onClick={testConnection} className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1 transition-colors ${testStatus === 'success' ? 'text-emerald-500' : testStatus === 'failed' ? 'text-rose-500' : 'text-indigo-500'}`}>
                    {testStatus === 'testing' ? <RefreshCw size={10} className="animate-spin" /> : <Zap size={10} />}
                    {testStatus === 'testing' ? 'Pinging...' : testStatus === 'success' ? 'Live & Ready' : testStatus === 'failed' ? 'Unreachable' : 'Test Connection'}
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-50">
                 <button 
                  onClick={handleForcePush}
                  className="w-full py-4 bg-indigo-50 text-indigo-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-100 transition-all flex items-center justify-center gap-2 border border-indigo-100"
                 >
                   <UploadCloud size={14} /> Force Push Local to Cloud
                 </button>
                 <p className="text-[8px] text-slate-400 text-center mt-2 px-4">Use this if the Sheet is blank or desynchronized. It will overwrite the cloud with your current view.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPasscodeModal && <PasscodeLock onUnlock={handleUnlockSuccess} onClose={() => setShowPasscodeModal(false)} correctPasscode={PASSCODE} />}
      {isNewProjectModalOpen && <NewProjectModal isOpen={isNewProjectModalOpen} onClose={() => { setIsNewProjectModalOpen(false); setInitialProjectStatus(undefined); }} initialStatus={initialProjectStatus} team={team} clients={clients} projects={projects} onAddProject={(p) => updateProjects([{...p, updatedAt: Date.now()}, ...projects], `Created Project: ${p.title}`)} />}
      {editingProject && <EditProjectModal project={editingProject} team={team} clients={clients} projects={projects} onClose={() => setEditingProject(null)} onUpdate={(updated) => { onProjectUpdate(updated); setEditingProject(null); }} isUnlocked={isFinancialsUnlocked} />}
      {isNewClientModalOpen && <NewClientModal isOpen={isNewClientModalOpen} onClose={() => setIsNewClientModalOpen(false)} onAddClient={(c) => updateClients([{...c, updatedAt: Date.now()}, ...clients], `Added Client: ${c.company}`)} />}
      
      {previewMember && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setPreviewMember(null)} />
          <div className="relative w-full max-w-sm animate-in zoom-in-95">
            <button onClick={() => setPreviewMember(null)} className="absolute -top-12 right-0 p-2 text-white hover:text-indigo-400 transition-colors"><X size={24} /></button>
            <TeamMemberCard 
              member={previewMember} 
              projects={projects} 
              onConnect={() => window.open(`https://wa.me/${previewMember.phone}`, '_blank')} 
              onDelete={() => {
                const confirmed = confirm("Are you sure you want to delete this team member?");
                if (confirmed) {
                  const next = team.map(m => m.id === previewMember.id ? { ...m, isDeleted: true, updatedAt: Date.now() } : m);
                  updateTeam(next, `Deleted Team Member ID: ${previewMember.id}`);
                  setPreviewMember(null);
                }
              }} 
              onEdit={() => { setPreviewMember(null); setActiveTab('Team'); }} 
              onManageTags={() => { setPreviewMember(null); setActiveTab('Team'); setMemberForTags(previewMember); }} 
              onUpdateNotes={(notes) => updateTeam(team.map(m => m.id === previewMember.id ? {...m, onboardingNotes: notes} : m), `Updated Notes for Team Member ID: ${previewMember.id}`)}
              isFinancialsUnlocked={isFinancialsUnlocked} 
              onGlobalUnlock={handleUnlockSuccess}
            />
          </div>
        </div>
      )}

      {previewClient && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setPreviewClient(null)} />
          <div className="relative w-full max-w-sm animate-in zoom-in-95">
            <button onClick={() => setPreviewClient(null)} className="absolute -top-12 right-0 p-2 text-white hover:text-indigo-400 transition-colors"><X size={24} /></button>
            <ClientCard 
              client={previewClient}
              projects={projects}
              onEdit={() => { setPreviewClient(null); setEditingClient(previewClient); setActiveTab('Clients'); }}
              onDelete={() => { updateClients(clients.map(c => c.id === previewClient.id ? { ...c, isDeleted: true, updatedAt: Date.now() } : c), `Deleted Client ID: ${previewClient.id}`); setPreviewClient(null); }}
              onHistory={() => { setPreviewClient(null); setActiveTab('Clients'); }}
              onWhatsApp={() => window.open(`https://wa.me/${previewClient.phone.replace(/\D/g, '')}`, '_blank')}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
