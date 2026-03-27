
import React, { useState, useRef, useEffect } from 'react';
import { Project, TeamMember, Client, ProjectAssignment } from '../types';
import {
  Instagram, ExternalLink, Trash2, Star, Camera, Target,
  LinkIcon, Users, CheckCircle, AlertTriangle, Undo2, Send
} from 'lucide-react';
import { ADMIN_PHONE, formatDisplayDate } from '../constants';
import { format, parseISO } from 'date-fns';
import { parseLocation } from '../src/utils/location';
import { AssignmentStatusDot } from './AssignmentStatusBadge';
import { useSession } from '@clerk/react';

export interface ProjectCardProps {
  project: Project;
  team: TeamMember[];
  projects: Project[];
  clients?: Client[];
  assignments?: ProjectAssignment[];
  onClick: () => void;
  onPreviewMember?: (member: TeamMember) => void;
  onClientClick?: (clientId: string) => void;
  onDelete: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  isFinancialsUnlocked?: boolean;
  pendingDeleteApprovalId?: string;
  onCancelApproval?: (approvalId: string) => void;
}

// Extract UPI ID from the full UPI URL (e.g. "upi://pay?pa=foo@ybl&pn=..." → "foo@ybl")
function extractUpiId(upiUrl: string): string {
  try {
    const pa = new URLSearchParams(upiUrl.split('?')[1]).get('pa');
    return pa || upiUrl;
  } catch {
    return upiUrl;
  }
}

const ProjectCardInner: React.FC<ProjectCardProps> = ({
  project, team, projects, clients, assignments, onClick, onPreviewMember, onClientClick,
  onDelete, onDragStart, onDragEnd, isFinancialsUnlocked = false,
  pendingDeleteApprovalId, onCancelApproval
}) => {
  const { session } = useSession();
  const [showConfirmPopover, setShowConfirmPopover] = useState(false);
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!showConfirmPopover) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowConfirmPopover(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showConfirmPopover]);

  const handleSendToClient = async (e: React.MouseEvent, client: Client) => {
    e.stopPropagation();
    if (!session || sendState === 'sending') return;
    setSendState('sending');
    setShowConfirmPopover(false);

    try {
      const token = await session.getToken();
      const parsedLoc = parseLocation(project.location);
      const upiRaw = import.meta.env.VITE_UPI_ADDRESS || '';
      const upiId = extractUpiId(upiRaw) || 'nikhil.gandham@ybl';
      const teamLine = project.teamMemberIds.length > 0
        ? project.teamMemberIds
            .map(id => team.find(m => m.id === id))
            .filter(Boolean)
            .map(m => m!.name)
            .join(', ')
        : 'To be assigned';
      const amountLine = !isFinancialsUnlocked
        ? '[Amount hidden]'
        : (project.invoice_amount && project.invoice_amount > 0)
          ? String(project.invoice_amount)
          : 'TBD';

      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          phone: client.phone,
          recipientType: 'client',
          recipientId: client.id,
          templateName: 'event_confirmation',
          templateParams: {
            '1': client.name || client.company || 'there',
            '2': project.title,
            '3': formatDisplayDate(project.eventDate),
            '4': project.eventTime || 'TBD',
            '5': parsedLoc.address,
            '6': project.description || 'Photography & Reels',
            '7': teamLine,
            '8': amountLine,
            '9': upiId,
          },
          messageType: 'event_confirmation',
          relatedProjectId: project.id,
        }),
      });

      setSendState(res.ok ? 'sent' : 'error');
      setTimeout(() => setSendState('idle'), 3000);
    } catch {
      setSendState('error');
      setTimeout(() => setSendState('idle'), 3000);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.dataTransfer.setData('projectId', project.id);
    onDragStart?.(e);
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return `${formatDisplayDate(dateStr)} (${format(date, 'EEEE').toUpperCase()})`;
    } catch (e) {
      console.error('Date format error for', dateStr, e);
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

  const isPendingDelete = !!pendingDeleteApprovalId;

  return (
    <div
      draggable={!isPendingDelete}
      onDragStart={handleDrag}
      onDragEnd={onDragEnd}
      onClick={isPendingDelete ? undefined : onClick}
      className={`bg-white rounded-[20px] shadow-sm p-3 transition-all group relative ${
        isPendingDelete
          ? 'border-2 border-rose-400 ring-2 ring-rose-100 opacity-70 cursor-not-allowed'
          : 'border border-indigo-100/50 cursor-pointer hover:shadow-md active:scale-[0.98]'
      }`}
    >
      {isPendingDelete && (
        <div className="absolute -top-2 -right-2 z-10">
          <span className="bg-rose-500 text-white text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-md animate-pulse">
            Pending Approval
          </span>
        </div>
      )}
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
          {/* Green button: send logistics to admin */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const parsedLoc = parseLocation(project.location);
              const mapsLink = parsedLoc.placeId
                ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parsedLoc.address)}&query_place_id=${parsedLoc.placeId}`
                : `https://maps.google.com/?q=${encodeURIComponent(parsedLoc.address)}`;
              const text = `🎬 *Shoot Details: ${project.title}*\n📍 Location: ${parsedLoc.address}\n📅 Date: ${formatDisplayDate(project.eventDate)}${project.eventTime ? ` @ ${project.eventTime}` : ''}\n🚗 Map Link: ${mapsLink}\n\nAssigned: ${project.teamMemberIds.map(id => team.find(m=>m.id === id)?.name).filter(Boolean).join(', ')}`;
              window.open(`https://wa.me/${ADMIN_PHONE}?text=${encodeURIComponent(text)}`, '_blank');
            }}
            className="text-emerald-400 hover:text-emerald-500 transition-colors mr-1"
            title="Send Logistics to Admin"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
               <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
            </svg>
          </button>

          {/* Indigo button: send event confirmation + payment to client */}
          {projectClients[0]?.phone && (
            <div className="relative" ref={popoverRef}>
              {sendState === 'sent' ? (
                <span className="text-indigo-500 flex items-center gap-0.5 text-[8px] font-black uppercase">
                  <CheckCircle size={10} />Sent
                </span>
              ) : sendState === 'error' ? (
                <span className="text-rose-500 text-[8px] font-black uppercase">Failed</span>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowConfirmPopover(v => !v); }}
                  disabled={sendState === 'sending'}
                  className="text-indigo-400 hover:text-indigo-600 transition-colors mr-1 disabled:opacity-50"
                  title={`Send booking confirmation to ${projectClients[0].name || projectClients[0].company}`}
                >
                  {sendState === 'sending' ? (
                    <span className="text-[8px] font-black text-indigo-400 uppercase">...</span>
                  ) : (
                    <Send size={12} />
                  )}
                </button>
              )}

              {/* Confirmation popover */}
              {showConfirmPopover && (
                <div
                  onClick={e => e.stopPropagation()}
                  className="absolute right-0 top-6 z-50 bg-white border border-indigo-100 rounded-2xl shadow-xl p-3 w-56 animate-in fade-in zoom-in-95 duration-150"
                >
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Send to Client</p>
                  <p className="text-[10px] font-bold text-slate-700 mb-0.5 truncate">
                    {projectClients[0].name || projectClients[0].company}
                  </p>
                  <p className="text-[8px] text-slate-400 mb-2">
                    Sends event details, team, amount &amp; UPI to their WhatsApp.
                  </p>
                  <button
                    onClick={(e) => handleSendToClient(e, projectClients[0])}
                    className="w-full flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-1.5 text-[9px] font-black uppercase tracking-widest transition-all active:scale-95"
                  >
                    <Send size={9} /> Send Now
                  </button>
                </div>
              )}
            </div>
          )}
          {isPendingDelete && onCancelApproval && pendingDeleteApprovalId ? (
            <button
              onClick={(e) => { e.stopPropagation(); onCancelApproval(pendingDeleteApprovalId); }}
              className="text-rose-500 hover:text-rose-700 bg-rose-50/80 hover:bg-rose-100 p-1 rounded-md transition-colors flex items-center gap-1 shadow-sm"
              title="Cancel Delete Request"
            >
              <Undo2 size={10} className="stroke-[3px]" />
              <span className="text-[8px] font-black uppercase tracking-wider">Undo</span>
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="text-slate-200 hover:text-rose-500 transition-colors"
              title="Delete Project"
            >
              <Trash2 size={12} />
            </button>
          )}
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
                    const memberAssignment = assignments?.find(a => a.teamMemberId === id && a.projectId === project.id);
                    return (
                      <div key={id} title={`${m.name}${memberAssignment ? ` — ${memberAssignment.status}` : ''}`} onClick={(e) => {e.stopPropagation(); onPreviewMember?.(m)}} className={`relative w-6 h-6 rounded-full border border-white ${m.color} text-white flex items-center justify-center text-[8px] font-black`}>
                        {(m.avatar || '').replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase()}
                        {memberAssignment && <AssignmentStatusDot status={memberAssignment.status} />}
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
         {(() => {
           const parsedLoc = parseLocation(project.location);
           const mapsLink = parsedLoc.placeId
             ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parsedLoc.address)}&query_place_id=${parsedLoc.placeId}`
             : `https://maps.google.com/?q=${encodeURIComponent(parsedLoc.address)}`;

           return (
             <a
               href={mapsLink}
               target="_blank"
               rel="noopener noreferrer"
               onClick={(e) => e.stopPropagation()}
               title={parsedLoc.address}
               className="text-[9px] font-black text-indigo-400 hover:text-indigo-600 uppercase tracking-widest truncate max-w-[100px] cursor-pointer"
             >
               {parsedLoc.mainText}
             </a>
           );
         })()}
      </div>
    </div>
  );
};

export const ProjectCard = React.memo(ProjectCardInner);
