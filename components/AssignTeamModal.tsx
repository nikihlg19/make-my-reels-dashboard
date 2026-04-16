import React, { useState, useEffect } from 'react';
import { X, Users, RefreshCw, ChevronDown } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Project } from '../types';
import { useCandidateRanking } from '../src/hooks/useCandidateRanking';
import { useAssignments } from '../src/hooks/useAssignments';
import { CandidateRankingList } from './CandidateRankingList';
import type { RankedCandidate } from '../src/hooks/useCandidateRanking';

const DEFAULT_ROLES = ['Videographer', 'Photographer', 'Editor', 'Sales', 'Marketing', 'Reelographer'];

interface AssignTeamModalProps {
  project: Project;
  team?: unknown[];
  onClose: () => void;
  teamRoles?: string[];
}

const ALL_ROLES = 'All';

export const AssignTeamModal: React.FC<AssignTeamModalProps> = ({ project, onClose, teamRoles = DEFAULT_ROLES }) => {
  const [selectedRole, setSelectedRole] = useState(ALL_ROLES);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [successIds, setSuccessIds] = useState<string[]>([]);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  const { candidates, assignmentGroupId, loading, error, fetchCandidates } = useCandidateRanking();
  const { sendRequest, createAssignment, getAssignmentsForProject } = useAssignments([project.id]);
  const existingAssignments = getAssignmentsForProject(project.id);

  useEffect(() => {
    // Always fetch with 'All' role (empty string) to get all members ranked
    fetchCandidates(project.id, selectedRole === ALL_ROLES ? '' : selectedRole);
  }, [project.id, selectedRole]);

  // Client-side filter: when a specific role is selected, only show members with that role
  const filteredCandidates = selectedRole === ALL_ROLES
    ? candidates
    : candidates.filter(c => {
        const memberRoles = Array.isArray(c.member.role) ? c.member.role : [c.member.role];
        return memberRoles.some(r => r?.toLowerCase() === selectedRole.toLowerCase());
      });

  /** Normal tap: create assignment record (no Interakt) + open wa.me with pre-filled message */
  const handleDirectWhatsApp = async (candidate: RankedCandidate) => {
    setAssigningId(candidate.member.id);
    const result = await createAssignment(project.id, candidate.member.id, selectedRole);
    setAssigningId(null);
    if (!result.success) return;

    setSuccessIds(prev => [...prev, candidate.member.id]);

    const shootDate = project.eventDate
      ? format(parseISO(project.eventDate), 'd MMM yyyy')
      : 'TBD';
    const shootTime = project.eventTime || 'TBD';
    const location = (project as any).location || (project as any).shootLocation || 'TBD';
    const role = selectedRole === 'All' ? (Array.isArray(candidate.member.role) ? candidate.member.role[0] : candidate.member.role) : selectedRole;

    const message = [
      `Hi ${candidate.member.name}! 👋`,
      ``,
      `You've been selected for a shoot with *Make My Reels*:`,
      ``,
      `📽️ *Project:* ${project.title}`,
      `📅 *Date:* ${shootDate}`,
      `⏰ *Time:* ${shootTime}`,
      `📍 *Location:* ${location}`,
      `🎬 *Role:* ${role}`,
      ``,
      `Please confirm your availability:`,
      `✅ Accept: ${result.acceptUrl}`,
      `❌ Decline: ${result.declineUrl}`,
    ].join('\n');

    const phone = candidate.member.phone.replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  /** Long press: send via Interakt (original flow) */
  const handleAssign = async (candidate: RankedCandidate) => {
    setAssigningId(candidate.member.id);
    const result = await sendRequest(project.id, candidate.member.id, selectedRole);
    if (result.success) {
      setSuccessIds(prev => [...prev, candidate.member.id]);
    }
    setAssigningId(null);
  };

  const assignedMemberIds = existingAssignments
    .filter(a => ['accepted', 'wa_sent', 'pending'].includes(a.status))
    .map(a => a.teamMemberId);

  const allAssignedIds = [...new Set([...successIds, ...assignedMemberIds])];

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-md p-4" onClick={onClose}>
      <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-8 duration-400" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b shrink-0">
          <div>
            <h2 className="text-base font-black uppercase tracking-tighter text-slate-800">Smart Assign</h2>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate max-w-[280px]">{project.title}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-2xl hover:bg-slate-100 text-slate-400 transition-all">
            <X size={20} />
          </button>
        </div>

        {/* Role selector */}
        <div className="p-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">Role Needed</label>
            <div className="relative flex-1">
              <button
                type="button"
                onClick={() => setRoleDropdownOpen(v => !v)}
                className="w-full flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700"
              >
                {selectedRole}
                <ChevronDown size={12} className={`transition-transform ${roleDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {roleDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-xl shadow-lg z-10 overflow-hidden">
                  {[ALL_ROLES, ...teamRoles].map((r: string) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => { setSelectedRole(r); setRoleDropdownOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-[9px] font-black uppercase tracking-widest transition-colors ${r === selectedRole ? 'bg-indigo-600 text-white' : 'hover:bg-slate-50 text-slate-700'}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => fetchCandidates(project.id, selectedRole, assignmentGroupId || undefined)}
              className="p-2 rounded-xl text-slate-400 hover:bg-slate-50 transition-all"
              title="Refresh rankings"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Candidate list */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-300">
              <RefreshCw size={24} className="animate-spin" />
              <p className="text-[9px] font-black uppercase tracking-widest">Ranking candidates...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-rose-400">
              <p className="text-[10px] font-black uppercase">{error}</p>
            </div>
          ) : (
            <CandidateRankingList
              candidates={filteredCandidates}
              onAssign={handleAssign}
              onDirectWhatsApp={handleDirectWhatsApp}
              assigningId={assigningId}
              alreadyAssignedIds={allAssignedIds}
              assignments={existingAssignments}
            />
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Users size={12} />
            <span className="text-[9px] font-black uppercase tracking-widest">{filteredCandidates.length} candidates</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
