
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Project, ProjectStatus, TeamMember, Priority, InstaLink, Client } from '../types';
import { 
  Plus, Instagram, Check, ShieldCheck, 
  X, ExternalLink, Trash2, ChevronUp, ChevronDown as ChevronDownIcon, 
  Minus, AlertCircle, Star, Calendar, Camera, Target,
  Search, Link as LinkIcon, Tag, FileText, IndianRupee, Users, StarHalf, ArrowRightLeft, Briefcase, Lock, CheckCircle, AlertTriangle, Clock
} from 'lucide-react';
import { DateFilter } from '../App';
import { PASSCODE, DELETE_PIN, formatDisplayDate } from '../constants';
import PasscodeLock from './PasscodeLock';
import { format, parseISO } from 'date-fns';

interface BoardProps {
  projects: Project[];
  team: TeamMember[];
  clients: Client[];
  onProjectUpdate: (p: Project) => void;
  onProjectDelete: (id: string) => void;
  onEditProject: (p: Project) => void;
  onCreateProjectWithStatus: (status: ProjectStatus) => void;
  isFinancialsUnlocked?: boolean;
  onRequestUnlock?: () => void;
  dateFilter?: DateFilter;
  setDateFilter?: (filter: DateFilter) => void;
  onPreviewMember?: (member: TeamMember) => void;
  onClientClick?: (clientId: string) => void;
  isMobileStacked?: boolean;
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
  onRequestUnlock,
  onPreviewMember,
  onClientClick,
  isMobileStacked = false
}) => {
  const [expandedCompleted, setExpandedCompleted] = useState(false);
  const [pendingVaultOpen, setPendingVaultOpen] = useState(false);
  const [pinTarget, setPinTarget] = useState<{ project: Project; targetStatus: ProjectStatus; rating?: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [moveConfirmation, setMoveConfirmation] = useState<{ project: Project; targetStatus: ProjectStatus; rating?: number } | null>(null);

  const vaultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (expandedCompleted && vaultRef.current && !vaultRef.current.contains(event.target as Node)) {
        // If the click is on the search input, don't close the vault
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

  const getProjectsInStatus = (status: ProjectStatus) => projects.filter(p => p.status === status);

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
    
    // Check if moving to a different status
    if (project && project.status !== status) {
      // Always ask for confirmation first, regardless of lock state
      setMoveConfirmation({ project, targetStatus: status, rating: status === 'Completed' ? project.rating : undefined });
    }
  };

  const confirmMove = () => {
    if (moveConfirmation) {
      const { project, targetStatus, rating } = moveConfirmation;
      
      // If moving to Completed and not unlocked, trigger PIN check after confirmation
      // If moving FROM Completed to any other status and not unlocked, trigger PIN check after confirmation
      if ((targetStatus === 'Completed' || project.status === 'Completed') && !isFinancialsUnlocked) {
        setMoveConfirmation(null);
        setPinTarget({ project, targetStatus, rating });
        return;
      }

      onProjectUpdate({ 
        ...project, 
        status: targetStatus, 
        progress: targetStatus === 'Completed' ? 100 : project.progress,
        rating: targetStatus === 'Completed' ? rating : project.rating
      });
      setMoveConfirmation(null);
    }
  };

  const handleToggleVault = () => {
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
  };

  useEffect(() => {
    if (isFinancialsUnlocked && pendingVaultOpen) {
      setExpandedCompleted(true);
      setPendingVaultOpen(false);
    }
  }, [isFinancialsUnlocked, pendingVaultOpen]);

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

      <div 
        ref={vaultRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, 'Completed')}
        className={`bg-white border-t border-slate-200 shrink-0 z-10 transition-all duration-500 ${expandedCompleted ? 'h-[400px] absolute bottom-0 left-0 right-0 shadow-[0_-20px_40px_rgba(0,0,0,0.1)]' : 'h-12 relative'}`}
      >
        <div className="flex items-center justify-between px-4 md:px-8 h-12 bg-white relative z-20">
          <div className="flex items-center gap-3">
            <button onClick={handleToggleVault} className="flex items-center gap-3 group">
              <div className={`p-1 rounded-lg border transition-all ${expandedCompleted ? 'bg-indigo-600 border-indigo-600 text-white' : !isFinancialsUnlocked ? 'bg-slate-100 border-slate-200 text-slate-400' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}>
                {!isFinancialsUnlocked && !expandedCompleted ? <Lock size={12} /> : <ChevronUp className={`transition-transform duration-300 ${expandedCompleted ? 'rotate-180' : ''}`} size={12} />}
              </div>
              <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Delivered Vault ({getProjectsInStatus('Completed').length})</span>
            </button>
            <button 
              onClick={() => onCreateProjectWithStatus('Completed')}
              className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
              title="Add Delivered Project"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        {expandedCompleted && (
          <div className="px-4 md:px-8 pb-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto custom-scrollbar h-[350px] pt-4 bg-slate-50 relative z-20 place-items-center sm:place-items-start">
            {getProjectsInStatus('Completed').map(project => (
              <div key={project.id} className="w-full sm:w-[320px] shrink-0">
                <ProjectCard 
                  project={project} 
                  team={team} 
                  projects={projects}
                  clients={clients}
                  onClick={() => onEditProject(project)} 
                  onDelete={() => setDeleteTarget(project)} 
                  onPreviewMember={onPreviewMember} 
                  onClientClick={onClientClick}
                  isFinancialsUnlocked={isFinancialsUnlocked}
                />
              </div>
            ))}
            <div className="w-full sm:w-[320px] shrink-0 h-full min-h-[200px]">
              <button
                onClick={() => onCreateProjectWithStatus('Completed')}
                className="w-full h-full py-6 rounded-[20px] border-2 border-dashed border-indigo-200/50 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all group flex flex-col items-center justify-center gap-2 opacity-70 hover:opacity-100"
              >
                <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500 group-hover:scale-110 transition-transform shadow-sm">
                  <Plus size={16} />
                </div>
                <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest group-hover:text-indigo-600">Add Unit</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {pinTarget && (
        <PasscodeLock 
          title="Archive Clearance" 
          subtitle={`Unlock to finalize "${pinTarget.project.title}"`} 
          onUnlock={() => { onProjectUpdate({...pinTarget.project, status: 'Completed', progress: 100, rating: pinTarget.rating}); setPinTarget(null); }} 
          onClose={() => setPinTarget(null)} 
          correctPasscode={PASSCODE} 
        />
      )}

      {deleteTarget && (
        <PasscodeLock 
          title="Security Override" 
          subtitle={`Authorize deletion of "${deleteTarget.title}"`} 
          onUnlock={() => { onProjectDelete(deleteTarget.id); setDeleteTarget(null); }} 
          onClose={() => setDeleteTarget(null)} 
          correctPasscode={DELETE_PIN} 
          length={4}
        />
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

export const ProjectCard: React.FC<{ 
  project: Project; 
  team: TeamMember[]; 
  projects: Project[];
  clients?: Client[];
  onClick: () => void;
  onPreviewMember?: (member: TeamMember) => void;
  onClientClick?: (clientId: string) => void;
  onDelete: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  isFinancialsUnlocked?: boolean;
}> = ({ project, team, projects, clients, onClick, onPreviewMember, onClientClick, onDelete, onDragStart, onDragEnd, isFinancialsUnlocked = false }) => {
  
  const handleDrag = (e: React.DragEvent) => {
    e.dataTransfer.setData('projectId', project.id);
    onDragStart?.(e);
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return `${formatDisplayDate(dateStr)} (${format(date, 'EEEE').toUpperCase()})`;
    } catch {
      return formatDisplayDate(dateStr);
    }
  };

  const priorityColor = project.priority === 'High' ? 'text-orange-500 bg-orange-50' 
    : project.priority === 'Medium' ? 'text-amber-500 bg-amber-50'
    : 'text-emerald-500 bg-emerald-50';

  const clientIds = project.clientIds || (project.clientId ? [project.clientId] : []);
  const projectClients = clients?.filter(c => clientIds.includes(c.id)) || [];
  const clientDisplayName = projectClients.length > 0 
    ? projectClients.map(c => c.name || c.company || 'Unknown Client').join(', ') 
    : 'Unknown Client';

  return (
    <div 
      draggable 
      onDragStart={handleDrag}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="bg-white rounded-[20px] border border-indigo-100/50 shadow-sm p-3 cursor-pointer hover:shadow-md transition-all group relative active:scale-[0.98]"
    >
      <div className="flex justify-between items-start mb-1">
        <div className="flex items-center gap-1.5">
          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${priorityColor}`}>
            {project.priority}
          </span>
          {project.status === 'Completed' && project.rating !== undefined && (
            <div className="flex items-center gap-0.5 bg-amber-50 text-amber-500 px-1.5 py-0.5 rounded-md">
              <Star size={10} className="fill-amber-500" />
              <span className="text-[9px] font-black">{project.rating}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span 
            className={`text-[9px] font-black text-slate-400 uppercase tracking-widest truncate max-w-[120px] ${onClientClick && projectClients.length > 0 ? 'cursor-pointer hover:text-indigo-600 transition-colors' : ''}`} 
            title={clientDisplayName}
            onClick={(e) => {
              if (onClientClick && projectClients.length > 0) {
                e.stopPropagation();
                onClientClick(projectClients[0].id);
              }
            }}
          >
            {clientDisplayName}
          </span>
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-slate-200 hover:text-rose-500 transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      <h3 className="text-[#344563] font-black text-sm uppercase leading-tight mb-0.5 group-hover:text-indigo-700 transition-colors">
        {project.title}
      </h3>
      
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide mb-0.5 line-clamp-2 leading-tight">
        {project.description || project.notes || 'No details provided'}
      </p>

      {project.dependencies && project.dependencies.length > 0 && (
        <div className="mb-0.5 space-y-0.5">
          <div className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-slate-400">
            <LinkIcon size={10} /> Dependencies
          </div>
          <div className="flex flex-wrap gap-1">
            {project.dependencies.map(depId => {
              const depProj = projects.find(p => p.id === depId);
              if (!depProj) return null;
              const isCompleted = depProj.status === 'Completed';
              return (
                <span key={depId} className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded flex items-center gap-1 ${isCompleted ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                  {isCompleted ? <CheckCircle size={8} /> : <AlertTriangle size={8} />}
                  {depProj.title}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {project.tags && project.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-0.5">
          {project.tags.map((tag, idx) => (
            <span key={idx} className="text-[8px] font-black uppercase tracking-widest text-[#4F46E5] bg-indigo-50 px-1.5 py-0.5 rounded">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {project.instaLinks && project.instaLinks.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-0.5">
          {project.instaLinks.map((link, idx) => (
            <a 
              key={idx} 
              href={link.url} 
              target="_blank" 
              rel="noopener noreferrer" 
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 px-1.5 py-0.5 bg-pink-50 text-pink-700 rounded-md hover:bg-pink-100 transition-colors border border-pink-100 group/link shadow-sm active:scale-95"
              title={link.tag || 'Instagram Link'}
            >
              <Instagram size={8} className="shrink-0" />
              <span className="text-[8px] font-black uppercase tracking-wide truncate max-w-[100px]">{link.tag || 'Post'}</span>
              <ExternalLink size={8} className="opacity-50 group-hover/link:opacity-100 transition-opacity" />
            </a>
          ))}
        </div>
      )}

      <div className="space-y-[1px] mb-0.5">
        <div className="flex items-center gap-1.5 bg-[#EFF6FF] text-[#1D4ED8] px-2 py-0.5 rounded-md border border-blue-100">
          <Camera size={10} className="shrink-0" />
          <span className="text-[8px] font-black uppercase tracking-wide truncate">
            Shoot: {formatDate(project.eventDate)}{project.eventTime ? ` @ ${project.eventTime}` : ''}
          </span>
        </div>
        {project.submissionDeadline && (
          <div className="flex items-center gap-1.5 bg-[#FEF2F2] text-[#B91C1C] px-2 py-0.5 rounded-md border border-red-100">
            <Target size={10} className="shrink-0" />
            <span className="text-[8px] font-black uppercase tracking-wide truncate">
              Due: {formatDate(project.submissionDeadline)}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1 mt-0.5">
           <div className="flex-1 flex items-center justify-between bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-100">
              <span className="text-[7px] font-black uppercase tracking-widest opacity-70">Budget</span>
              <div className="flex items-center">
                <span className="text-[8px] font-black tabular-nums">{isFinancialsUnlocked ? `₹${(project.budget || 0).toLocaleString()}` : '****'}</span>
              </div>
           </div>
           <div className="flex-1 flex items-center justify-between bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md border border-amber-100">
              <span className="text-[7px] font-black uppercase tracking-widest opacity-70">Exp</span>
              <div className="flex items-center">
                <span className="text-[8px] font-black tabular-nums">{isFinancialsUnlocked ? `₹${(project.expenses || 0).toLocaleString()}` : '****'}</span>
              </div>
           </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
         <div className="flex -space-x-1.5">
            {project.teamMemberIds.length > 0 ? (
               <>
                 {project.teamMemberIds.slice(0, 3).map(id => {
                    const m = team.find(mem => mem.id === id);
                    if (!m) return null;
                    return (
                      <div key={id} title={m.name} onClick={(e) => {e.stopPropagation(); onPreviewMember?.(m)}} className={`w-6 h-6 rounded-full border border-white ${m.color} text-white flex items-center justify-center text-[8px] font-black`}>
                        {m.avatar}
                      </div>
                    );
                 })}
                 {project.teamMemberIds.length > 3 && (
                   <div className="w-6 h-6 rounded-full border border-white bg-slate-100 text-slate-400 flex items-center justify-center text-[8px] font-black" title={`${project.teamMemberIds.length - 3} more`}>
                     +{project.teamMemberIds.length - 3}
                   </div>
                 )}
               </>
            ) : (
               <div className="w-6 h-6 rounded-full border border-slate-100 bg-slate-50 flex items-center justify-center text-slate-300">
                  <Users size={12} />
               </div>
            )}
         </div>
         <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest truncate max-w-[100px]">
           {project.location}
         </span>
      </div>
    </div>
  );
};

export const EditProjectModal: React.FC<{
  project: Project;
  team: TeamMember[];
  clients: Client[];
  projects: Project[];
  onClose: () => void;
  onUpdate: (p: Project) => void;
  isUnlocked?: boolean;
}> = ({ project, team, clients, projects, onClose, onUpdate, isUnlocked = false }) => {
  const [formData, setFormData] = useState<Project>({ ...project, dependencies: project.dependencies || [] });
  const [hasDeadline, setHasDeadline] = useState(!!project.submissionDeadline);
  const [hasTime, setHasTime] = useState(!!project.eventTime);
  const [teamSearch, setTeamSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [isDependenciesDropdownOpen, setIsDependenciesDropdownOpen] = useState(false);
  const [dependencySearch, setDependencySearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [newTag, setNewTag] = useState('');
  const [newInstaLink, setNewInstaLink] = useState('');
  const [newInstaTag, setNewInstaTag] = useState('');

  const scrollContainerRef = useRef<HTMLFormElement>(null);
  const clientSectionRef = useRef<HTMLDivElement>(null);
  const specialistSectionRef = useRef<HTMLDivElement>(null);
  const dependenciesSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isClientDropdownOpen && clientSectionRef.current && scrollContainerRef.current) {
      setTimeout(() => {
        const container = scrollContainerRef.current;
        const element = clientSectionRef.current;
        if (container && element) {
          container.scrollTo({
            top: element.offsetTop - 24, // 24px for padding
            behavior: 'smooth'
          });
        }
      }, 50);
    }
  }, [isClientDropdownOpen]);

  useEffect(() => {
    if (isDropdownOpen && specialistSectionRef.current && scrollContainerRef.current) {
      setTimeout(() => {
        const container = scrollContainerRef.current;
        const element = specialistSectionRef.current;
        if (container && element) {
          container.scrollTo({
            top: element.offsetTop - 24, // 24px for padding
            behavior: 'smooth'
          });
        }
      }, 50);
    }
  }, [isDropdownOpen]);

  useEffect(() => {
    if (isDependenciesDropdownOpen && dependenciesSectionRef.current && scrollContainerRef.current) {
      setTimeout(() => {
        const container = scrollContainerRef.current;
        const element = dependenciesSectionRef.current;
        if (container && element) {
          container.scrollTo({
            top: element.offsetTop - 24, // 24px for padding
            behavior: 'smooth'
          });
        }
      }, 50);
    }
  }, [isDependenciesDropdownOpen]);

  const filteredTeam = useMemo(() => {
    return team.filter(m => m.name.toLowerCase().includes(teamSearch.toLowerCase()));
  }, [team, teamSearch]);

  const filteredClients = useMemo(() => {
    return clients
      .filter(c => c.company.toLowerCase().includes(clientSearch.toLowerCase()) || c.name.toLowerCase().includes(clientSearch.toLowerCase()))
      .sort((a, b) => a.company.localeCompare(b.company));
  }, [clients, clientSearch]);

  const filteredDependencies = useMemo(() => {
    return projects.filter(p => p.id !== project.id && p.title.toLowerCase().includes(dependencySearch.toLowerCase()));
  }, [projects, dependencySearch, project.id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate({
      ...formData,
      eventTime: hasTime ? formData.eventTime : undefined,
      submissionDeadline: hasDeadline ? formData.submissionDeadline : undefined,
      progress: formData.status === 'Completed' ? 100 : formData.progress,
    });
  };

  const toggleMember = (id: string) => {
    const next = formData.teamMemberIds.includes(id)
      ? formData.teamMemberIds.filter(mid => mid !== id)
      : [...formData.teamMemberIds, id];
    setFormData({ ...formData, teamMemberIds: next });
  };

  const toggleDependency = (id: string) => {
    const next = (formData.dependencies || []).includes(id)
      ? (formData.dependencies || []).filter(did => did !== id)
      : [...(formData.dependencies || []), id];
    setFormData({ ...formData, dependencies: next });
  };

  const addTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({ ...prev, tags: [...prev.tags, newTag.trim()] }));
      setNewTag('');
    }
  };

  const removeTag = (t: string) => {
    setFormData(prev => ({ ...prev, tags: prev.tags.filter(tag => tag !== t) }));
  };

  const addInstaLink = () => {
    if (!newInstaLink.trim()) return;
    const tag = newInstaTag.trim() || 'Deliverable';
    setFormData(prev => ({
      ...prev,
      instaLinks: [...(prev.instaLinks || []), { url: newInstaLink.trim(), tag }]
    }));
    setNewInstaLink('');
    setNewInstaTag('');
  };

  const removeInstaLink = (index: number) => {
    setFormData(prev => ({
      ...prev,
      instaLinks: (prev.instaLinks || []).filter((_, i) => i !== index)
    }));
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-[200] flex items-start justify-center sm:items-center bg-black/60 backdrop-blur-md p-4 overflow-hidden">
      <div 
        onClick={e => {
          e.stopPropagation();
          setIsDropdownOpen(false);
          setIsClientDropdownOpen(false);
          setIsDependenciesDropdownOpen(false);
        }} 
        className="bg-white rounded-[40px] w-full max-w-2xl shadow-2xl animate-in slide-in-from-bottom-12 duration-500 border border-white/20 flex flex-col max-h-full sm:max-h-[90vh] my-auto"
      >
        <div className="p-6 border-b flex justify-between items-center bg-white/50 backdrop-blur-sm rounded-t-[40px] shrink-0 z-20">
          <div>
            <h3 className="text-xl font-black text-slate-800 tracking-tighter uppercase">Edit Production</h3>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-100 rounded-[20px] text-slate-400 hover:text-slate-900 transition-all active:scale-90"><X size={24} /></button>
        </div>

        <form ref={scrollContainerRef} onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-1 md:col-span-2 space-y-1">
              <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-2">Deliverable Title</label>
              <input required className="w-full border-2 border-slate-100 rounded-[20px] p-3 bg-slate-50 focus:border-indigo-500 outline-none font-black text-lg" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
            </div>

            <div ref={clientSectionRef} className="col-span-1 md:col-span-2 space-y-1">
              <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-2 flex items-center gap-1.5"><Briefcase size={12} /> Client Account</label>
              <div className="relative w-full z-[60]">
                <div 
                  className="w-full border-2 border-slate-100 rounded-[16px] p-3 bg-slate-50 cursor-pointer flex justify-between items-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsClientDropdownOpen(!isClientDropdownOpen);
                    setIsDropdownOpen(false);
                    setIsDependenciesDropdownOpen(false);
                  }}
                >
                  <div className="flex flex-wrap gap-2">
                    {(!formData.clientIds || formData.clientIds.length === 0) && !formData.clientId ? <span className="text-slate-300 italic font-bold text-xs">-- No Client Linked --</span> : 
                      (formData.clientIds || (formData.clientId ? [formData.clientId] : [])).map(id => {
                        const client = clients.find(c => c.id === id);
                        return client ? (
                          <span key={id} className="bg-slate-900 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                            {client.name || client.company || 'Unknown Client'}
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const newIds = (formData.clientIds || (formData.clientId ? [formData.clientId] : [])).filter(cid => cid !== id);
                                setFormData({...formData, clientIds: newIds, clientId: newIds.length > 0 ? newIds[0] : ''});
                              }}
                              className="hover:text-rose-400 ml-1"
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ) : null;
                      })
                    }
                  </div>
                  <ChevronDownIcon size={18} className="text-slate-300" />
                </div>
                
                {isClientDropdownOpen && (
                  <div onClick={e => e.stopPropagation()} className="absolute top-full left-0 right-0 mt-4 bg-white border-2 border-slate-100 rounded-[30px] shadow-2xl p-6 space-y-4 animate-in slide-in-from-top-4 duration-300">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                      <input 
                        className="w-full bg-slate-50 border-0 outline-none pl-12 pr-4 py-4 rounded-xl font-bold text-sm" 
                        placeholder="Search clients..." 
                        value={clientSearch} 
                        onChange={e => setClientSearch(e.target.value)}
                      />
                    </div>
                    <div className="max-h-[200px] overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                      <div 
                        onClick={() => { setFormData({...formData, clientId: '', clientIds: []}); setIsClientDropdownOpen(false); }} 
                        className={`flex items-center justify-between p-3.5 rounded-xl cursor-pointer transition-all ${(!formData.clientIds || formData.clientIds.length === 0) && !formData.clientId ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-50'}`}
                      >
                        <span className="font-black uppercase tracking-widest text-[10px]">-- No Client Linked --</span>
                        {(!formData.clientIds || formData.clientIds.length === 0) && !formData.clientId && <Check size={16} />}
                      </div>
                      {filteredClients.slice(0, 5).map(client => {
                        const isSelected = (formData.clientIds || (formData.clientId ? [formData.clientId] : [])).includes(client.id);
                        return (
                          <div 
                            key={client.id} 
                            onClick={() => { 
                              const currentIds = formData.clientIds || (formData.clientId ? [formData.clientId] : []);
                              const newIds = isSelected 
                                ? currentIds.filter(id => id !== client.id)
                                : [...currentIds, client.id];
                              setFormData({...formData, clientIds: newIds, clientId: newIds.length > 0 ? newIds[0] : ''}); 
                            }} 
                            className={`flex items-center justify-between p-3.5 rounded-xl cursor-pointer transition-all ${isSelected ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-50'}`}
                          >
                            <div className="flex flex-col">
                              <span className="font-black uppercase tracking-widest text-[10px]">{client.name}</span>
                              {client.company && <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{client.company}</span>}
                            </div>
                            {isSelected && <Check size={16} />}
                          </div>
                        );
                      })}
                      {filteredClients.length === 0 && <p className="text-center text-slate-300 text-xs py-4 font-bold">No clients found</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div ref={specialistSectionRef} className="col-span-1 md:col-span-2 space-y-1">
              <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-2">Specialist Deployment</label>
              <div className="relative w-full z-50">
                <div 
                  className="w-full border-2 border-slate-100 rounded-[16px] p-3 bg-slate-50 cursor-pointer flex justify-between items-center" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDropdownOpen(!isDropdownOpen);
                    setIsClientDropdownOpen(false);
                    setIsDependenciesDropdownOpen(false);
                  }}
                >
                  <div className="flex flex-wrap gap-2">
                    {formData.teamMemberIds.length === 0 ? <span className="text-slate-300 italic text-xs">Unassigned</span> : 
                      formData.teamMemberIds.map(id => {
                        const member = team.find(m => m.id === id);
                        return <span key={id} className={`${member?.color || 'bg-slate-900'} text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest`}>{member?.name}</span>
                      })
                    }
                  </div>
                  <ChevronDownIcon size={18} className="text-slate-300" />
                </div>
                {isDropdownOpen && (
                  <div onClick={e => e.stopPropagation()} className="absolute top-full left-0 right-0 mt-4 bg-white border-2 border-slate-100 rounded-[30px] shadow-2xl p-6 space-y-4 animate-in slide-in-from-top-4 duration-300">
                    <input className="w-full bg-slate-50 border-0 outline-none p-4 rounded-xl font-bold text-sm" placeholder="Filter team..." value={teamSearch} onChange={e => setTeamSearch(e.target.value)} />
                    <div className="max-h-[150px] overflow-y-auto space-y-1">
                      {filteredTeam.map(member => (
                        <div key={member.id} onClick={() => toggleMember(member.id)} className={`flex items-center justify-between p-3 rounded-xl cursor-pointer ${formData.teamMemberIds.includes(member.id) ? 'bg-indigo-600 text-white' : 'hover:bg-slate-50'}`}>
                          <span className="font-black uppercase tracking-widest text-[10px]">{member.name}</span>
                          {formData.teamMemberIds.includes(member.id) && <Check size={16} />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="col-span-1 md:col-span-2 space-y-1">
              <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-2">Location</label>
              <input required className="w-full border-2 border-slate-100 rounded-[16px] p-3 bg-slate-50 focus:border-indigo-500 outline-none font-bold" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} />
            </div>

            <div className="col-span-1 md:col-span-2 space-y-1">
              <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-2">Description</label>
              <textarea 
                className="w-full border-2 border-slate-100 rounded-[20px] p-4 bg-slate-50 focus:border-indigo-500 outline-none font-bold resize-none min-h-[80px] text-sm" 
                value={formData.description || ''} 
                onChange={e => setFormData({...formData, description: e.target.value})} 
                placeholder="Project description..."
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-2">Phase Routing</label>
              <select className="w-full border-2 border-slate-100 rounded-[16px] p-3 bg-slate-50 focus:border-indigo-500 outline-none font-black text-slate-600 appearance-none" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as ProjectStatus})}>
                <option value="Expired">⌛ Expired</option>
                <option value="Quote Sent">💬 Quote Sent</option>
                <option value="To Do">📅 To Do</option>
                <option value="In Progress">🎥 In Production</option>
                <option value="Completed">✅ Completed</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-2">Priority</label>
              <select className="w-full border-2 border-slate-100 rounded-[16px] p-3 bg-slate-50 focus:border-indigo-500 outline-none font-black text-slate-600 appearance-none" value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value as Priority})}>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            {formData.status === 'Completed' && (
              <div className="col-span-1 md:col-span-2 space-y-2 bg-amber-50/50 p-4 rounded-2xl border border-amber-100/50">
                <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest ml-2">Client Satisfaction Rating</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setFormData({ ...formData, rating: star })}
                      className={`p-2 rounded-xl transition-all ${formData.rating && formData.rating >= star ? 'text-amber-500 bg-amber-100 scale-110' : 'text-slate-300 hover:text-amber-400 hover:bg-amber-50'}`}
                    >
                      <Star size={24} className={formData.rating && formData.rating >= star ? 'fill-amber-500' : ''} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-2 flex items-center gap-1.5"><Camera size={12} /> Shoot Date</label>
                <input type="date" className="w-full border-2 border-slate-100 rounded-[16px] p-3 bg-slate-50 font-black text-indigo-600 outline-none" value={formData.eventDate} onChange={e => setFormData({...formData, eventDate: e.target.value})} />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between ml-2 mb-1">
                  <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1.5"><Clock size={12} /> Time</label>
                  <button 
                    type="button" 
                    onClick={() => {
                      setHasTime(!hasTime);
                      if (!hasTime && !formData.eventTime) {
                        setFormData({...formData, eventTime: '09:00'});
                      }
                    }}
                    className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${hasTime ? 'bg-indigo-500' : 'bg-slate-200'}`}
                  >
                    <span className={`inline-block h-2 w-2 transform rounded-full bg-white transition-transform ${hasTime ? 'translate-x-4' : 'translate-x-1'}`} />
                  </button>
                </div>
                {hasTime && (
                  <div className="relative animate-in fade-in slide-in-from-top-2">
                    <select 
                      className="w-full border-2 border-slate-100 rounded-[16px] p-3 bg-slate-50 font-black text-indigo-600 outline-none appearance-none" 
                      value={formData.eventTime || "09:00"} 
                      onChange={e => setFormData({...formData, eventTime: e.target.value})}
                    >
                      {Array.from({ length: 24 * 2 }).map((_, i) => {
                        const hours = Math.floor(i / 2).toString().padStart(2, '0');
                        const mins = ((i % 2) * 30).toString().padStart(2, '0');
                        const time = `${hours}:${mins}`;
                        return <option key={time} value={time}>{time}</option>;
                      })}
                    </select>
                    <ChevronDownIcon size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between ml-2 mb-1">
                  <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1.5"><Target size={12} /> Deadline</label>
                  <button 
                    type="button" 
                    onClick={() => setHasDeadline(!hasDeadline)}
                    className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${hasDeadline ? 'bg-rose-500' : 'bg-slate-200'}`}
                  >
                    <span className={`inline-block h-2 w-2 transform rounded-full bg-white transition-transform ${hasDeadline ? 'translate-x-4' : 'translate-x-1'}`} />
                  </button>
                </div>
                {hasDeadline && (
                  <input type="date" className="w-full border-2 border-slate-100 rounded-[16px] p-3 bg-slate-50 font-black text-rose-500 outline-none animate-in fade-in slide-in-from-top-2" value={formData.submissionDeadline || ''} onChange={e => setFormData({...formData, submissionDeadline: e.target.value})} />
                )}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-2">Budget (₹)</label>
              <div className="relative">
                <IndianRupee size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                <input 
                  type="number" 
                  step="500"
                  onWheel={(e) => e.currentTarget.blur()}
                  className={`w-full border-2 border-slate-100 rounded-[16px] pl-10 pr-4 py-3 bg-slate-50 font-black outline-none ${!isUnlocked ? 'blur-sm select-none' : ''}`} 
                  value={formData.budget === 0 ? '' : formData.budget} 
                  onChange={e => isUnlocked && setFormData({...formData, budget: Number(e.target.value)})} 
                  disabled={!isUnlocked} 
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-2">Expenses (₹)</label>
              <div className="relative">
                <IndianRupee size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                <input 
                  type="number" 
                  step="500"
                  onWheel={(e) => e.currentTarget.blur()}
                  className={`w-full border-2 border-slate-100 rounded-[16px] pl-10 pr-4 py-3 bg-slate-50 font-black outline-none ${!isUnlocked ? 'blur-sm select-none' : ''}`} 
                  value={formData.expenses === 0 ? '' : formData.expenses} 
                  onChange={e => isUnlocked && setFormData({...formData, expenses: Number(e.target.value)})} 
                  disabled={!isUnlocked} 
                  placeholder="0"
                />
              </div>
            </div>

            <div className="col-span-1 md:col-span-2 space-y-1">
              <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-2">Delivery Assets (Instagram)</label>
              <div className="flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1 sm:flex-[2]">
                    <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                    <input 
                      className="w-full border-2 border-slate-100 rounded-[16px] pl-10 pr-4 py-2 bg-white font-bold focus:border-indigo-500 outline-none text-sm" 
                      placeholder="https://instagram.com/p/..."
                      value={newInstaLink}
                      onChange={e => setNewInstaLink(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={12} />
                      <input 
                        className="w-full border-2 border-slate-100 rounded-[16px] pl-8 pr-3 py-2 bg-white font-bold focus:border-indigo-500 outline-none uppercase text-[9px] tracking-widest" 
                        placeholder="Label"
                        value={newInstaTag}
                        onChange={e => setNewInstaTag(e.target.value)}
                        onKeyDown={e => { if(e.key === 'Enter') { e.preventDefault(); addInstaLink(); } }}
                      />
                    </div>
                    <button 
                      type="button"
                      onClick={addInstaLink}
                      className="bg-indigo-600 text-white px-4 py-2 sm:py-0 rounded-[16px] font-black text-[9px] uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all shrink-0"
                    >
                      Add Link
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {(formData.instaLinks || []).map((link, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center gap-2 bg-indigo-50/80 border border-indigo-100/50 px-3 py-1.5 rounded-xl group/link transition-all hover:bg-indigo-100 cursor-pointer shadow-sm active:scale-95"
                    onClick={() => window.open(link.url, '_blank')}
                  >
                    <Instagram size={12} className="text-indigo-600" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-indigo-700 leading-none">{link.tag}</span>
                    <button 
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeInstaLink(idx); }}
                      className="text-indigo-300 hover:text-rose-500 transition-colors p-0.5"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="col-span-1 md:col-span-2 space-y-1">
              <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-2">Project Tags</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input 
                  className="flex-1 border-2 border-slate-100 rounded-[16px] px-3 py-2 bg-slate-50 font-bold outline-none text-sm" 
                  placeholder="Add custom tag..."
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                />
                <button 
                  type="button" 
                  onClick={addTag} 
                  className="bg-indigo-600 text-white px-4 py-2 sm:py-0 rounded-[16px] font-black text-[9px] uppercase tracking-widest active:scale-95 shrink-0"
                >
                  Add Tag
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 min-h-[30px]">
                {(formData.tags || []).map(tag => (
                  <span key={tag} className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-lg text-[8px] font-black uppercase text-indigo-700">
                    #{tag}
                    <button type="button" onClick={() => removeTag(tag)} className="text-rose-400 hover:text-rose-600"><X size={10} /></button>
                  </span>
                ))}
              </div>
            </div>

            <div className="col-span-1 md:col-span-2 space-y-1">
              <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-2 flex items-center gap-1.5"><FileText size={12} /> Additional Notes</label>
              <textarea 
                className="w-full border-2 border-slate-100 rounded-[20px] p-4 bg-slate-50 focus:border-indigo-500 outline-none font-bold resize-none min-h-[80px] text-sm" 
                value={formData.notes || ''} 
                onChange={e => setFormData({...formData, notes: e.target.value})} 
                placeholder="Internal notes..."
              />
            </div>

            <div ref={dependenciesSectionRef} className="col-span-1 md:col-span-2 space-y-1">
              <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-2 flex items-center gap-1.5"><LinkIcon size={12} /> Dependencies (Must be completed first)</label>
              <div className="relative w-full z-40">
                <div 
                  className="w-full border-2 border-slate-100 rounded-[16px] p-3 bg-slate-50 cursor-pointer flex justify-between items-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDependenciesDropdownOpen(!isDependenciesDropdownOpen);
                    setIsDropdownOpen(false);
                    setIsClientDropdownOpen(false);
                  }}
                >
                  <div className="flex flex-wrap gap-2">
                    {(!formData.dependencies || formData.dependencies.length === 0) ? <span className="text-slate-300 italic text-xs">No dependencies</span> : 
                      formData.dependencies.map(id => {
                        const proj = projects.find(p => p.id === id);
                        return <span key={id} className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">{proj?.title || id}</span>
                      })
                    }
                  </div>
                  <ChevronDownIcon size={18} className="text-slate-300" />
                </div>
                
                {isDependenciesDropdownOpen && (
                  <div onClick={e => e.stopPropagation()} className="absolute top-full left-0 right-0 mt-4 bg-white border-2 border-slate-100 rounded-[30px] shadow-2xl p-6 space-y-4 animate-in slide-in-from-top-4 duration-300">
                    <input className="w-full bg-slate-50 border-0 outline-none p-4 rounded-xl font-bold text-sm" placeholder="Search projects..." value={dependencySearch} onChange={e => setDependencySearch(e.target.value)} />
                    <div className="max-h-[150px] overflow-y-auto space-y-1">
                      {filteredDependencies.map(proj => (
                        <div key={proj.id} onClick={() => toggleDependency(proj.id)} className={`flex items-center justify-between p-3 rounded-xl cursor-pointer ${(formData.dependencies || []).includes(proj.id) ? 'bg-indigo-600 text-white' : 'hover:bg-slate-50'}`}>
                          <span className="font-black uppercase tracking-widest text-[10px]">{proj.title}</span>
                          {(formData.dependencies || []).includes(proj.id) && <Check size={16} />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button type="submit" className="w-full sm:flex-1 bg-slate-900 text-white py-3 rounded-[16px] font-black text-[10px] uppercase tracking-widest shadow-xl">Update Production</button>
            <button type="button" onClick={onClose} className="w-full sm:flex-1 border-2 border-slate-100 text-slate-400 py-3 rounded-[16px] font-black text-[10px] uppercase tracking-widest">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Board;
