
import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet, Upload, Download, AlertCircle,
  CheckCircle2, FilePlus, Globe, RefreshCw, Link as LinkIcon
} from 'lucide-react';
import { Project, TeamMember, Client, InstaLink, Priority, ProjectStatus } from '../types';
import { parseTime, parseDate } from '../constants';

interface ExcelDatabaseProps {
  onImport: (data: { projects: Project[]; team: TeamMember[]; clients: Client[] }) => void;
  currentData: { projects: Project[]; team: TeamMember[]; clients: Client[] };
  isUnlocked: boolean;
  preconfiguredUrl?: string;
  onSaveReadUrl?: (url: string) => void;
  syncLogs?: any[];
}

// Helper for stable IDs (consistent with App.tsx)
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

// Helper to automatically convert regular Google Sheet URLs to export URLs
const getExportUrl = (url: string) => {
  if (!url) return '';
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=xlsx`;
  }
  return url;
};

const ExcelDatabase: React.FC<ExcelDatabaseProps> = ({ onImport, currentData, isUnlocked, preconfiguredUrl, onSaveReadUrl, syncLogs }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [remoteUrl, setRemoteUrl] = useState(() => localStorage.getItem('mmr_remote_db_url') || preconfiguredUrl || '');
  const [isFetching, setIsFetching] = useState(false);
  const [lastSync, setLastSync] = useState(() => localStorage.getItem('mmr_last_excel_sync') || 'Never');
  const [showLogs, setShowLogs] = useState(false);

  const processWorkbook = (wb: XLSX.WorkBook) => {
    // Robust sheet finding (Case Insensitive)
    const getSheetData = (name: string) => {
      const matchedName = wb.SheetNames.find(n => n.toLowerCase() === name.toLowerCase());
      const ws = matchedName ? wb.Sheets[matchedName] : null;
      return ws ? XLSX.utils.sheet_to_json(ws) : [];
    };

    const impProjectsRaw: any[] = getSheetData("Projects");
    const impTeamRaw: any[] = getSheetData("Team");
    const impClientsRaw: any[] = getSheetData("Clients");

    if (!impProjectsRaw.length && !impTeamRaw.length && !impClientsRaw.length) {
      alert("Invalid Excel File. Please ensure you have tabs named 'Projects', 'Team', and 'Clients'.");
      return;
    }

    const projects: Project[] = impProjectsRaw.map(row => {
      let links: InstaLink[] = [];
      try {
        if (row.InstagramLinks) {
          links = typeof row.InstagramLinks === 'string' ? JSON.parse(row.InstagramLinks) : row.InstagramLinks;
        }
      } catch (e) { console.error("Parse Error InstagramLinks:", e); }

      // Handle Excel Date Objects if cellDates=true was used
      let shootDate = parseDate(row.ShootDate);
      let deadline = parseDate(row.Deadline);
      let dueDate = parseDate(row.DueDate);

      const fallbackId = `PRJ_${generateStableId((row.Title || '') + (row.ShootDate || '') + (row.Location || ''))}`;

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
        budget: isUnlocked ? (Number(row.Budget) || 0) : 0,
        expenses: isUnlocked ? (Number(row.Expenses) || 0) : 0,
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
        updatedAt: Number(row.UpdatedAt) || Date.now(),
        isDeleted: row.IsDeleted === true || row.IsDeleted === 'true' || row.IsDeleted === 'TRUE'
      };
    });

    const team: TeamMember[] = impTeamRaw.map(row => {
      const fallbackId = `TM_${generateStableId(row.Name || '')}`;
      return {
        id: String(row.ID || fallbackId),
        name: String(row.Name || "New Member"),
      role: row.Roles ? String(row.Roles).split(',').map((s: string) => s.trim()) : ["Member"],
      phone: String(row.Phone || ""),
      avatar: String(row.Avatar || (row.Name || "M")[0]),
      color: String(row.Color || 'bg-slate-900'),
      activeProjects: Number(row.ActiveCount) || 0,
      completedProjects: Number(row.CompletedCount) || 0,
      avgRating: Number(row.AvgRating) || 5,
      avgEffort: Number(row.AvgEffort) || 0,
      onTimeRate: Number(row.OnTimeRate) || 100,
      tags: row.Tags ? String(row.Tags).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      onboardingNotes: isUnlocked ? String(row.OnboardingNotes || "") : "",
      aadhaar_image_url: row.AadhaarImageUrl || '',
      kyc_declaration: row.KYCDeclaration === true || row.KYCDeclaration === 'true' || row.KYCDeclaration === 'TRUE',
      updatedAt: Number(row.UpdatedAt) || Date.now(),
      isDeleted: row.IsDeleted === true || row.IsDeleted === 'true' || row.IsDeleted === 'TRUE'
      };
    });

    const clients: Client[] = impClientsRaw.map(row => {
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
      updatedAt: Number(row.UpdatedAt) || Date.now(),
      isDeleted: row.IsDeleted === true || row.IsDeleted === 'true' || row.IsDeleted === 'TRUE'
      };
    });

    onImport({ projects, team, clients });
    const now = new Date().toLocaleString();
    setLastSync(now);
    localStorage.setItem('mmr_last_excel_sync', now);
    alert(`Successfully imported ${projects.length} projects, ${team.length} members, and ${clients.length} clients.`);
  };

  const handleRemoteSync = async () => {
    if (!remoteUrl) return;
    setIsFetching(true);
    try {
      const exportUrl = getExportUrl(remoteUrl);
      const separator = exportUrl.includes('?') ? '&' : '?';
      const fetchUrl = `${exportUrl}${separator}t=${Date.now()}`;
      
      const response = await fetch(fetchUrl);
      if (!response.ok) throw new Error("Connection Failed");
      const data = await response.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      processWorkbook(wb);
      
      // Save valid URL to persistence and notify parent
      localStorage.setItem('mmr_remote_db_url', remoteUrl);
      if (onSaveReadUrl) onSaveReadUrl(remoteUrl);
      
    } catch (e) {
      alert("Remote Database Sync Failed. Ensure the master link is public and direct /export.");
    } finally {
      setIsFetching(false);
    }
  };

  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    
    // Manual construction using Array of Arrays (AOA) to guarantee correct output
    const buildSheet = (headers: string[], dataRows: any[][], sheetName: string) => {
      const aoa = [headers, ...dataRows];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    };

    // 1. PROJECTS
    const projectHeaders = ["ID","Title","Status","Priority","ShootDate","ShootTime","Deadline","DueDate","Progress","Rating","Budget","Expenses","Location","Description","Notes","ClientID","ClientIDs","ClientName","ClientNames","Dependencies","Tags","TeamMemberIDs","InstagramLinks","IsOverdue","UpdatedAt","IsDeleted"];
    const projectData = currentData.projects.map(p => {
      const client = currentData.clients.find(c => c.id === p.clientId);
      const clientNames = (p.clientIds || []).map(id => {
        const c = currentData.clients.find(c => c.id === id);
        return c ? c.company || c.name : id;
      }).join(', ');

      return [
        p.id,
        p.title,
        p.status,
        p.priority,
        p.eventDate,
        p.eventTime || '',
        p.submissionDeadline || '',
        p.dueDate,
        p.progress,
        p.rating || '',
        isUnlocked ? p.budget : '***',
        isUnlocked ? p.expenses : '***',
        p.location,
        p.description,
        p.notes || '',
        p.clientId || '',
        (p.clientIds || []).join(', '),
        client ? client.company : '',
        clientNames,
        (p.dependencies || []).join(', '),
        (p.tags || []).join(', '),
        (p.teamMemberIds || []).join(', '),
        p.instaLinks ? JSON.stringify(p.instaLinks) : '[]',
        p.isOverdue || false,
        p.updatedAt || Date.now(),
        p.isDeleted || false
      ];
    });
    buildSheet(projectHeaders, projectData, "Projects");

    // 2. TEAM
    const teamHeaders = ["ID","Name","Roles","Phone","Avatar","Color","ActiveCount","CompletedCount","AvgRating","AvgEffort","OnTimeRate","Tags","OnboardingNotes","AadhaarImageUrl","KYCDeclaration","UpdatedAt","IsDeleted"];
    const teamData = currentData.team.map(m => [
      m.id,
      m.name,
      Array.isArray(m.role) ? m.role.join(', ') : m.role,
      m.phone,
      (m.avatar || '').replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase(),
      m.color,
      m.activeProjects,
      m.completedProjects,
      m.avgRating,
      m.avgEffort,
      m.onTimeRate,
      (m.tags || []).join(', '),
      isUnlocked ? (m.onboardingNotes || '') : '***',
      m.aadhaar_image_url || '',
      m.kyc_declaration ? 'true' : 'false',
      m.updatedAt || Date.now(),
      m.isDeleted || false
    ]);
    buildSheet(teamHeaders, teamData, "Team");

    // 3. CLIENTS
    const clientHeaders = ["ID","Name","Company","Phone","Email","Notes","Avatar","Color","CreatedAt","UpdatedAt","IsDeleted"];
    const clientData = currentData.clients.map(c => [
      c.id,
      c.name,
      c.company,
      c.phone,
      c.email,
      c.notes,
      (c.avatar || '').replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase(),
      c.color,
      c.createdAt,
      c.updatedAt || Date.now(),
      c.isDeleted || false
    ]);
    buildSheet(clientHeaders, clientData, "Clients");
    
    XLSX.writeFile(wb, `MMR_Master_Database_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 flex flex-col items-center gap-4 text-center">
        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm">
          <Globe size={32} />
        </div>
        <div>
          <h4 className="font-black text-slate-800 uppercase tracking-widest text-[11px]">Master Production Bridge</h4>
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1 italic">Pulling from Standard Master Host</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Read Connection */}
        <div className="space-y-2">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Google Sheet URL (For Reading Data)</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
              <input 
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:border-indigo-500 outline-none transition-all"
                placeholder="Paste your Google Sheet URL here..."
                value={remoteUrl}
                onChange={e => setRemoteUrl(e.target.value)}
                onBlur={() => {
                  if (remoteUrl) {
                    localStorage.setItem('mmr_remote_db_url', remoteUrl);
                    if (onSaveReadUrl) onSaveReadUrl(remoteUrl);
                  }
                }}
              />
            </div>
            <button 
              onClick={handleRemoteSync}
              disabled={!remoteUrl || isFetching}
              className={`p-3 rounded-xl flex items-center justify-center shadow-lg transition-all active:scale-95 ${remoteUrl ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
            >
              <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} />
            </button>
          </div>
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Last Spreadsheet Fetch: {lastSync}</p>
          <p className="text-[9px] text-amber-600 font-bold ml-2">âš ï¸ Important: Click "Share" in your Google Sheet and change "General access" to "Anyone with the link".</p>
        </div>

        {/* Legacy GAS write connection removed — Supabase is now the source of truth */}
      </div>

      {/* Logs Section */}
      {syncLogs && syncLogs.length > 0 && (
        <div className="mt-8 border-t pt-6">
          <button 
            onClick={() => setShowLogs(!showLogs)}
            className="w-full flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-slate-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600">
                <RefreshCw size={14} />
              </div>
              <div className="text-left">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-800">Sync Logs</h4>
                <p className="text-[8px] font-bold uppercase tracking-widest text-slate-400">View recent cloud activity</p>
              </div>
            </div>
            <span className="text-xs font-bold text-slate-400">{showLogs ? 'Hide' : 'Show'}</span>
          </button>

          {showLogs && (
            <div className="mt-4 bg-slate-900 rounded-2xl p-4 overflow-hidden shadow-inner">
              <div className="max-h-64 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                {syncLogs.map((log, idx) => (
                  <div key={idx} className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] font-mono text-slate-400">
                        {log.Timestamp ? new Date(log.Timestamp).toLocaleString() : 'Unknown Time'}
                      </span>
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                        log.Status === 'Success' ? 'bg-emerald-500/20 text-emerald-400' :
                        log.Status === 'Warning' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-rose-500/20 text-rose-400'
                      }`}>
                        {log.Status || 'Info'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-300 font-medium leading-relaxed">
                      {log.Details || JSON.stringify(log)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual Controls */}
      <div className="pt-6 border-t border-slate-100">
        <div className="grid grid-cols-2 gap-4 pt-2">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-3 p-6 bg-white border border-slate-100 rounded-[24px] hover:border-indigo-400 hover:bg-indigo-50/20 transition-all group active:scale-95 shadow-sm"
          >
            <Upload size={20} className="text-slate-400 group-hover:text-indigo-600" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Import .xlsx</span>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (evt) => {
                    const bstr = evt.target?.result;
                    const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
                    processWorkbook(wb);
                  };
                  reader.readAsBinaryString(file);
                }
              }} 
              className="hidden" 
              accept=".xlsx, .xls, .csv" 
            />
          </button>
          
          <button 
            onClick={handleExport}
            className="flex flex-col items-center gap-3 p-6 bg-white border border-slate-100 rounded-[24px] hover:border-emerald-400 hover:bg-emerald-50/20 transition-all group active:scale-95 shadow-sm"
          >
            <Download size={20} className="text-slate-400 group-hover:text-emerald-600" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Export .xlsx</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExcelDatabase;
