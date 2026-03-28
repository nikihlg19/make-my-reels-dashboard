import React, { useState, useMemo, useRef } from 'react';
import { TeamMember, Project } from '../types';
import { Phone, X, Check, Tag, Trash2, Star, ExternalLink, FileText, Lock, Edit3, Save, History, Pencil, MapPin } from 'lucide-react';
import { formatDisplayDate } from '../constants';
import { parseLocation } from '../src/utils/location';

export interface TeamMemberCardProps {
  member: TeamMember;
  projects: Project[];
  onConnect: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onManageTags: () => void;
  onUpdateNotes?: (notes: string) => void;
  onRateProject?: (project: Project) => void;
  onEditProject?: (project: Project) => void;
  isFinancialsUnlocked?: boolean;
  onGlobalUnlock?: () => void;
  isAdmin?: boolean;
}

const TeamMemberCard: React.FC<TeamMemberCardProps> = ({ member, projects, onConnect, onDelete, onEdit, onManageTags, onUpdateNotes, onRateProject, onEditProject, isFinancialsUnlocked = false, onGlobalUnlock, isAdmin = false }) => {
  const [showActivePeek, setShowActivePeek] = useState(false);
  const [showClosedPeek, setShowClosedPeek] = useState(false);
  const [showRatingPeek, setShowRatingPeek] = useState(false);
  const activeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ratingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [popupAlign, setPopupAlign] = useState<'left' | 'center' | 'right'>('center');

  const checkPopupAlignment = () => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const POPUP_W = 256;
    if (rect.left < POPUP_W / 2) setPopupAlign('left');
    else if (rect.right > vw - POPUP_W / 2) setPopupAlign('right');
    else setPopupAlign('center');
  };

  const popupPos = popupAlign === 'left' ? 'left-0' : popupAlign === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2';

  const [showAuth, setShowAuth] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [tempNotes, setTempNotes] = useState(member.onboardingNotes || '');
  const [showCopyFeedback, setShowCopyFeedback] = useState(false);

  const activeAssignments = useMemo(() => {
    return projects.filter(p => p.teamMemberIds.includes(member.id) && p.status !== 'Completed');
  }, [projects, member.id]);

  const completedAssignments = useMemo(() => {
    return projects
      .filter(p => p.teamMemberIds.includes(member.id) && p.status === 'Completed')
      .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
  }, [projects, member.id]);

  const avgRatingValue = useMemo(() => {
    const rated = completedAssignments.filter(p => p.rating !== undefined);
    if (rated.length === 0) return 0;
    return rated.reduce((acc, p) => acc + (p.rating || 0), 0) / rated.length;
  }, [completedAssignments]);

  const initials = member.name.replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/).filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const handleNotesClick = () => {
    if (isFinancialsUnlocked) {
      setShowNotes(true);
      setTempNotes(member.onboardingNotes || '');
    } else {
      setShowAuth(true);
    }
  };

  const handleSaveNotes = () => {
    if (onUpdateNotes) {
      onUpdateNotes(tempNotes);
    }
    setIsEditingNotes(false);
  };

  const handlePhoneClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.location.href = `tel:${member.phone}`;
  };

  // Tooltip Mouse Handlers
  const handleActiveEnter = () => {
    if (activeTimeoutRef.current) clearTimeout(activeTimeoutRef.current);
    checkPopupAlignment();
    setShowActivePeek(true);
  };

  const handleActiveLeave = () => {
    activeTimeoutRef.current = setTimeout(() => {
      setShowActivePeek(false);
    }, 500);
  };

  const handleClosedEnter = () => {
    if (closedTimeoutRef.current) clearTimeout(closedTimeoutRef.current);
    checkPopupAlignment();
    setShowClosedPeek(true);
  };

  const handleClosedLeave = () => {
    closedTimeoutRef.current = setTimeout(() => {
      setShowClosedPeek(false);
    }, 500);
  };

  const handleRatingEnter = () => {
    if (ratingTimeoutRef.current) clearTimeout(ratingTimeoutRef.current);
    checkPopupAlignment();
    setShowRatingPeek(true);
  };

  const handleRatingLeave = () => {
    ratingTimeoutRef.current = setTimeout(() => {
      setShowRatingPeek(false);
    }, 500);
  };

  return (
    <div ref={cardRef} className="bg-white rounded-[20px] p-4 shadow-sm border border-slate-100 hover:shadow-md transition-all group relative animate-in fade-in zoom-in-95 duration-300 flex flex-col h-full hover:z-50 overflow-visible">
      {/* ... header controls ... */}
      <div className="absolute top-2 right-2 flex gap-1 z-10">
        {isAdmin && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 bg-slate-50 text-slate-400 hover:bg-slate-900 hover:text-white rounded-lg transition-all shadow-sm"
            title="Edit Profile"
          >
            <Pencil size={12} />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); handleNotesClick(); }}
          className={`p-1.5 rounded-lg transition-all shadow-sm ${member.onboardingNotes || isFinancialsUnlocked ? 'bg-amber-50 text-amber-500 hover:bg-amber-500 hover:text-white' : 'bg-slate-50 text-slate-300 hover:bg-amber-500 hover:text-white'}`}
          title={member.onboardingNotes ? "View/Edit Private Notes" : "Add Private Notes"}
        >
          <FileText size={12} />
        </button>
        {isAdmin && (
          <button
            onClick={(e) => { e.stopPropagation(); onManageTags(); }}
            className="p-1.5 bg-slate-50 text-slate-400 hover:bg-[#4F46E5] hover:text-white rounded-lg transition-all shadow-sm"
            title="Manage Tags"
          >
            <Tag size={12} />
          </button>
        )}
        {isAdmin && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg transition-all shadow-sm"
            title="Remove specialist"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      <div className="flex flex-col items-center text-center flex-1">
        <div
          onClick={(e) => { if (!isAdmin) return; e.stopPropagation(); onEdit(); }}
          style={{ backgroundColor: (['#f43f5e','#8b5cf6','#f59e0b','#10b981','#0ea5e9','#ec4899','#f97316','#6366f1','#14b8a6','#eab308'][Math.abs(member.id.split('').reduce((a,c)=>a+c.charCodeAt(0),0)) % 10]) }}
          className={`w-12 h-12 rounded-[16px] flex items-center justify-center text-lg font-black text-white mb-2 shadow-sm transition-all group-hover:scale-105 group-hover:rotate-3 ${isAdmin ? 'cursor-pointer hover:ring-4 hover:ring-indigo-100 hover:opacity-90' : 'cursor-default'}`}
        >
          {initials}
        </div>

        <div className="flex items-center gap-1.5 mb-0 justify-center">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">{member.name}</h3>
          {avgRatingValue > 0 && (
            <div
              className="relative flex items-center gap-0.5 bg-amber-50 text-amber-600 px-1 py-0.5 rounded-md border border-amber-100 shadow-sm cursor-default"
              title="Avg Specialist Rating"
              onMouseEnter={handleRatingEnter}
              onMouseLeave={handleRatingLeave}
            >
              <Star size={8} className="fill-amber-400 text-amber-400" />
              <span className="text-[8px] font-black tabular-nums">{avgRatingValue.toFixed(1)}</span>

              {showRatingPeek && completedAssignments.filter(p => p.rating !== undefined).length > 0 && (
                <div
                  className={`absolute top-full ${popupPos} pt-2 w-64 z-[200] animate-in zoom-in-95 slide-in-from-top-2 duration-200`}
                  onMouseEnter={handleRatingEnter}
                  onMouseLeave={handleRatingLeave}
                >
                  <div className="bg-slate-900 rounded-2xl shadow-2xl p-2 border border-white/10">
                    <div className="p-2 border-b border-white/5 mb-1 flex items-center justify-between">
                      <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Recent Ratings</h4>
                      <Star size={10} className="text-amber-400 fill-amber-400" />
                    </div>
                    <div className="space-y-1">
                      {completedAssignments.filter(p => p.rating !== undefined).slice(0, 3).map(p => (
                        <button
                          key={p.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditProject?.(p);
                          }}
                          className="w-full text-left p-2.5 rounded-xl hover:bg-white/10 transition-all group/item flex items-center justify-between gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black text-white uppercase tracking-tight truncate">{p.title}</p>
                            <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest italic">{formatDisplayDate(p.eventDate)}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 bg-white/5 px-1.5 py-0.5 rounded-lg">
                            <Star size={8} className="fill-amber-400 text-amber-400" />
                            <span className="text-[9px] font-black text-amber-400 tabular-nums">{p.rating}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 -mb-2 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-slate-900" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">
          {Array.isArray(member.role) ? member.role.join(' \u2022 ') : member.role}
        </p>

        {member.location && (() => {
          const parsedLoc = parseLocation(member.location);
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
              className="text-[9px] text-indigo-400 hover:text-indigo-600 cursor-pointer font-bold uppercase tracking-widest mb-2 flex items-center justify-center gap-1 transition-colors"
            >
              <MapPin size={10} />
              {parsedLoc.mainText}
            </a>
          );
        })()}

        <div
          onClick={handlePhoneClick}
          className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-xl border border-slate-100 mb-2 group/contact transition-all hover:bg-white hover:shadow-sm cursor-pointer"
          title="Call phone number"
        >
          <Phone size={10} className="text-[#4F46E5]" />
          <span className="text-[9px] font-black text-slate-700 tracking-wider tabular-nums">{member.phone}</span>
        </div>

        <div className={`flex flex-wrap justify-center gap-1 mb-2 mt-auto w-full ${member.tags && member.tags.length > 0 ? 'min-h-[18px]' : ''}`}>
          {member.tags?.map((tag, i) => (
            <span key={i} className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-indigo-50 text-[#4F46E5] border border-indigo-100">#{tag}</span>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 w-full mb-3">
          <div
            className="flex flex-col items-center p-2 rounded-xl bg-slate-50 border border-slate-100 transition-all hover:bg-white hover:shadow-md cursor-default relative group/active"
            onMouseEnter={handleActiveEnter}
            onMouseLeave={handleActiveLeave}
          >
            <span className="text-sm font-black text-[#4F46E5] tracking-tighter tabular-nums leading-none mb-0.5">
              {activeAssignments.length}
            </span>
            <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none">Active</span>

            {showActivePeek && activeAssignments.length > 0 && (
              <div
                className={`absolute bottom-full ${popupPos} pb-2 w-64 z-[200] animate-in zoom-in-95 slide-in-from-bottom-2 duration-200`}
                onMouseEnter={handleActiveEnter}
                onMouseLeave={handleActiveLeave}
              >
                <div className="bg-slate-900 rounded-2xl shadow-2xl p-2 border border-white/10">
                  <div className="p-2 border-b border-white/5 mb-1">
                    <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">In Production</h4>
                  </div>
                  <div className="max-h-48 overflow-y-auto custom-scrollbar">
                    {activeAssignments.map(p => (
                      <button
                        key={p.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditProject?.(p);
                        }}
                        className="w-full text-left p-2.5 rounded-xl hover:bg-white/10 transition-all group/item flex items-center justify-between gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black text-white uppercase tracking-tight truncate">{p.title}</p>
                          <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{p.status}</p>
                        </div>
                        <ExternalLink size={12} className="text-white/20 group-hover/item:text-indigo-400" />
                      </button>
                    ))}
                  </div>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-2 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-slate-900" />
                </div>
              </div>
            )}
          </div>

          <div
            className="flex flex-col items-center p-2 rounded-xl bg-slate-50 border border-slate-100 transition-all hover:bg-white hover:shadow-md cursor-default relative group/closed"
            onMouseEnter={handleClosedEnter}
            onMouseLeave={handleClosedLeave}
          >
            <span className="text-sm font-black text-emerald-600 tracking-tighter tabular-nums leading-none mb-0.5">
              {completedAssignments.length}
            </span>
            <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none">Closed</span>

            {showClosedPeek && completedAssignments.length > 0 && (
              <div
                className={`absolute bottom-full ${popupPos} pb-2 w-64 z-[200] animate-in zoom-in-95 slide-in-from-bottom-2 duration-200`}
                onMouseEnter={handleClosedEnter}
                onMouseLeave={handleClosedLeave}
              >
                <div className="bg-slate-900 rounded-2xl shadow-2xl p-2 border border-white/10">
                  <div className="p-2 border-b border-white/5 mb-1 flex items-center justify-between">
                    <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Recent Success</h4>
                    <History size={10} className="text-slate-600" />
                  </div>
                  <div className="space-y-1">
                    {completedAssignments.slice(0, 3).map(p => (
                      <button
                        key={p.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditProject?.(p);
                        }}
                        className="w-full text-left p-2.5 rounded-xl hover:bg-white/10 transition-all group/item flex items-center justify-between gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black text-white uppercase tracking-tight truncate">{p.title}</p>
                          <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest italic">{formatDisplayDate(p.eventDate)}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 bg-white/5 px-1.5 py-0.5 rounded-lg">
                          <Star size={8} className="fill-amber-400 text-amber-400" />
                          <span className="text-[9px] font-black text-amber-400 tabular-nums">{p.rating || '\u2014'}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-2 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-slate-900" />
                </div>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={onConnect}
          className="w-full bg-[#25D366] text-white py-2 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-sm hover:bg-[#128C7E] transition-all flex items-center justify-center gap-1.5 group/btn overflow-hidden relative active:scale-95"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700" />
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
          </svg>
          <span>WhatsApp</span>
        </button>
      </div>

      {showAuth && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowAuth(false)} />
          <div onClick={e => e.stopPropagation()} className="relative bg-white rounded-[28px] w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center bg-indigo-50">
                <Lock size={28} className="text-indigo-500" />
              </div>
              <h3 className="text-lg font-black text-slate-800 tracking-tight uppercase mb-2">View Private Notes</h3>
              <p className="text-sm text-slate-500 font-medium">Access onboarding notes for this team member?</p>
            </div>
            <div className="flex border-t border-slate-100">
              <button onClick={() => setShowAuth(false)} className="flex-1 py-4 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all flex items-center justify-center gap-2">
                <X size={16} /> Cancel
              </button>
              <button onClick={() => { setShowAuth(false); setShowNotes(true); setTempNotes(member.onboardingNotes || ''); if(onGlobalUnlock) onGlobalUnlock(); }} className="flex-1 py-4 text-[11px] font-black uppercase tracking-widest text-white bg-indigo-600 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                <Check size={16} /> View Notes
              </button>
            </div>
          </div>
        </div>
      )}

      {showNotes && (
        <div
          onClick={() => { setShowNotes(false); setIsEditingNotes(false); }}
          className="fixed inset-0 z-[200] flex items-start justify-center sm:items-center bg-slate-900/60 backdrop-blur-md p-4 overflow-hidden animate-in fade-in duration-300"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-[48px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-full sm:max-h-[85vh] my-auto border border-white/20"
          >
            <div className="flex justify-between items-center p-8 border-b border-slate-100 bg-white/50 backdrop-blur-sm shrink-0 z-20">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500">
                  <FileText size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight uppercase leading-none">Talent Profile</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">Private Onboarding Insights</p>
                </div>
              </div>
              <button onClick={() => { setShowNotes(false); setIsEditingNotes(false); }} className="p-3 hover:bg-slate-50 rounded-2xl text-slate-400 hover:text-slate-800 transition-all active:scale-90"><X size={24} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              <div className="flex items-center gap-4 p-5 bg-slate-50 rounded-[32px] border border-slate-100">
                <div style={{ backgroundColor: (['#f43f5e','#8b5cf6','#f59e0b','#10b981','#0ea5e9','#ec4899','#f97316','#6366f1','#14b8a6','#eab308'][Math.abs(member.id.split('').reduce((a,c)=>a+c.charCodeAt(0),0)) % 10]) }} className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-white shadow-lg">{initials}</div>
                <div>
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">{member.name}</h4>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{Array.isArray(member.role) ? member.role.join(' \u2022 ') : member.role}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center px-2">
                  <label className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] block">Internal Assessment</label>
                  {!isEditingNotes && (
                    <button
                      onClick={() => setIsEditingNotes(true)}
                      className="text-[9px] font-black uppercase tracking-widest text-[#4F46E5] hover:underline flex items-center gap-1"
                    >
                      <Edit3 size={10} /> Edit Notes
                    </button>
                  )}
                </div>

                <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 min-h-[160px] relative">
                  {isEditingNotes ? (
                    <textarea
                      className="w-full bg-transparent text-sm font-medium text-slate-600 leading-relaxed italic outline-none resize-none min-h-[140px]"
                      value={tempNotes}
                      onChange={(e) => setTempNotes(e.target.value)}
                      placeholder="Start typing onboarding insights..."
                      autoFocus
                    />
                  ) : (
                    <p className="text-sm font-medium text-slate-600 leading-relaxed italic whitespace-pre-wrap">
                      {member.onboardingNotes ? `"${member.onboardingNotes}"` : "No insights recorded for this specialist yet."}
                    </p>
                  )}
                  <div className="absolute top-[-10px] left-8 px-3 bg-white border border-slate-100 rounded-full">
                    <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest">Confidential</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-8 pt-6 border-t border-slate-100 bg-white/50 backdrop-blur-sm shrink-0 z-20 flex gap-4">
              {isEditingNotes ? (
                <>
                  <button
                    onClick={() => { setIsEditingNotes(false); setTempNotes(member.onboardingNotes || ''); }}
                    className="flex-1 py-4 rounded-[24px] border-2 border-slate-100 text-slate-400 font-black text-[11px] uppercase tracking-[0.2em] transition-all hover:bg-slate-50 active:scale-95"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleSaveNotes}
                    className="flex-1 py-4 rounded-[24px] bg-indigo-600 text-white font-black text-[11px] uppercase tracking-[0.2em] shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 active:scale-95"
                  >
                    <Save size={14} /> Commit Changes
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowNotes(false)}
                  className="w-full py-4 rounded-[24px] bg-slate-900 text-white font-black text-[11px] uppercase tracking-widest shadow-xl active:scale-95 transition-all hover:bg-slate-800"
                >
                  Exit Secure View
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(TeamMemberCard);
