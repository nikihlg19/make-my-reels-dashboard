import React, { useState } from 'react';
import { CheckCircle, XCircle, MapPin, Star, Briefcase, ChevronDown, Send, RefreshCw } from 'lucide-react';
import type { RankedCandidate } from '../src/hooks/useCandidateRanking';
import type { ProjectAssignment } from '../types';

interface CandidateRankingListProps {
  candidates: RankedCandidate[];
  onAssign: (candidate: RankedCandidate) => void;
  assigningId?: string | null;
  alreadyAssignedIds?: string[];
  assignments?: ProjectAssignment[];
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  accepted:  { label: 'Accepted',  className: 'bg-emerald-100 text-emerald-700' },
  declined:  { label: 'Declined',  className: 'bg-rose-100 text-rose-600' },
  wa_sent:   { label: 'Sent',      className: 'bg-amber-100 text-amber-700' },
  pending:   { label: 'Pending',   className: 'bg-sky-100 text-sky-700' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-400' },
  expired:   { label: 'Expired',   className: 'bg-slate-100 text-slate-400' },
};

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

function ScoreBreakdownTooltip({ breakdown }: { breakdown: RankedCandidate['breakdown'] }) {
  const rows = [
    { label: 'Distance',     value: breakdown.distance,     color: 'bg-indigo-400', weight: '25%' },
    { label: 'Availability', value: breakdown.availability, color: 'bg-emerald-400', weight: '20%' },
    { label: 'Rating',       value: breakdown.rating,       color: 'bg-amber-400',  weight: '20%' },
    { label: 'Workload',     value: breakdown.workload,     color: 'bg-cyan-400',   weight: '15%' },
    { label: 'Skills',       value: breakdown.skills,       color: 'bg-violet-400', weight: '15%' },
  ];
  return (
    <div className="space-y-1.5 p-3 min-w-[200px]">
      {rows.map(r => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest w-20 shrink-0">{r.label}</span>
          <ScoreBar value={r.value} color={r.color} />
          <span className="text-[8px] font-black text-slate-300 tabular-nums w-6 text-right">{Math.round(r.value * 100)}</span>
        </div>
      ))}
      {breakdown.recentDecline < 0 && (
        <p className="text-[8px] font-black text-rose-400 uppercase mt-1">-50 recent decline penalty</p>
      )}
    </div>
  );
}

export const CandidateRankingList: React.FC<CandidateRankingListProps> = ({
  candidates, onAssign, assigningId, alreadyAssignedIds = [], assignments = [],
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (candidates.length === 0) {
    return (
      <div className="text-center py-8 text-slate-300">
        <Briefcase size={32} className="mx-auto mb-2 opacity-30" />
        <p className="text-[10px] font-black uppercase tracking-widest">No candidates found</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {candidates.map((c, idx) => {
        const isAssigned = alreadyAssignedIds.includes(c.member.id);
        const isAssigning = assigningId === c.member.id;
        const isExpanded = expandedId === c.member.id;
        const unavailable = !c.isAvailable;
        const roles = Array.isArray(c.member.role) ? c.member.role.join(' · ') : c.member.role;
        const memberAssignment = assignments.find(a => a.teamMemberId === c.member.id);
        const statusBadge = memberAssignment ? STATUS_BADGE[memberAssignment.status] : null;

        const scoreColor =
          c.score >= 75 ? 'text-emerald-600 bg-emerald-50' :
          c.score >= 50 ? 'text-amber-600 bg-amber-50' :
          'text-rose-600 bg-rose-50';

        return (
          <div key={c.member.id} className={`rounded-2xl border transition-all ${unavailable ? 'border-rose-100 bg-rose-50/40 opacity-70' : isAssigned ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-100 bg-white hover:border-indigo-100'}`}>
            <div className="flex items-center gap-3 p-3">
              {/* Rank */}
              <div className="w-5 text-center text-[9px] font-black text-slate-300 shrink-0">#{idx + 1}</div>

              {/* Avatar */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[9px] font-black text-white shrink-0 ${c.member.color || 'bg-slate-700'}`}>
                {(c.member.avatar || '').replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || c.member.name.slice(0, 2).toUpperCase()}
              </div>

              {/* Name + meta */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-black uppercase tracking-tight text-slate-800 truncate">{c.member.name}</span>
                  {unavailable && <XCircle size={10} className="text-rose-500 shrink-0" />}
                  {isAssigned && !statusBadge && <CheckCircle size={10} className="text-emerald-500 shrink-0" />}
                  {statusBadge && (
                    <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full shrink-0 ${statusBadge.className}`}>
                      {statusBadge.label}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-[8px] text-slate-400 font-bold uppercase">{roles}</span>
                  {c.distanceKm !== undefined && (
                    <span className="text-[8px] text-indigo-500 font-bold flex items-center gap-0.5">
                      <MapPin size={7} />{c.distanceKm.toFixed(1)} km
                    </span>
                  )}
                  {c.member.avgRating > 0 && (
                    <span className="text-[8px] text-amber-500 font-bold flex items-center gap-0.5">
                      <Star size={7} className="fill-amber-400" />{c.member.avgRating.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>

              {/* Score badge */}
              <div className={`text-[10px] font-black px-2 py-0.5 rounded-lg tabular-nums shrink-0 ${scoreColor}`}>
                {c.score}
              </div>

              {/* Breakdown toggle */}
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : c.member.id)}
                className="p-1 text-slate-300 hover:text-slate-500 transition-colors shrink-0"
              >
                <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>

              {/* Send / Resend button */}
              {isAssigned ? (
                <button
                  type="button"
                  disabled={isAssigning}
                  onClick={() => onAssign(c)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all shrink-0 ${
                    isAssigning ? 'bg-amber-400 text-white opacity-70 cursor-wait' :
                    'bg-amber-100 hover:bg-amber-200 text-amber-700 active:scale-95'
                  }`}
                >
                  <RefreshCw size={9} className={isAssigning ? 'animate-spin' : ''} />
                  {isAssigning ? 'Sending...' : 'Resend'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isAssigning || unavailable}
                  onClick={() => onAssign(c)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all shrink-0 ${
                    unavailable ? 'bg-slate-100 text-slate-300 cursor-not-allowed' :
                    isAssigning ? 'bg-emerald-500 text-white opacity-70 cursor-wait' :
                    'bg-[#25D366] hover:bg-[#1ebe5d] text-white active:scale-95'
                  }`}
                >
                  <Send size={9} />
                  {isAssigning ? 'Sending...' : 'Send'}
                </button>
              )}
            </div>

            {/* Score breakdown drawer */}
            {isExpanded && (
              <div className="border-t border-slate-100 animate-in slide-in-from-top-1 duration-200">
                <ScoreBreakdownTooltip breakdown={c.breakdown} />
                {c.member.tags && c.member.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 px-3 pb-3">
                    {c.member.tags.map(tag => (
                      <span key={tag} className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500">#{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
