
import React, { useState, useMemo, useEffect, useRef, lazy, Suspense } from 'react';
import { X, RefreshCw, Zap, UploadCloud } from 'lucide-react';
import { Project, TeamMember, Priority, ProjectStatus, Client, PendingApproval } from './types';
import { INITIAL_PROJECTS, INITIAL_TEAM, INITIAL_CLIENTS } from './constants';
import { SignIn } from '@clerk/react';

// Lazy-load tab content for code splitting — only the active tab is loaded
const Board = lazy(() => import('./components/Board'));
const Team = lazy(() => import('./components/Team'));
const Analytics = lazy(() => import('./components/Analytics'));
const Calendar = lazy(() => import('./components/Calendar'));
const Clients = lazy(() => import('./components/Clients'));

// These are needed eagerly (used in modals outside tabs)
import { EditProjectModal } from './components/EditProjectModal';
import TeamMemberCard from './components/TeamMemberCard';
import { ClientCard } from './components/Clients';
import NewProjectModal from './components/NewProjectModal';
import NewClientModal from './components/NewClientModal';
import ExcelDatabase from './components/ExcelDatabase';
import HeaderNav from './components/HeaderNav';
import GASScript from './components/GASScript';
import FilterBar from './components/FilterBar';
import { DailyDigestView } from './components/DailyDigestView';
import { useAdminDigest } from './src/hooks/useAdminDigest';
import PaymentQRModal from './components/PaymentQRModal';
import { useAuthState } from './src/hooks/useAuthState';
import { useSupabaseSync } from './src/hooks/useSupabaseSync';
import { useSupabaseMutations } from './src/hooks/useSupabaseMutations';
import { useApprovalQueue } from './src/hooks/useApprovalQueue';
import { parseDateSafe } from './src/utils/sheetSync';

export type DateFilterType = '1m' | '1y' | 'all' | 'custom';

export interface DateFilter {
  type: DateFilterType;
  start?: string;
  end?: string;
}

// Legacy GAS references (kept for ExcelDatabase import compatibility)
const MASTER_DB_URL = import.meta.env.VITE_MASTER_DB_URL || '';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'Board' | 'Calendar' | 'Clients' | 'Team' | 'Analytics' | 'Script'>('Board');

  // Legacy: kept only for ExcelDatabase preconfiguredUrl
  const scriptUrl = ''; // GAS removed — Supabase is now the source of truth

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

  const [lastLocalUpdate, setLastLocalUpdate] = useState<number>(() => {
    return Number(localStorage.getItem('mmr_last_local_update') || 0);
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<Priority | 'All'>('All');
  const [selectedMemberFilter] = useState<string | 'All'>('All');
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [initialProjectStatus, setInitialProjectStatus] = useState<ProjectStatus | undefined>(undefined);
  const [isNewClientModalOpen, setIsNewClientModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>({ type: 'all' });
  const [isFinancialsUnlocked, setIsFinancialsUnlocked] = useState(false);
  const [financialMonth] = useState(new Date());
  const [isMobileStacked, setIsMobileStacked] = useState(false);
  const [previewMember, setPreviewMember] = useState<TeamMember | null>(null);
  const [previewClient, setPreviewClient] = useState<Client | null>(null);
  const [memberForTags, setMemberForTags] = useState<TeamMember | null>(null);
  const [showPaymentQR, setShowPaymentQR] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showDigest, setShowDigest] = useState(false);

  const { digest } = useAdminDigest();
  const digestUrgent = digest
    ? (digest.overdueProjects?.length > 0 || digest.pendingConfirmations?.length > 0)
    : false;

  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>(() => {
    const saved = localStorage.getItem('mmr_pending_approvals');
    return saved ? JSON.parse(saved) : [];
  });

  // Refs
  const projectsRef = useRef(projects);
  const teamRef = useRef(team);
  const clientsRef = useRef(clients);
  const pendingApprovalsRef = useRef<PendingApproval[]>(pendingApprovals);

  useEffect(() => { projectsRef.current = projects; }, [projects]);
  useEffect(() => { teamRef.current = team; }, [team]);
  useEffect(() => { clientsRef.current = clients; }, [clients]);
  useEffect(() => { pendingApprovalsRef.current = pendingApprovals; }, [pendingApprovals]);

  // --- Auth ---
  const { user, isAdmin, currentUserName, currentUserEmail } = useAuthState();

  // --- Supabase Sync (replaces Google Sheets polling) ---
  const { teamRoles, isSyncing, lastSyncedTime, lastSyncError } = useSupabaseSync({
    projectsRef,
    teamRef,
    clientsRef,
    setProjects,
    setTeam,
    setClients,
  });

  // --- Supabase Mutations (replaces GAS cloud commit) ---
  const {
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
  } = useSupabaseMutations({
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
  });

  // --- Approval Queue ---
  const { queueForApproval, onCancelApproval, handleApproveChange, handleRejectChange } = useApprovalQueue({
    pendingApprovals,
    setPendingApprovals,
    pendingApprovalsRef,
    projectsRef,
    teamRef,
    clientsRef,
    updateProjects,
    updateTeam,
    updateClients,
    debouncedCommit,
    updateLocalTimestamp,
    currentUserName,
    currentUserEmail,
    isAdmin,
    projects,
    team,
    clients,
  });

  // --- Event Handlers ---
  const getChangedFields = (oldProject: Project, newProject: Project): string => {
    return Object.keys(newProject)
      .filter(key => {
        if (['updatedAt', 'id'].includes(key)) return false;
        return JSON.stringify(oldProject[key as keyof Project]) !== JSON.stringify(newProject[key as keyof Project]);
      })
      .join(', ');
  };

  const onProjectUpdate = (updatedProject: Project) => {
    const existingProject = projects.find(p => p.id === updatedProject.id);
    let actionDesc = `Updated Project: ${updatedProject.title}`;
    let changedFields = existingProject ? getChangedFields(existingProject, updatedProject) : '';

    if (existingProject && existingProject.status !== updatedProject.status) {
      actionDesc = `Moved '${updatedProject.title}' to ${updatedProject.status}`;
    }

    if (!isAdmin) {
      const changes: any = {};
      let isOnlyStatusChange = false;
      let allowedStatusChange = false;

      if (existingProject) {
        let changedKeys = 0;
        let statusChanged = false;

        Object.keys(updatedProject).forEach(key => {
          const newVal = updatedProject[key as keyof Project];
          const oldVal = existingProject[key as keyof Project];
          if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
            changes[key] = { before: oldVal, after: newVal };
            changedKeys++;
            if (key === 'status') statusChanged = true;
          }
        });

        isOnlyStatusChange = changedKeys === 1 && statusChanged;

        // Also allow moves where only status/progress/rating changed (Board always sends these together)
        const boardMoveKeys = new Set(Object.keys(changes));
        boardMoveKeys.delete('status');
        boardMoveKeys.delete('progress');
        boardMoveKeys.delete('rating');
        const isBoardMove = statusChanged && boardMoveKeys.size === 0;

        if (isOnlyStatusChange || isBoardMove) {
          const allowedStatuses: string[] = ['To Do', 'In Progress', 'Quote Sent', 'Expired'];
          if (allowedStatuses.includes(existingProject.status) && allowedStatuses.includes(updatedProject.status)) {
            allowedStatusChange = true;
          }
        }
      } else {
        Object.keys(updatedProject).forEach(key => {
          changes[key] = { before: null, after: (updatedProject as any)[key] };
        });
      }

      if (allowedStatusChange) {
        const stamped = { ...updatedProject, updatedAt: Date.now() };
        const next = projects.map(p => p.id === stamped.id ? stamped : p);
        updateProjects(next, actionDesc, changedFields);
        return;
      }

      queueForApproval({
        type: existingProject ? 'edit' : 'create',
        entityType: 'project',
        entityId: updatedProject.id,
        entityTitle: updatedProject.title,
        changes
      });
      return;
    }

    const stamped = { ...updatedProject, updatedAt: Date.now() };
    const next = projects.map(p => p.id === stamped.id ? stamped : p);
    updateProjects(next, actionDesc, changedFields);
  };

  const handleProjectCreate = (p: Project) => {
    if (!isAdmin) {
      const changes: any = {};
      Object.keys(p).forEach(k => changes[k] = { before: null, after: (p as any)[k] });
      queueForApproval({ type: 'create', entityType: 'project', entityId: p.id, entityTitle: p.title, changes });
      return;
    }
    updateProjects([{...p, updatedAt: Date.now()}, ...projects], `Created Project: ${p.title}`);
  };

  const onProjectDelete = (projectId: string) => {
    const proj = projects.find(p => p.id === projectId);
    if (!proj) return;

    if (!isAdmin) {
      queueForApproval({
        type: 'delete',
        entityType: 'project',
        entityId: proj.id,
        entityTitle: proj.title,
        changes: { isDeleted: { before: false, after: true } }
      });
      return;
    }

    const next = projects.map(p => p.id === projectId ? { ...p, isDeleted: true, updatedAt: Date.now() } : p);
    updateProjects(next, `Deleted Project: ${proj.title || projectId}`);
  };

  const handleClientUpdate = (c: Client) => {
    if (!isAdmin) {
      const existing = clients.find(cl => cl.id === c.id);
      const changes: any = {};
      if (existing) {
        Object.keys(c).forEach(key => {
          if (c[key as keyof Client] !== existing[key as keyof Client]) {
            changes[key] = { before: existing[key as keyof Client], after: c[key as keyof Client] };
          }
        });
      } else {
        Object.keys(c).forEach(key => {
          changes[key] = { before: null, after: (c as any)[key] };
        });
      }
      queueForApproval({ type: existing ? 'edit' : 'create', entityType: 'client', entityId: c.id, entityTitle: c.company || c.name, changes });
      return;
    }
    updateClients(clients.map(old => old.id === c.id ? {...c, updatedAt: Date.now()} : old), `Updated Client: ${c.company || c.name}`);
  };

  const handleClientCreate = (c: Client) => {
    if (!isAdmin) {
      const changes: any = {};
      Object.keys(c).forEach(k => changes[k] = { before: null, after: (c as any)[k] });
      queueForApproval({ type: 'create', entityType: 'client', entityId: c.id, entityTitle: c.company || c.name, changes });
      return;
    }
    updateClients([{...c, updatedAt: Date.now()}, ...clients], `Added Client: ${c.company || c.name}`);
  };

  const handleClientDelete = (id: string) => {
    const client = clients.find(c => c.id === id);
    if (!client) return;
    if (!isAdmin) {
      queueForApproval({ type: 'delete', entityType: 'client', entityId: client.id, entityTitle: client.company || client.name, changes: { isDeleted: { before: false, after: true } } });
      return;
    }
    updateClients(clients.map(c => c.id === id ? { ...c, isDeleted: true, updatedAt: Date.now() } : c), `Deleted Client: ${client.company || client.name}`);
  };

  const handleTeamMemberUpdate = (m: TeamMember) => {
    if (!isAdmin) {
      const existing = team.find(tm => tm.id === m.id);
      const changes: any = {};
      if (existing) {
        Object.keys(m).forEach(key => {
          if (m[key as keyof TeamMember] !== existing[key as keyof TeamMember]) changes[key] = { before: existing[key as keyof TeamMember], after: m[key as keyof TeamMember] };
        });
      } else {
        Object.keys(m).forEach(key => {
          changes[key] = { before: null, after: (m as any)[key] };
        });
      }
      queueForApproval({ type: existing ? 'edit' : 'create', entityType: 'team', entityId: m.id, entityTitle: m.name, changes });
      return;
    }
    updateTeam(team.map(old => old.id === m.id ? {...m, updatedAt: Date.now()} : old), `Updated Team Member: ${m.name}`);
  };

  const handleTeamMemberCreate = (m: TeamMember) => {
    if (!isAdmin) {
      const changes: any = {};
      Object.keys(m).forEach(k => changes[k] = { before: null, after: (m as any)[k] });
      queueForApproval({ type: 'create', entityType: 'team', entityId: m.id, entityTitle: m.name, changes });
      return;
    }
    updateTeam([...team, {...m, updatedAt: Date.now()}], `Added Team Member: ${m.name}`);
  };

  const handleTeamMemberDelete = (id: string) => {
    const member = team.find(m => m.id === id);
    if (!member) return;
    if (!isAdmin) {
      queueForApproval({ type: 'delete', entityType: 'team', entityId: member.id, entityTitle: member.name, changes: { isDeleted: { before: false, after: true } } });
      return;
    }
    updateTeam(team.map(m => m.id === id ? { ...m, isDeleted: true, updatedAt: Date.now() } : m), `Deleted Team Member: ${member.name}`);
  };

  const handleUnlockSuccess = () => {
    if (!isAdmin) return;
    setIsFinancialsUnlocked(true);
    localStorage.setItem('mmr_unlocked', 'true');
  };

  const handleLockState = () => {
    setIsFinancialsUnlocked(false);
    localStorage.setItem('mmr_unlocked', 'false');
  };

  // Legacy handlers — kept as no-ops for ExcelDatabase prop compatibility
  const handleReadUrlSave = (_url: string) => {};
  const handleSaveScriptUrl = (_url: string) => {};

  // --- Derived State ---
  const activeProjects = useMemo(() => projects.filter(p => !p.isDeleted), [projects]);
  const activeTeam = useMemo(() => team.filter(t => !t.isDeleted), [team]);
  const activeClients = useMemo(() => clients.filter(c => !c.isDeleted), [clients]);

  const pendingProjectDeletes = useMemo(() =>
    pendingApprovals
      .filter(a => a.type === 'delete' && a.entityType === 'project' && a.status === 'pending')
      .map(a => ({ projectId: a.entityId, approvalId: a.id })),
    [pendingApprovals]
  );

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
    const targetMonth = financialMonth.getMonth();
    const targetYear = financialMonth.getFullYear();

    const monthProjects = activeProjects.filter(p => {
      const d = parseDateSafe(p.eventDate);
      if (!d) return false;
      const isCorrectMonth = d.getFullYear() === targetYear && d.getMonth() === targetMonth;
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

  return (
    <>
      {!user ? (
        <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
           <SignIn fallbackRedirectUrl="/" />
        </div>
      ) : (
        <div className="h-screen flex flex-col bg-[#F8FAFC] text-slate-900 overflow-hidden font-sans">
          <HeaderNav
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            isSyncing={isSyncing}
            isSaving={isSaving}
            lastSyncError={lastSyncError}
            lastSyncedTime={lastSyncedTime}
            isAdmin={isAdmin}
            showSyncModal={showSyncModal}
            setShowSyncModal={setShowSyncModal}
            testStatus={testStatus}
            isFinancialsUnlocked={isFinancialsUnlocked}
            handleLockState={handleLockState}
            handleUnlockSuccess={handleUnlockSuccess}
            setIsNewProjectModalOpen={setIsNewProjectModalOpen}
            user={user}
            onShowDigest={() => setShowDigest(true)}
            digestUrgent={digestUrgent}
          />

          <FilterBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedPriority={selectedPriority}
            setSelectedPriority={setSelectedPriority}
            activeTab={activeTab}
            stats={stats}
            isFinancialsUnlocked={isFinancialsUnlocked}
            handleUnlockSuccess={handleUnlockSuccess}
            isMobileStacked={isMobileStacked}
            setIsMobileStacked={setIsMobileStacked}
            showPaymentQR={showPaymentQR}
            setShowPaymentQR={setShowPaymentQR}
            pendingApprovals={pendingApprovals}
            handleApproveChange={handleApproveChange}
            handleRejectChange={handleRejectChange}
            projects={projects}
            setActiveTab={setActiveTab}
            setEditingProject={setEditingProject}
            isAdmin={isAdmin}
          />

      <main className="flex-1 relative overflow-hidden bg-[#F4F5F7]">
        <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" /></div>}>
          {activeTab === 'Board' && <Board projects={filteredProjects} team={activeTeam} clients={activeClients} isAdmin={isAdmin} pendingProjectDeletes={pendingProjectDeletes} onCancelApproval={onCancelApproval} onProjectUpdate={onProjectUpdate} onProjectDelete={onProjectDelete} onEditProject={setEditingProject} onCreateProjectWithStatus={(status: ProjectStatus) => { setInitialProjectStatus(status); setIsNewProjectModalOpen(true); }} isFinancialsUnlocked={isFinancialsUnlocked} onRequestUnlock={handleUnlockSuccess} onPreviewMember={setPreviewMember} onClientClick={(clientId: string) => { const client = activeClients.find(c => c.id === clientId); if (client) { setPreviewClient(client); } }} isMobileStacked={isMobileStacked} />}
          {activeTab === 'Calendar' && <Calendar projects={activeProjects} onCreateProject={() => setIsNewProjectModalOpen(true)} onEditProject={(id: string) => setEditingProject(projects.find(p => p.id === id) || null)} />}
          {activeTab === 'Clients' && <Clients clients={activeClients} projects={activeProjects} team={activeTeam} isAdmin={isAdmin} onAddClient={() => setIsNewClientModalOpen(true)} onUpdateClient={handleClientUpdate} onDeleteClient={handleClientDelete} onEditProject={setEditingProject} onDeleteProject={onProjectDelete} onPreviewMember={setPreviewMember} editingClient={editingClient} setEditingClient={setEditingClient} isFinancialsUnlocked={isFinancialsUnlocked} globalSearchQuery={searchQuery} />}
          {activeTab === 'Team' && <Team team={activeTeam} projects={activeProjects} teamRoles={teamRoles} isAdmin={isAdmin} onAddMember={(m: TeamMember) => handleTeamMemberCreate(m)} onDeleteMember={handleTeamMemberDelete} onUpdateMember={handleTeamMemberUpdate} onUpdateMemberTags={(id: string, tags: string[]) => { const tm = team.find(t=>t.id===id); if(tm) handleTeamMemberUpdate({...tm, tags}); }} onUpdateMemberNotes={(id: string, notes: string) => { const tm = team.find(t=>t.id===id); if(tm) handleTeamMemberUpdate({...tm, onboardingNotes: notes}); }} onEditProject={setEditingProject} isFinancialsUnlocked={isFinancialsUnlocked} whatsappMember={null} setWhatsappMember={() => {}} memberForTags={memberForTags} setMemberForTags={setMemberForTags} onGlobalUnlock={handleUnlockSuccess} globalSearchQuery={searchQuery} />}
          {activeTab === 'Analytics' && <Analytics team={activeTeam} projects={filteredProjects} clients={activeClients} dateFilter={dateFilter} setDateFilter={setDateFilter} onPreviewMember={setPreviewMember} onEditProject={setEditingProject} />}
          {activeTab === 'Script' && <GASScript />}
        </Suspense>
      </main>

      {showPaymentQR && <PaymentQRModal onClose={() => setShowPaymentQR(false)} />}

      {/* Daily Digest Modal */}
      {showDigest && (
        <div className="fixed inset-0 z-[200] flex items-start justify-end p-4 pt-16">
          <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm" onClick={() => setShowDigest(false)} />
          <div className="relative w-full max-w-md animate-in slide-in-from-top-4 duration-200">
            <DailyDigestView onClose={() => setShowDigest(false)} />
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
              syncLogs={[]}
            />
            <div className="mt-8 pt-6 border-t space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl border border-slate-100 mt-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${lastSyncError ? 'bg-rose-500' : 'bg-emerald-500 animate-pulse'}`} />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      {lastSyncError ? 'Supabase Error' : 'Supabase Connected'}
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
                   <UploadCloud size={14} /> Force Push Local to Supabase
                 </button>
                 <p className="text-[8px] text-slate-400 text-center mt-2 px-4">Use this if Supabase is empty or desynchronized. It will overwrite the database with your current local view.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {isNewProjectModalOpen && <NewProjectModal isOpen={isNewProjectModalOpen} onClose={() => { setIsNewProjectModalOpen(false); setInitialProjectStatus(undefined); }} initialStatus={initialProjectStatus} team={team} clients={clients} projects={projects} onAddProject={handleProjectCreate} />}
      {editingProject && <EditProjectModal project={editingProject} team={team} clients={clients} projects={projects} onClose={() => setEditingProject(null)} onUpdate={(updated) => { onProjectUpdate(updated); setEditingProject(null); }} isUnlocked={isFinancialsUnlocked} />}
      {isNewClientModalOpen && <NewClientModal isOpen={isNewClientModalOpen} onClose={() => setIsNewClientModalOpen(false)} onAddClient={handleClientCreate} existingClients={clients} />}

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
              onUpdateNotes={(notes: string) => updateTeam(team.map(m => m.id === previewMember.id ? {...m, onboardingNotes: notes} : m), `Updated Notes for Team Member ID: ${previewMember.id}`)}
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
    )}
    </>
  );
};

export default App;
