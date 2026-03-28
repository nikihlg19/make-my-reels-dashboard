import React from 'react';
import {
  Search, QrCode, Instagram, Rows, Columns
} from 'lucide-react';
import { PendingApproval } from '../types';
import NotificationBell from './NotificationBell';
import { Project } from '../types';

export interface FilterBarProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedPriority: string;
  setSelectedPriority: (p: any) => void;
  activeTab: string;
  stats: { revenue: number; burn: number; month: string };
  isFinancialsUnlocked: boolean;
  handleUnlockSuccess: () => void;
  isMobileStacked: boolean;
  setIsMobileStacked: (v: boolean) => void;
  showPaymentQR: boolean;
  setShowPaymentQR: (v: boolean) => void;
  pendingApprovals: PendingApproval[];
  handleApproveChange: (id: string) => void;
  handleRejectChange: (id: string) => void;
  projects: Project[];
  setActiveTab: (tab: any) => void;
  setEditingProject: (p: any) => void;
  isAdmin: boolean;
  onSmartAssign?: (projectId: string) => void;
}

const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery,
  setSearchQuery,
  activeTab,
  stats,
  isFinancialsUnlocked,
  handleUnlockSuccess,
  isMobileStacked,
  setIsMobileStacked,
  setShowPaymentQR,
  pendingApprovals,
  handleApproveChange,
  handleRejectChange,
  projects,
  setActiveTab,
  setEditingProject,
  isAdmin,
  onSmartAssign,
}) => {
  return (
    <div className="bg-white border-b px-4 md:px-6 py-2 flex flex-col sm:flex-row sm:items-center justify-between shrink-0 shadow-sm z-40 gap-2 sm:gap-0">
      <div className="flex items-center gap-3 w-full sm:w-auto">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input type="text" placeholder="Search..." className="w-full pl-8 pr-3 py-1.5 border border-slate-100 rounded-lg bg-slate-50 text-xs font-medium focus:bg-white transition-all outline-none" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 sm:gap-6 w-full sm:w-auto">
        <NotificationBell projects={projects} onProjectClick={(id) => { setActiveTab('Board'); setEditingProject(projects.find((p: Project) => p.id === id) || null); }} isAdmin={isAdmin} pendingApprovals={pendingApprovals.filter(a => a.status === 'pending')} onApprove={handleApproveChange} onReject={handleRejectChange} onSmartAssign={onSmartAssign} />
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
        <div className={`flex items-center gap-4 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 shrink-0 ${isAdmin && !isFinancialsUnlocked ? 'cursor-pointer' : ''}`} onClick={() => isAdmin && !isFinancialsUnlocked && handleUnlockSuccess()}>
          <div className="flex flex-col">
            <span className="text-[7px] text-slate-400 uppercase tracking-widest font-black leading-none mb-1">{stats.month} Revenue</span>
            <span className={`text-[11px] font-black text-slate-900 tabular-nums ${!isFinancialsUnlocked ? 'blur-[4px] select-none' : ''}`}>&#8377;{stats.revenue.toLocaleString()}</span>
          </div>
          <div className="w-px h-6 bg-slate-200" />
          <div className="flex flex-col">
            <span className="text-[7px] text-slate-400 uppercase tracking-widest font-black leading-none mb-1">{stats.month} Burn</span>
            <span className={`text-[11px] font-black text-rose-500 tabular-nums ${!isFinancialsUnlocked ? 'blur-[4px] select-none' : ''}`}>&#8377;{stats.burn.toLocaleString()}</span>
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
  );
};

export default FilterBar;
