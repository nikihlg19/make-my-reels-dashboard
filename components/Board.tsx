
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Project, ProjectStatus, TeamMember, Client } from '../types';
import {
  Plus, X, Trash2, Star, ArrowRightLeft
} from 'lucide-react';
import { DateFilter } from '../App';
import { ProjectCard } from './ProjectCard';
import { CompletedVault } from './CompletedVault';

// Re-export EditProjectModal so App.tsx can keep importing from './components/Board'
export { EditProjectModal } from './EditProjectModal';

interface BoardProps {
  projects: Project[];
  team: TeamMember[];
  clients: Client[];
  onProjectUpdate: (p: Project) => void;
  onProjectDelete: (id: string) => void;
  onEditProject: (p: Project) => void;
  onCreateProjectWithStatus: (status: ProjectStatus) => void;
  isFinancialsUnlocked?: boolean;
  isAdmin?: boolean;
  pendingProjectDeletes?: { projectId: string; approvalId: string }[];
  onCancelApproval?: (approvalId: string) => void;
  onRequestUnlock?: () => void;
  dateFilter?: DateFilter;
  setDateFilter?: (filter: DateFilter) => void;
  onPreviewMember?: (member: TeamMember) => void;
  onClientClick?: (clientId: string) => void;
  isMobileStacked?: boolean;
  onSmartAssign?: (projectId: string) => void;
}

const COLUMNS: ProjectStatus[] = ['Expired', 'Quote Sent', 'To Do', 'In Progress'];

const Board: React.FC<BoardProps> = ({
  projects,
  team,
  clients,
  onProjectUpdate,
  onProjectDelete,
  onEditProject,
  onCreateProjectWithStatus,
  isFinancialsUnlocked = false,
  isAdmin = false,
  pendingProjectDeletes = [],
  onCancelApproval,
  onRequestUnlock,
  onPreviewMember,
  onClientClick,
  isMobileStacked = false,
  onSmartAssign,
}) => {
  const [expandedCompleted, setExpandedCompleted] = useState(false);
  const [pendingVaultOpen, setPendingVaultOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [moveConfirmation, setMoveConfirmation] = useState<{ project: Project; targetStatus: ProjectStatus; rating?: number } | null>(null);

  const vaultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (expandedCompleted && vaultRef.current && !vaultRef.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (target.tagName.toLowerCase() === 'input' && target.getAttribute('placeholder') === 'Search...') {
          return;
        }
        setExpandedCompleted(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [expandedCompleted]);

  const getProjectsInStatus = useCallback(
    (status: ProjectStatus) => projects.filter(p => p.status === status),
    [projects]
  );

  const completedProjects = useMemo(() => getProjectsInStatus('Completed'), [getProjectsInStatus]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.add('bg-slate-200/50');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).classList.remove('bg-slate-200/50');
  };

  const handleDrop = (e: React.DragEvent, status: ProjectStatus) => {
    e.preventDefault();
    handleDragLeave(e);
    const projectId = e.dataTransfer.getData('projectId');
    const project = projects.find(p => p.id === projectId);

    if (project && project.status !== status) {
      if (status === 'Completed') {
        // Only show confirmation popup when moving to Completed (for rating + agreement check)
        setMoveConfirmation({ project, targetStatus: status, rating: project.rating });
      } else {
        // Move directly for To Do / In Progress / Quote Sent / Expired — no popup
        onProjectUpdate({ ...project, status, progress: project.progress, rating: project.rating });
      }
    }
  };

  const confirmMove = () => {
    if (moveConfirmation) {
      const { project, targetStatus, rating } = moveConfirmation;
      onProjectUpdate({
        ...project,
        status: targetStatus,
        progress: targetStatus === 'Completed' ? 100 : project.progress,
        rating: targetStatus === 'Completed' ? rating : project.rating
      });
      setMoveConfirmation(null);
    }
  };

  const handleToggleVault = useCallback(() => {
    if (expandedCompleted) {
      setExpandedCompleted(false);
    } else {
      if (isFinancialsUnlocked) {
        setExpandedCompleted(true);
      } else {
        setPendingVaultOpen(true);
        onRequestUnlock?.();
      }
    }
  }, [expandedCompleted, isFinancialsUnlocked, onRequestUnlock]);

  useEffect(() => {
    if (isFinancialsUnlocked && pendingVaultOpen) {
      setExpandedCompleted(true);
      setPendingVaultOpen(false);
    }
  }, [isFinancialsUnlocked, pendingVaultOpen]);

  const handleVaultDrop = useCallback((e: React.DragEvent) => {
    handleDrop(e, 'Completed');
  }, [projects]);

  return (
    <div className="absolute inset-0 flex flex-col bg-[#F4F5F7]">
      <div className={`flex-1 flex gap-4 px-4 md:px-6 py-4 scrollbar-hide md:snap-none ${isMobileStacked ? 'flex-col md:flex-row overflow-y-auto overflow-x-hidden md:overflow-x-auto md:overflow-y-hidden' : 'overflow-x-auto snap-x snap-mandatory scroll-pl-4'}`}>
        {COLUMNS.map(column => (
          <div
            key={column}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, column)}
            className={`flex-shrink-0 flex flex-col gap-3 rounded-2xl bg-[#EBECF0]/70 p-3 border border-transparent transition-colors md:snap-align-none ${isMobileStacked ? 'w-full md:w-[320px] h-[45vh] md:h-full' : 'w-[85vw] sm:w-[320px] h-full snap-start snap-always'}`}
          >
            <div className="flex items-center justify-between px-2 py-1">
              <div className="flex items-center gap-2 group cursor-pointer" onClick={() => onCreateProjectWithStatus(column)}>
                <h3 className="font-bold uppercase tracking-widest text-[10px] text-slate-500 group-hover:text-indigo-600 transition-colors">{column}</h3>
                <Plus size={12} className="text-slate-400 group-hover:text-indigo-600" />
              </div>
              <span className="bg-slate-200/50 px-2 py-0.5 rounded-full text-[9px] font-black text-slate-500">{getProjectsInStatus(column).length}</span>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-3 pb-10">
              {getProjectsInStatus(column).map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  team={team}
                  projects={projects}
                  clients={clients}
                  onClick={() => onEditProject(project)}
                  onPreviewMember={onPreviewMember}
                  onClientClick={onClientClick}
                  onDelete={() => setDeleteTarget(project)}
                  isFinancialsUnlocked={isFinancialsUnlocked}
                  pendingDeleteApprovalId={pendingProjectDeletes.find(pd => pd.projectId === project.id)?.approvalId}
                  onCancelApproval={onCancelApproval}
                  onSmartAssign={onSmartAssign}
                />
              ))}

              <button
                onClick={() => onCreateProjectWithStatus(column)}
                className="w-full py-6 rounded-[20px] border-2 border-dashed border-indigo-200/50 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all group flex flex-col items-center justify-center gap-2 mt-2 opacity-70 hover:opacity-100"
              >
                <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500 group-hover:scale-110 transition-transform shadow-sm">
                  <Plus size={16} />
                </div>
                <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest group-hover:text-indigo-600">Add Unit</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      <CompletedVault
        completedProjects={completedProjects}
        team={team}
        projects={projects}
        clients={clients}
        isFinancialsUnlocked={isFinancialsUnlocked}
        expandedCompleted={expandedCompleted}
        onToggleVault={handleToggleVault}
        onEditProject={onEditProject}
        onDeleteProject={(p) => setDeleteTarget(p)}
        onCreateProjectWithStatus={onCreateProjectWithStatus}
        onPreviewMember={onPreviewMember}
        onClientClick={onClientClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleVaultDrop}
        vaultRef={vaultRef}
      />

      {deleteTarget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div onClick={e => e.stopPropagation()} className="relative bg-white rounded-[28px] w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center bg-rose-50">
                <Trash2 size={28} className="text-rose-500" />
              </div>
              <h3 className="text-lg font-black text-slate-800 tracking-tight uppercase mb-2">Delete Project</h3>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">
                {isAdmin
                  ? `Are you sure you want to delete "${deleteTarget.title}"? This action cannot be undone.`
                  : `Are you sure you want to delete "${deleteTarget.title}" and send for approval to Admin?`
                }
              </p>
            </div>
            <div className="flex border-t border-slate-100">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-4 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all flex items-center justify-center gap-2">
                <X size={16} /> Cancel
              </button>
              <button onClick={() => { onProjectDelete(deleteTarget.id); setDeleteTarget(null); }} className="flex-1 py-4 text-[11px] font-black uppercase tracking-widest text-white bg-rose-500 hover:bg-rose-600 transition-all flex items-center justify-center gap-2">
                <Trash2 size={16} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {moveConfirmation && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setMoveConfirmation(null)} />
          <div className="relative bg-white rounded-[32px] p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95 border border-slate-100">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-indigo-600 shadow-sm">
                <ArrowRightLeft size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">
                Agreement Changes?
              </h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-relaxed mb-4">
                Were there changes in the original agreement for "<span className="text-slate-800">{moveConfirmation.project.title}</span>"?
              </p>

              {moveConfirmation.targetStatus === 'Completed' && (
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-6">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Client Satisfaction Rating</label>
                  <div className="flex justify-center gap-2">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        onClick={() => setMoveConfirmation({ ...moveConfirmation, rating: star })}
                        className={`p-2 rounded-xl transition-all ${moveConfirmation.rating && moveConfirmation.rating >= star ? 'text-amber-500 bg-amber-50 scale-110' : 'text-slate-300 hover:text-amber-400 hover:bg-amber-50/50'}`}
                      >
                        <Star size={24} className={moveConfirmation.rating && moveConfirmation.rating >= star ? 'fill-amber-500' : ''} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={confirmMove}
                className="flex-1 py-4 rounded-2xl border-2 border-slate-100 font-black text-[10px] uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all"
              >
                No
              </button>
              <button
                onClick={() => {
                  onEditProject({ ...moveConfirmation.project, status: moveConfirmation.targetStatus });
                  setMoveConfirmation(null);
                }}
                className={`flex-1 py-4 rounded-2xl text-white font-black text-[10px] uppercase tracking-widest shadow-xl hover:opacity-90 transition-all active:scale-95 bg-indigo-600`}
              >
                Yes
              </button>
            </div>
            <button
              onClick={() => setMoveConfirmation(null)}
              className="w-full mt-3 py-3 rounded-2xl text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all"
            >
              Cancel Move
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Board;
