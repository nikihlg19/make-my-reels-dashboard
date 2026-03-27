
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Project, ProjectStatus, TeamMember, Client } from '../types';
import { Plus, ChevronUp, Lock } from 'lucide-react';
import { ProjectCard } from './ProjectCard';

interface CompletedVaultProps {
  completedProjects: Project[];
  team: TeamMember[];
  projects: Project[];
  clients: Client[];
  isFinancialsUnlocked: boolean;
  expandedCompleted: boolean;
  onToggleVault: () => void;
  onEditProject: (p: Project) => void;
  onDeleteProject: (p: Project) => void;
  onCreateProjectWithStatus: (status: ProjectStatus) => void;
  onPreviewMember?: (member: TeamMember) => void;
  onClientClick?: (clientId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  vaultRef: React.RefObject<HTMLDivElement | null>;
}

const CompletedVaultInner: React.FC<CompletedVaultProps> = ({
  completedProjects,
  team,
  projects,
  clients,
  isFinancialsUnlocked,
  expandedCompleted,
  onToggleVault,
  onEditProject,
  onDeleteProject,
  onCreateProjectWithStatus,
  onPreviewMember,
  onClientClick,
  onDragOver,
  onDragLeave,
  onDrop,
  vaultRef,
}) => {
  return (
    <div
      ref={vaultRef}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`bg-white border-t border-slate-200 shrink-0 z-10 transition-all duration-500 ${expandedCompleted ? 'h-[400px] absolute bottom-0 left-0 right-0 shadow-[0_-20px_40px_rgba(0,0,0,0.1)]' : 'h-12 relative'}`}
    >
      <div className="flex items-center justify-between px-4 md:px-8 h-12 bg-white relative z-20">
        <div className="flex items-center gap-3">
          <button onClick={onToggleVault} className="flex items-center gap-3 group">
            <div className={`p-1 rounded-lg border transition-all ${expandedCompleted ? 'bg-indigo-600 border-indigo-600 text-white' : !isFinancialsUnlocked ? 'bg-slate-100 border-slate-200 text-slate-400' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}>
              {!isFinancialsUnlocked && !expandedCompleted ? <Lock size={12} /> : <ChevronUp className={`transition-transform duration-300 ${expandedCompleted ? 'rotate-180' : ''}`} size={12} />}
            </div>
            <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Delivered Vault ({completedProjects.length})</span>
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
          {completedProjects.map(project => (
            <div key={project.id} className="w-full sm:w-[320px] shrink-0">
              <ProjectCard
                project={project}
                team={team}
                projects={projects}
                clients={clients}
                onClick={() => onEditProject(project)}
                onDelete={() => onDeleteProject(project)}
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
  );
};

export const CompletedVault = React.memo(CompletedVaultInner);
