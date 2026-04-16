import React from 'react';
import {
  LayoutGrid, Calendar as CalendarIcon, Users, BarChart3,
  Lock, EyeOff, Database, RefreshCw, CheckCircle,
  UploadCloud, AlertTriangle, Briefcase, Sun
} from 'lucide-react';
import { UserButton } from '@clerk/react';

type TabType = 'Board' | 'Calendar' | 'Clients' | 'Team' | 'Analytics';

export interface HeaderNavProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  isSyncing: boolean;
  isSaving: boolean;
  lastSyncError: string | null;
  lastSyncedTime: string | null;
  isAdmin: boolean;
  showSyncModal: boolean;
  setShowSyncModal: (v: boolean) => void;
  testStatus: 'idle' | 'testing' | 'success' | 'failed';
  isFinancialsUnlocked: boolean;
  handleLockState: () => void;
  handleUnlockSuccess: () => void;
  setIsNewProjectModalOpen: (v: boolean) => void;
  user: any;
  onShowDigest?: () => void;
  digestUrgent?: boolean;
}

const HeaderNav: React.FC<HeaderNavProps> = ({
  activeTab,
  setActiveTab,
  isSyncing,
  isSaving,
  lastSyncError,
  lastSyncedTime,
  isAdmin,
  setShowSyncModal,
  isFinancialsUnlocked,
  handleLockState,
  handleUnlockSuccess,
  setIsNewProjectModalOpen,
  user,
  onShowDigest,
  digestUrgent = false,
}) => {
  const navItems = [
    { id: 'Board', icon: LayoutGrid },
    { id: 'Calendar', icon: CalendarIcon },
    { id: 'Clients', icon: Briefcase },
    { id: 'Team', icon: Users },
    ...(isAdmin ? [{ id: 'Analytics', icon: BarChart3 }] : [])
  ];

  return (
    <header className="bg-white border-b px-4 md:px-6 py-2 flex flex-col md:flex-row md:items-center justify-between z-[60] shrink-0 md:h-16 shadow-sm gap-2 md:gap-0">
      <div className="flex items-center justify-between w-full md:w-auto md:gap-8">
        <div className="flex flex-col leading-none cursor-pointer group" onClick={() => setActiveTab('Board')}>
          <span className="text-base font-black tracking-tighter text-slate-900 uppercase">Make My</span>
          <span className="text-base font-black tracking-tighter text-[#4F46E5] uppercase">Reels</span>
        </div>
        <nav className="flex md:hidden items-center gap-1 overflow-x-auto scrollbar-hide max-w-[60vw]">
          {navItems.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`flex items-center gap-1 px-2 py-1.5 rounded-lg transition-all shrink-0 ${activeTab === tab.id ? 'bg-[#4F46E5] text-white font-bold shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
              <tab.icon size={12} /><span className="text-[9px] uppercase tracking-widest">{tab.id}</span>
            </button>
          ))}
        </nav>
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${activeTab === tab.id ? 'bg-[#4F46E5] text-white font-bold shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
              <tab.icon size={14} /><span className="text-[10px] uppercase tracking-widest">{tab.id}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2 md:gap-4 w-full md:w-auto min-w-0">
        {/* Admin tools — scrollable on mobile so they don't push the right-side buttons off screen */}
        {isAdmin && (
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1 md:pb-0 min-w-0">
            <div className={`flex items-center gap-2 px-2 md:px-3 py-1.5 rounded-xl border transition-all shadow-sm shrink-0 ${lastSyncError ? 'bg-rose-50 border-rose-100 text-rose-600' : isSaving ? 'bg-amber-100 border-amber-200 text-amber-700' : isSyncing ? 'bg-indigo-50 border-indigo-100 text-indigo-500' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}>
              {lastSyncError ? <AlertTriangle size={14} /> : isSaving ? <UploadCloud size={14} className="animate-pulse" /> : isSyncing ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle size={12} />}
              <span className="text-[9px] font-black uppercase tracking-widest hidden sm:inline">
                {lastSyncError ? 'Sync Failed' : isSaving ? 'Pushing Updates...' : isSyncing ? 'Syncing...' : `Sheet: ${lastSyncedTime || 'Ready'}`}
              </span>
            </div>

            <button
              onClick={() => setShowSyncModal(true)}
              className="flex items-center gap-1.5 px-2 md:px-3 py-2 rounded-lg font-black text-[10px] transition-all border shrink-0 bg-indigo-600 text-white shadow-md"
            >
              <Database size={14} />
              <span className="uppercase tracking-widest hidden xl:inline">Supabase Connected</span>
            </button>

            <button onClick={() => isFinancialsUnlocked ? handleLockState() : handleUnlockSuccess()} className={`flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-lg font-black text-[10px] transition-all shadow-sm shrink-0 ${isFinancialsUnlocked ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-900 text-white hover:bg-black'}`}>
              {isFinancialsUnlocked ? <EyeOff size={12} /> : <Lock size={12} />}
              <span className="uppercase tracking-widest hidden lg:inline">{isFinancialsUnlocked ? 'Unlocked Session' : 'Unlock Access'}</span>
            </button>

            {onShowDigest && (
              <button
                onClick={onShowDigest}
                className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg font-black text-[10px] transition-all shrink-0 ${digestUrgent ? 'bg-amber-500 text-white shadow-md' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}
                title="Daily Briefing"
              >
                <Sun size={14} />
                <span className="uppercase tracking-widest hidden lg:inline">Briefing</span>
                {digestUrgent && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white" />
                )}
              </button>
            )}
          </div>
        )}

        {/* User + New Project — always pinned, never clipped */}
        <div className="flex items-center gap-2 shrink-0 pl-2 border-l border-slate-200">
          <UserButton />
          {user?.firstName && (
            <span className="text-xs font-semibold text-slate-700 hidden lg:inline">
              {user.firstName}
            </span>
          )}
          <button onClick={() => setIsNewProjectModalOpen(true)} className="bg-[#4F46E5] text-white px-4 md:px-5 py-2 rounded-lg font-black shadow-lg hover:bg-[#3f38c2] transition-all text-[10px] uppercase tracking-widest shrink-0">
            New Project
          </button>
        </div>
      </div>
    </header>
  );
};

export default HeaderNav;
