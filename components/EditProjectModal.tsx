
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Project, ProjectStatus, TeamMember, Priority, Client } from '../types';
import {
  Check, X, ChevronDown as ChevronDownIcon,
  Star, Camera, Target, Search, Link as LinkIcon,
  Tag, FileText, IndianRupee, Clock, MapPin, Briefcase, Send, Zap
} from 'lucide-react';
import { Instagram } from 'lucide-react';
import { MILEAGE_RATE_PER_KM } from '../constants';
import { useDistanceCalculator } from '../src/services/maps';
import { LocationAutocomplete } from './LocationAutocomplete';
import { useAssignments } from '../src/hooks/useAssignments';
import { AssignmentStatusBadge } from './AssignmentStatusBadge';
import { AssignTeamModal } from './AssignTeamModal';

export const EditProjectModal: React.FC<{
  project: Project;
  team: TeamMember[];
  clients: Client[];
  projects: Project[];
  onClose: () => void;
  onUpdate: (p: Project) => void;
  isUnlocked?: boolean;
  onSmartAssign?: (projectId: string) => void;
}> = ({ project, team, clients, projects, onClose, onUpdate, isUnlocked = false, onSmartAssign }) => {
  const [formData, setFormData] = useState<Project>({ ...project, dependencies: project.dependencies || [] });
  const [hasDeadline, setHasDeadline] = useState(!!project.submissionDeadline);
  const [hasTime, setHasTime] = useState(!!project.eventTime);
  const [teamSearch, setTeamSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [isDependenciesDropdownOpen, setIsDependenciesDropdownOpen] = useState(false);
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [dependencySearch, setDependencySearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [newTag, setNewTag] = useState('');
  const [newInstaLink, setNewInstaLink] = useState('');
  const [newInstaTag, setNewInstaTag] = useState('');

  const { getDistance } = useDistanceCalculator();
  const [debouncedLocation, setDebouncedLocation] = useState('');

  const { sendRequest, cancelAssignment, getLatestAssignmentForMember } = useAssignments([project.id]);
  const [sendingRequest, setSendingRequest] = useState<Record<string, boolean>>({});
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [distances, setDistances] = useState<Record<string, { text?: string; duration?: string; value?: number; isCalculating: boolean; error?: boolean }>>({});

  useEffect(() => {
    const handler = setTimeout(() => {
      if (formData.location && formData.location.trim().length > 3) {
        setDebouncedLocation(formData.location.trim());
      } else {
        setDebouncedLocation('');
      }
    }, 1000);
    return () => clearTimeout(handler);
  }, [formData.location]);

  useEffect(() => {
    if (!debouncedLocation) return;

    const calculateDistances = async () => {
      const newDistances: Record<string, any> = {};
      // Only calculate for members with a location, capped at 10 to limit API calls
      const membersWithLoc = team.filter(m => m.location && m.location.trim().length > 3).slice(0, 10);

      membersWithLoc.forEach(m => newDistances[m.id] = { isCalculating: true });
      setDistances(prev => ({ ...prev, ...newDistances }));

      await Promise.allSettled(membersWithLoc.map(async (member) => {
        try {
          const res = await getDistance(member.location!, debouncedLocation);
          if (res) {
            setDistances(prev => ({
              ...prev,
              [member.id]: {
                text: res.distanceText,
                duration: res.durationText,
                value: res.distanceValue,
                isCalculating: false
              }
            }));
          } else {
            setDistances(prev => ({ ...prev, [member.id]: { isCalculating: false, error: true } }));
          }
        } catch(e) {
          console.error('Distance calculation failed for', member.name, e);
          setDistances(prev => ({ ...prev, [member.id]: { isCalculating: false, error: true } }));
        }
      }));
    };

    calculateDistances();
  }, [debouncedLocation, team]);

  const scrollContainerRef = useRef<HTMLFormElement>(null);
  const clientSectionRef = useRef<HTMLDivElement>(null);
  const specialistSectionRef = useRef<HTMLDivElement>(null);
  const dependenciesSectionRef = useRef<HTMLDivElement>(null);

  const scrollSectionIntoView = (element: HTMLElement) => {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (isClientDropdownOpen && clientSectionRef.current)
      setTimeout(() => clientSectionRef.current && scrollSectionIntoView(clientSectionRef.current), 50);
  }, [isClientDropdownOpen]);

  useEffect(() => {
    if (isDropdownOpen && specialistSectionRef.current)
      setTimeout(() => specialistSectionRef.current && scrollSectionIntoView(specialistSectionRef.current), 50);
  }, [isDropdownOpen]);

  useEffect(() => {
    if (isDependenciesDropdownOpen && dependenciesSectionRef.current)
      setTimeout(() => dependenciesSectionRef.current && scrollSectionIntoView(dependenciesSectionRef.current), 50);
  }, [isDependenciesDropdownOpen]);

  const filteredTeam = useMemo(() => {
    let result = team.filter(m => m.name.toLowerCase().includes(teamSearch.toLowerCase()) || (m.location && m.location.toLowerCase().includes(teamSearch.toLowerCase())));

    const hasConflict = (member: TeamMember) =>
      projects.some(p => p.eventDate === formData.eventDate && p.teamMemberIds.includes(member.id) && p.id !== formData.id && p.location !== formData.location && p.status !== 'Completed' && p.status !== 'Expired');

    result.sort((a, b) => {
      const aSelected = formData.teamMemberIds.includes(a.id);
      const bSelected = formData.teamMemberIds.includes(b.id);
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;

      if (!aSelected && !bSelected) {
        const aConflict = hasConflict(a);
        const bConflict = hasConflict(b);
        if (!aConflict && bConflict) return -1;
        if (aConflict && !bConflict) return 1;
      }

      const aDist = distances[a.id]?.value || Infinity;
      const bDist = distances[b.id]?.value || Infinity;
      return aDist - bDist;
    });

    return result;
  }, [team, teamSearch, formData.teamMemberIds, distances, projects, formData.eventDate, formData.id, formData.location]);

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

        <form ref={scrollContainerRef} onSubmit={handleSubmit} className={`flex-1 custom-scrollbar p-6 space-y-4 ${isDropdownOpen || isClientDropdownOpen || isDependenciesDropdownOpen || isLocationOpen ? 'overflow-visible' : 'overflow-y-auto'}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-1 md:col-span-2 space-y-1">
              <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-2">Deliverable Title</label>
              <input required className="w-full border-2 border-slate-100 rounded-[20px] p-3 bg-slate-50 focus:border-indigo-500 outline-none font-black text-lg" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
            </div>

            <div ref={clientSectionRef} className="col-span-1 md:col-span-2 space-y-1">
              <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-2 flex items-center gap-1.5"><Briefcase size={12} /> Client Account</label>
              <div className={`relative w-full ${isClientDropdownOpen ? 'z-[100]' : 'z-[30]'}`}>
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
                    {(!formData.clientIds || formData.clientIds.length === 0) && !formData.clientId
                      ? <span className="text-slate-300 italic font-bold text-xs">No client linked</span>
                      : (formData.clientIds || (formData.clientId ? [formData.clientId] : [])).map(id => {
                          const client = clients.find(c => c.id === id);
                          if (!client) return null;
                          const pillColor = 'bg-slate-900';
                          return (
                            <span key={id} className={`${pillColor} text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm ring-1 ring-black/10`}>
                              {client.name || client.company || 'Unknown Client'}
                            </span>
                          );
                        })
                    }
                  </div>
                  <ChevronDownIcon size={18} className="text-slate-300 shrink-0" />
                </div>

                {isClientDropdownOpen && (
                  <div onClick={e => e.stopPropagation()} className="absolute top-full left-0 right-0 mt-4 bg-white border-2 border-slate-100 rounded-[30px] shadow-2xl p-4 animate-in slide-in-from-top-4 duration-300">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                      <input
                        className="w-full bg-slate-50 border-0 outline-none pl-12 pr-4 py-3 rounded-xl font-bold text-sm"
                        placeholder="Search clients..."
                        value={clientSearch}
                        onChange={e => setClientSearch(e.target.value)}
                      />
                    </div>
                    <div className="max-h-[260px] overflow-y-auto space-y-1 pr-2 custom-scrollbar mt-1">
                      <div
                        onClick={() => { setFormData({...formData, clientId: '', clientIds: []}); setIsClientDropdownOpen(false); }}
                        className={`flex items-center justify-between p-3.5 rounded-xl cursor-pointer transition-all ${(!formData.clientIds || formData.clientIds.length === 0) && !formData.clientId ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-50'}`}
                      >
                        <span className="font-black uppercase tracking-widest text-[10px]">-- No Client Linked --</span>
                        {(!formData.clientIds || formData.clientIds.length === 0) && !formData.clientId && <Check size={16} />}
                      </div>
                      {filteredClients.slice(0, 10).map(client => {
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
                            onDoubleClick={() => {
                              const currentIds = formData.clientIds || (formData.clientId ? [formData.clientId] : []);
                              const newIds = currentIds.includes(client.id) ? currentIds : [...currentIds, client.id];
                              setFormData({...formData, clientIds: newIds, clientId: newIds[0] || ''});
                              setIsClientDropdownOpen(false);
                            }}
                            className={`flex items-center justify-between p-3.5 rounded-xl cursor-pointer transition-all ${isSelected ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-50'}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white shrink-0 ${client.color || 'bg-slate-900'}`}>
                                {(client.avatar || client.name || '').replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase()}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="font-black uppercase tracking-widest text-[11px] truncate">{client.name}</span>
                                {client.company && <span className={`text-[8px] font-bold uppercase tracking-widest ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>{client.company}</span>}
                              </div>
                            </div>
                            {isSelected && <Check size={18} className="shrink-0 ml-2" />}
                          </div>
                        );
                      })}
                      {filteredClients.length === 0 && <p className="text-center text-slate-300 text-xs py-4 font-bold">No clients found</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="col-span-1 md:col-span-2 space-y-1 relative z-[70]">
              <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-2">Location</label>
              <LocationAutocomplete
                value={formData.location}
                onChange={(value) => setFormData({...formData, location: value})}
                onSuggestionsOpenChange={setIsLocationOpen}
                placeholder="Search and select location..."
                className="!py-3 !pl-10 !pr-4 !rounded-[16px] !text-base"
              />
            </div>

            <div ref={specialistSectionRef} className="col-span-1 md:col-span-2 space-y-1">
              <div className="flex items-center justify-between ml-2 mr-1">
                <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Specialist Deployment</label>
                <button
                  type="button"
                  onClick={() => onSmartAssign ? onSmartAssign(project.id) : setShowAssignModal(true)}
                  className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-700 transition-colors"
                >
                  <Zap size={9} /> Smart Assign
                </button>
              </div>
              <div className={`relative w-full ${isDropdownOpen ? 'z-[100]' : 'z-[20]'}`}>
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
                  <div onClick={e => e.stopPropagation()} className="absolute top-full left-0 right-0 mt-4 bg-white border-2 border-slate-100 rounded-[30px] shadow-2xl p-4 animate-in slide-in-from-top-4 duration-300">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                      <input className="w-full bg-slate-50 border-0 outline-none pl-12 pr-4 py-3 rounded-xl font-bold text-sm" placeholder="Search team..." value={teamSearch} onChange={e => setTeamSearch(e.target.value)} />
                    </div>
                    <div className="max-h-[260px] overflow-y-auto space-y-1 custom-scrollbar pr-2 mt-1">
                      <div
                        onClick={() => { setFormData({...formData, teamMemberIds: []}); setIsDropdownOpen(false); }}
                        className={`flex items-center justify-between p-3.5 rounded-xl cursor-pointer transition-all ${formData.teamMemberIds.length === 0 ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-50'}`}
                      >
                        <span className="font-black uppercase tracking-widest text-[10px]">-- Unassigned --</span>
                        {formData.teamMemberIds.length === 0 && <Check size={16} />}
                      </div>
                      {filteredTeam.map(member => (
                        <div
                          key={member.id}
                          onClick={() => toggleMember(member.id)}
                          onDoubleClick={() => { if (!formData.teamMemberIds.includes(member.id)) toggleMember(member.id); setIsDropdownOpen(false); }}
                          className={`flex items-center justify-between p-3.5 rounded-xl cursor-pointer transition-all ${formData.teamMemberIds.includes(member.id) ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-50'}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white shrink-0 ${member.color || 'bg-slate-900'}`}>{(member.avatar || '').replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase()}</div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-black uppercase tracking-widest text-[11px] truncate">{member.name}</span>
                              {distances[member.id]?.isCalculating ? (
                                <span className="text-[9px] text-indigo-300 font-bold animate-pulse mt-0.5">Calculating ETA...</span>
                              ) : distances[member.id]?.text ? (
                                <span className={`text-[9px] font-bold mt-0.5 flex items-center gap-1 ${formData.teamMemberIds.includes(member.id) ? 'text-indigo-200' : 'text-emerald-600'}`}>
                                  <MapPin size={10} /> {distances[member.id].text} • {distances[member.id].duration}
                                </span>
                              ) : member.location ? (
                                <span className={`text-[9px] mt-0.5 truncate ${formData.teamMemberIds.includes(member.id) ? 'text-indigo-300' : 'text-slate-400'}`}>📍 {member.location}</span>
                              ) : (
                                <span className={`text-[8px] italic mt-0.5 ${formData.teamMemberIds.includes(member.id) ? 'text-indigo-400/70' : 'text-slate-300'}`}>No location set</span>
                              )}
                              {projects.filter(p => p.eventDate === formData.eventDate && p.teamMemberIds.includes(member.id) && p.id !== formData.id && p.location !== formData.location && p.status !== 'Completed' && p.status !== 'Expired').length > 0 && (
                                <span className="text-[9px] text-rose-500 font-bold mt-0.5 animate-pulse flex items-center gap-1">
                                  ⚠️ Shoot conflict today!
                                </span>
                              )}
                            </div>
                          </div>
                          {formData.teamMemberIds.includes(member.id) && <Check size={18} className="shrink-0 ml-2" />}
                        </div>
                      ))}
                      {filteredTeam.length === 0 && <p className="text-center text-slate-300 text-xs py-4 font-bold">No members found</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Assignment Requests */}
            {formData.teamMemberIds.length > 0 && (
              <div className="col-span-1 md:col-span-2 space-y-2">
                <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-2 flex items-center gap-1.5">
                  <Send size={10} /> Assignment Requests
                </label>
                <div className="space-y-2">
                  {formData.teamMemberIds.map(memberId => {
                    const member = team.find(m => m.id === memberId);
                    if (!member) return null;
                    const assignment = getLatestAssignmentForMember(project.id, memberId);
                    const isSending = sendingRequest[memberId];
                    const canSend = !assignment || ['declined', 'expired', 'cancelled'].includes(assignment.status);
                    const role = Array.isArray(member.role) ? member.role[0] : member.role;
                    return (
                      <div key={memberId} className="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3 border border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black text-white ${member.color || 'bg-green-600'}`}>
                            {(member.avatar || '').replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">{member.name}</span>
                            <span className="text-[8px] text-slate-400 font-bold uppercase">{role}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {assignment && <AssignmentStatusBadge status={assignment.status} size="sm" />}
                          {canSend ? (
                            <button
                              type="button"
                              disabled={isSending}
                              onClick={async () => {
                                setSendingRequest(prev => ({ ...prev, [memberId]: true }));
                                try {
                                  if (assignment && ['declined', 'expired'].includes(assignment.status)) {
                                    await cancelAssignment(assignment.id);
                                  }
                                  const result = await sendRequest(project.id, memberId, role);
                                  if (result.success) {
                                    setSendingRequest(prev => ({ ...prev, [memberId]: 'sent' as any }));
                                    setTimeout(() => setSendingRequest(prev => ({ ...prev, [memberId]: false })), 3000);
                                  } else {
                                    console.error('[assignment] send failed:', result.error);
                                    alert(`Send failed: ${result.error || 'Unknown error'}`);
                                    setSendingRequest(prev => ({ ...prev, [memberId]: false }));
                                  }
                                } catch (err: any) {
                                  console.error('[assignment] exception:', err);
                                  alert(`Send failed: ${err.message || 'Network error'}`);
                                  setSendingRequest(prev => ({ ...prev, [memberId]: false }));
                                }
                              }}
                              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all disabled:opacity-50"
                            >
                              <Send size={10} />
                              {sendingRequest[memberId] === ('sent' as any) ? 'Sent ✓' : isSending ? 'Sending...' : assignment ? 'Resend' : 'Send Request'}
                            </button>
                          ) : (
                            assignment && ['pending', 'wa_sent'].includes(assignment.status) && (
                              <button
                                type="button"
                                onClick={() => cancelAssignment(assignment.id)}
                                className="text-[9px] font-black uppercase tracking-wider text-slate-400 hover:text-rose-500 transition-colors px-2 py-1"
                              >
                                Cancel
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
                    onClick={() => {
                      if (!hasDeadline && !formData.submissionDeadline) {
                        setFormData(prev => ({ ...prev, submissionDeadline: prev.eventDate }));
                      }
                      setHasDeadline(!hasDeadline);
                    }}
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
              {isUnlocked && formData.teamMemberIds.length > 0 && formData.teamMemberIds.reduce((sum, id) => sum + (distances[id]?.value || 0), 0) > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const totalMeters = formData.teamMemberIds.reduce((sum, id) => sum + (distances[id]?.value || 0), 0);
                    const cost = Math.round((totalMeters / 1000) * MILEAGE_RATE_PER_KM);
                    setFormData({...formData, expenses: (formData.expenses || 0) + cost});
                  }}
                  className="text-[9px] font-bold text-indigo-500 hover:text-indigo-700 ml-2 uppercase tracking-wider flex items-center gap-1 mt-1 transition-colors"
                >
                  <MapPin size={8} /> + Add ₹{Math.round((formData.teamMemberIds.reduce((sum, id) => sum + (distances[id]?.value || 0), 0) / 1000) * MILEAGE_RATE_PER_KM)} Travel Cost
                </button>
              )}
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
              <div className={`relative w-full ${isDependenciesDropdownOpen ? 'z-[100]' : 'z-[10]'}`}>
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
                      {filteredDependencies.map(proj => {
                        const depClient = clients.find(c => c.id === proj.clientId) || (proj.clientIds?.length ? clients.find(c => proj.clientIds!.includes(c.id)) : null);
                        const isDepSelected = (formData.dependencies || []).includes(proj.id);
                        return (
                          <div key={proj.id} onClick={() => toggleDependency(proj.id)} onDoubleClick={() => { if (!isDepSelected) toggleDependency(proj.id); setIsDependenciesDropdownOpen(false); }} className={`flex items-center justify-between p-3 rounded-xl cursor-pointer ${isDepSelected ? 'bg-indigo-600 text-white' : 'hover:bg-slate-50'}`}>
                            <div className="flex flex-col">
                              <span className="font-black uppercase tracking-widest text-[10px]">{proj.title}</span>
                              {depClient && <span className={`text-[8px] font-bold uppercase tracking-widest ${isDepSelected ? 'text-indigo-300' : 'text-slate-400'}`}>{depClient.name || depClient.company}</span>}
                            </div>
                            {isDepSelected && <Check size={16} />}
                          </div>
                        );
                      })}
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
      {!onSmartAssign && showAssignModal && (
        <AssignTeamModal project={project} team={team} onClose={() => setShowAssignModal(false)} />
      )}
    </div>
  );
};
