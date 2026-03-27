
import React, { useState, useMemo, useEffect } from 'react';
import { X, Check, Users as UsersIcon, ChevronDown, IndianRupee, Target, Camera, Search, Link as LinkIcon, Instagram, Tag, FileText, Briefcase, Clock, MapPin, Zap } from 'lucide-react';
import { useDistanceCalculator } from '../src/services/maps';
import { TeamMember, Project, Priority, ProjectStatus, InstaLink, Client } from '../types';
import { LocationAutocomplete } from './LocationAutocomplete';
import { MILEAGE_RATE_PER_KM } from '../constants';
import { AssignTeamModal } from './AssignTeamModal';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  team: TeamMember[];
  clients: Client[];
  projects: Project[];
  onAddProject: (project: Project) => void;
  initialDate?: string;
  initialStatus?: ProjectStatus;
}

const NewProjectModal: React.FC<NewProjectModalProps> = ({ onClose, team, clients, projects, onAddProject, initialDate, initialStatus }) => {
  const [formData, setFormData] = useState({
    id: Math.random().toString(36).substr(2, 9).toUpperCase(),
    title: '',
    description: '',
    notes: '',
    location: '',
    priority: 'Medium' as Priority,
    budget: 0,
    expenses: 0,
    status: initialStatus || 'Quote Sent' as ProjectStatus,
    eventDate: initialDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    eventTime: '09:00',
    submissionDeadline: '',
    instaLinks: [] as InstaLink[],
    tags: [] as string[],
    clientId: '',
    clientIds: [] as string[],
    dependencies: [] as string[]
  });
  const [hasDeadline, setHasDeadline] = useState(false);
  const [hasTime, setHasTime] = useState(true);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [teamSearch, setTeamSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [isDependenciesDropdownOpen, setIsDependenciesDropdownOpen] = useState(false);
  const [dependencySearch, setDependencySearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [newInstaLink, setNewInstaLink] = useState('');
  const [newInstaTag, setNewInstaTag] = useState('');
  const [newTag, setNewTag] = useState('');
  const [savedProject, setSavedProject] = useState<Project | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const scrollContainerRef = React.useRef<HTMLFormElement>(null);
  const clientSectionRef = React.useRef<HTMLDivElement>(null);
  const specialistSectionRef = React.useRef<HTMLDivElement>(null);
  const dependenciesSectionRef = React.useRef<HTMLDivElement>(null);

  const scrollSectionIntoView = (container: HTMLElement, element: HTMLElement) => {
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const scrollTop = container.scrollTop + elementRect.top - containerRect.top - 8;
    container.scrollTo({ top: scrollTop, behavior: 'smooth' });
  };

  useEffect(() => {
    if (isClientDropdownOpen && clientSectionRef.current && scrollContainerRef.current) {
      setTimeout(() => {
        if (scrollContainerRef.current && clientSectionRef.current)
          scrollSectionIntoView(scrollContainerRef.current, clientSectionRef.current);
      }, 50);
    }
  }, [isClientDropdownOpen]);

  useEffect(() => {
    if (isDropdownOpen && specialistSectionRef.current && scrollContainerRef.current) {
      setTimeout(() => {
        if (scrollContainerRef.current && specialistSectionRef.current)
          scrollSectionIntoView(scrollContainerRef.current, specialistSectionRef.current);
      }, 50);
    }
  }, [isDropdownOpen]);

  useEffect(() => {
    if (isDependenciesDropdownOpen && dependenciesSectionRef.current && scrollContainerRef.current) {
      setTimeout(() => {
        if (scrollContainerRef.current && dependenciesSectionRef.current)
          scrollSectionIntoView(scrollContainerRef.current, dependenciesSectionRef.current);
      }, 50);
    }
  }, [isDependenciesDropdownOpen]);

  const { getDistance } = useDistanceCalculator();
  const [debouncedLocation, setDebouncedLocation] = useState('');
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

  useEffect(() => {
    if (initialStatus) {
      setFormData(prev => ({ ...prev, status: initialStatus }));
    }
  }, [initialStatus]);

  const filteredTeam = useMemo(() => {
    let result = team.filter(m => m.name.toLowerCase().includes(teamSearch.toLowerCase()) || (m.location && m.location.toLowerCase().includes(teamSearch.toLowerCase())));

    const hasConflict = (member: TeamMember) =>
      projects.some(p => p.eventDate === formData.eventDate && p.teamMemberIds.includes(member.id) && p.location !== formData.location && p.status !== 'Completed' && p.status !== 'Expired');

    result.sort((a, b) => {
      const aSelected = selectedTeamIds.includes(a.id);
      const bSelected = selectedTeamIds.includes(b.id);
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
  }, [team, teamSearch, selectedTeamIds, distances, projects, formData.eventDate, formData.location]);

  const filteredClients = useMemo(() => {
    return clients
      .filter(c => c.company.toLowerCase().includes(clientSearch.toLowerCase()) || c.name.toLowerCase().includes(clientSearch.toLowerCase()))
      .sort((a, b) => a.company.localeCompare(b.company));
  }, [clients, clientSearch]);

  const filteredDependencies = useMemo(() => {
    return projects.filter(p => p.title.toLowerCase().includes(dependencySearch.toLowerCase()));
  }, [projects, dependencySearch]);

  const buildProject = (): Project => ({
    id: formData.id,
    title: formData.title,
    description: formData.description,
    notes: formData.notes,
    location: formData.location,
    priority: formData.priority,
    tags: formData.tags,
    teamMemberIds: selectedTeamIds,
    eventDate: formData.eventDate,
    eventTime: hasTime ? formData.eventTime : undefined,
    submissionDeadline: hasDeadline ? formData.submissionDeadline : undefined,
    dueDate: formData.eventDate,
    status: formData.status,
    progress: formData.status === 'Completed' ? 100 : 0,
    budget: formData.budget,
    expenses: formData.expenses,
    instaLinks: formData.instaLinks,
    clientId: formData.clientId || undefined,
    clientIds: formData.clientIds || [],
    dependencies: formData.dependencies,
  });

  const handleSaveAndAssign = (e: React.MouseEvent) => {
    e.preventDefault();
    const p = buildProject();
    onAddProject(p);
    setSavedProject(p);
    setShowAssignModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newProject = buildProject();
    onAddProject(newProject);
    onClose();
  };

  const toggleMember = (id: string) => {
    setSelectedTeamIds(prev => 
      prev.includes(id) ? prev.filter(mid => mid !== id) : [...prev, id]
    );
  };

  const toggleDependency = (id: string) => {
    setFormData(prev => ({
      ...prev,
      dependencies: prev.dependencies.includes(id) 
        ? prev.dependencies.filter(did => did !== id) 
        : [...prev.dependencies, id]
    }));
  };

  const addInstaLink = () => {
    if (!newInstaLink.trim()) return;
    const tag = newInstaTag.trim() || 'Deliverable';
    setFormData(prev => ({
      ...prev,
      instaLinks: [...prev.instaLinks, { url: newInstaLink.trim(), tag }]
    }));
    setNewInstaLink('');
    setNewInstaTag('');
  };

  const removeInstaLink = (index: number) => {
    setFormData(prev => ({
      ...prev,
      instaLinks: prev.instaLinks.filter((_, i) => i !== index)
    }));
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

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-start justify-center sm:items-center bg-black/60 backdrop-blur-md p-4 overflow-hidden"
    >
      <div 
        onClick={e => {
          e.stopPropagation();
          setIsDropdownOpen(false);
          setIsClientDropdownOpen(false);
          setIsDependenciesDropdownOpen(false);
        }}
        className="bg-white rounded-[48px] w-full max-w-2xl shadow-2xl animate-in slide-in-from-bottom-12 duration-500 border border-white/20 flex flex-col max-h-full sm:max-h-[90vh] my-auto"
      >
        <div className="px-10 pt-10 pb-2 border-b flex justify-between items-start bg-white/50 backdrop-blur-sm rounded-t-[48px] shrink-0 z-20">
          <div>
            <div className="flex items-center gap-2 leading-[0.9]">
              <span className="text-3xl font-black text-slate-800 tracking-tighter">Initialize</span>
              <span className="text-3xl font-black text-indigo-600 tracking-tighter">Production</span>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.3em] italic">Pipeline Phase: {formData.status}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 -mt-2 hover:bg-slate-100 rounded-[20px] text-slate-400 hover:text-slate-900 transition-all active:scale-90"><X size={32} /></button>
        </div>

        <form ref={scrollContainerRef} onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-1 md:col-span-2 space-y-1">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">Deliverable Title</label>
              <input 
                required 
                className="w-full border-2 border-slate-100 rounded-[24px] p-5 bg-slate-50 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 focus:outline-none transition-all font-black text-xl placeholder:text-slate-200" 
                placeholder="E.g. Sharma Wedding Reel"
                value={formData.title}
                onChange={e => setFormData({...formData, title: e.target.value})}
              />
            </div>

            <div ref={clientSectionRef} className="col-span-1 md:col-span-2 space-y-2">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2 flex items-center gap-2"><Briefcase size={14} /> Client Account</label>
              <div className="relative w-full z-[60]">
                <div 
                  className="w-full border-2 border-slate-100 rounded-[24px] p-5 bg-slate-50 cursor-pointer flex justify-between items-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsClientDropdownOpen(!isClientDropdownOpen);
                    setIsDropdownOpen(false);
                    setIsDependenciesDropdownOpen(false);
                  }}
                >
                  <div className="flex flex-wrap gap-2">
                    {(!formData.clientIds || formData.clientIds.length === 0) && !formData.clientId ? <span className="text-slate-300 italic font-bold">Select client...</span> :
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
                  <ChevronDown size={20} className="text-slate-300" />
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
                            onDoubleClick={() => {
                              const currentIds = formData.clientIds || (formData.clientId ? [formData.clientId] : []);
                              const newIds = currentIds.includes(client.id) ? currentIds : [...currentIds, client.id];
                              setFormData({...formData, clientIds: newIds, clientId: newIds[0] || ''});
                              setIsClientDropdownOpen(false);
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
                    <button type="button" onClick={() => setIsClientDropdownOpen(false)} className="w-full py-3 bg-slate-100 text-slate-500 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200">Done Selecting</button>
                  </div>
                )}
              </div>
            </div>

            <div className="col-span-1 md:col-span-2 space-y-2">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">LOCATION</label>
              <LocationAutocomplete
                value={formData.location}
                onChange={(value) => setFormData({...formData, location: value})}
                placeholder="Search and select location..."
              />
            </div>

            <div ref={specialistSectionRef} className="col-span-1 md:col-span-2 space-y-2">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">Specialist Deployment</label>
              <div className="relative w-full z-50">
                <div
                  className="w-full border-2 border-slate-100 rounded-[24px] p-5 bg-slate-50 cursor-pointer flex justify-between items-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDropdownOpen(!isDropdownOpen);
                    setIsClientDropdownOpen(false);
                    setIsDependenciesDropdownOpen(false);
                  }}
                >
                  <div className="flex flex-wrap gap-2">
                    {selectedTeamIds.length === 0 ? <span className="text-slate-300 italic font-bold">Unassigned</span> :
                      selectedTeamIds.map(id => {
                        const member = team.find(m => m.id === id);
                        return <span key={id} className={`${member?.color || 'bg-slate-900'} text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest`}>{member?.name}</span>
                      })
                    }
                  </div>
                  <ChevronDown size={20} className="text-slate-300" />
                </div>

                {isDropdownOpen && (
                  <div onClick={e => e.stopPropagation()} className="absolute top-full left-0 right-0 mt-4 bg-white border-2 border-slate-100 rounded-[30px] shadow-2xl p-6 space-y-4 animate-in slide-in-from-top-4 duration-300">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                      <input
                        className="w-full bg-slate-50 border-0 outline-none pl-12 pr-4 py-4 rounded-xl font-bold text-sm"
                        placeholder="Search team..."
                        value={teamSearch}
                        onChange={e => setTeamSearch(e.target.value)}
                      />
                    </div>
                    <div className="max-h-[200px] overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                      {filteredTeam.map(member => (
                        <div
                          key={member.id}
                          onClick={() => toggleMember(member.id)}
                          onDoubleClick={() => { if (!selectedTeamIds.includes(member.id)) toggleMember(member.id); setIsDropdownOpen(false); }}
                          className={`flex items-center justify-between p-3.5 rounded-xl cursor-pointer transition-all ${selectedTeamIds.includes(member.id) ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-50'}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white shrink-0 ${member.color || 'bg-slate-900'}`}>{(member.avatar || '').replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase()}</div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-black uppercase tracking-widest text-[11px] truncate">{member.name}</span>
                              {distances[member.id]?.isCalculating ? (
                                <span className="text-[9px] text-indigo-300 font-bold animate-pulse mt-0.5">Calculating ETA...</span>
                              ) : distances[member.id]?.text ? (
                                <span className={`text-[9px] font-bold mt-0.5 flex items-center gap-1 ${selectedTeamIds.includes(member.id) ? 'text-indigo-200' : 'text-emerald-600'}`}>
                                  <MapPin size={10} /> {distances[member.id].text} • {distances[member.id].duration}
                                </span>
                              ) : member.location ? (
                                <span className={`text-[9px] mt-0.5 truncate ${selectedTeamIds.includes(member.id) ? 'text-indigo-300' : 'text-slate-400'}`}>📍 {member.location}</span>
                              ) : (
                                <span className={`text-[8px] italic mt-0.5 ${selectedTeamIds.includes(member.id) ? 'text-indigo-400/70' : 'text-slate-300'}`}>No location set</span>
                              )}

                              {/* Conflict Warning */}
                              {projects.filter(p => p.eventDate === formData.eventDate && p.teamMemberIds.includes(member.id) && p.location !== formData.location && p.status !== 'Completed' && p.status !== 'Expired').length > 0 && (
                                <span className="text-[9px] text-rose-500 font-bold mt-0.5 animate-pulse flex items-center gap-1">
                                  ⚠️ Shoot conflict today!
                                </span>
                              )}
                            </div>
                          </div>
                          {selectedTeamIds.includes(member.id) && <Check size={18} className="shrink-0 ml-2" />}
                        </div>
                      ))}
                      {filteredTeam.length === 0 && <p className="text-center text-slate-300 text-xs py-4 font-bold">No members found</p>}
                    </div>
                    <button type="button" onClick={() => setIsDropdownOpen(false)} className="w-full py-3 bg-slate-100 text-slate-500 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200">Done Selecting</button>
                  </div>
                )}
              </div>
            </div>

            <div className="col-span-1 md:col-span-2 space-y-2">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">DESCRIPTION</label>
              <textarea 
                className="w-full border-2 border-slate-100 rounded-[24px] p-5 bg-slate-50 focus:ring-4 focus:ring-indigo-100 font-bold outline-none transition-all resize-none min-h-[100px]" 
                placeholder="Details about the unit..."
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
              />
            </div>

          <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2 flex items-center gap-2"><Camera size={14} /> Shoot Date</label>
              <input type="date" className="w-full border-2 border-slate-100 rounded-[24px] p-5 bg-slate-50 font-black text-indigo-600 outline-none" value={formData.eventDate} onChange={e => setFormData({...formData, eventDate: e.target.value})} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between ml-2 mb-2">
                <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-2"><Clock size={14} /> Time</label>
                <button 
                  type="button" 
                  onClick={() => {
                    setHasTime(!hasTime);
                    if (!hasTime && !formData.eventTime) {
                      setFormData({...formData, eventTime: '09:00'});
                    }
                  }}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${hasTime ? 'bg-indigo-500' : 'bg-slate-200'}`}
                >
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${hasTime ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              </div>
              {hasTime && (
                <div className="relative animate-in fade-in slide-in-from-top-2">
                  <select 
                    className="w-full border-2 border-slate-100 rounded-[24px] p-5 bg-slate-50 font-black text-indigo-600 outline-none appearance-none" 
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
                  <ChevronDown size={16} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between ml-2 mb-2">
                <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-2"><Target size={14} /> Deadline</label>
                <button 
                  type="button" 
                  onClick={() => {
                    if (!hasDeadline && !formData.submissionDeadline) {
                      setFormData(prev => ({ ...prev, submissionDeadline: prev.eventDate }));
                    }
                    setHasDeadline(!hasDeadline);
                  }}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${hasDeadline ? 'bg-rose-500' : 'bg-slate-200'}`}
                >
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${hasDeadline ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              </div>
              {hasDeadline && (
                <input type="date" className="w-full border-2 border-slate-100 rounded-[24px] p-5 bg-slate-50 font-black text-rose-500 outline-none animate-in fade-in slide-in-from-top-2" value={formData.submissionDeadline} onChange={e => setFormData({...formData, submissionDeadline: e.target.value})} />
              )}
            </div>
          </div>

          <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">Budget (₹)</label>
              <div className="relative">
                <IndianRupee size={16} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" />
                <input 
                  type="number" 
                  step="500"
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full border-2 border-slate-100 rounded-[24px] pl-14 pr-4 py-5 bg-slate-50 font-black outline-none" 
                  value={formData.budget === 0 ? '' : formData.budget} 
                  onChange={e => setFormData({...formData, budget: Number(e.target.value)})} 
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">Expenses (₹)</label>
              <div className="relative">
                <IndianRupee size={16} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" />
                <input 
                  type="number" 
                  step="500"
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full border-2 border-slate-100 rounded-[24px] pl-14 pr-4 py-5 bg-slate-50 font-black outline-none" 
                  value={formData.expenses === 0 ? '' : formData.expenses} 
                  onChange={e => setFormData({...formData, expenses: Number(e.target.value)})} 
                  placeholder="0"
                />
              </div>
              {selectedTeamIds.length > 0 && selectedTeamIds.reduce((sum, id) => sum + (distances[id]?.value || 0), 0) > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const totalMeters = selectedTeamIds.reduce((sum, id) => sum + (distances[id]?.value || 0), 0);
                    const cost = Math.round((totalMeters / 1000) * MILEAGE_RATE_PER_KM);
                    setFormData({...formData, expenses: (formData.expenses || 0) + cost});
                  }}
                  className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 ml-2 uppercase tracking-wider flex items-center gap-1 mt-1 transition-colors"
                >
                  <MapPin size={10} /> + Add ₹{Math.round((selectedTeamIds.reduce((sum, id) => sum + (distances[id]?.value || 0), 0) / 1000) * MILEAGE_RATE_PER_KM)} Travel Cost
                </button>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">Phase Routing</label>
              <select className="w-full border-2 border-slate-100 rounded-[24px] p-5 bg-slate-50 font-black text-slate-700 outline-none appearance-none" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as ProjectStatus})}>
                <option value="Expired">⌛ Expired</option>
                <option value="Quote Sent">💬 Quote Sent</option>
                <option value="To Do">📅 To Do</option>
                <option value="In Progress">🎥 In Production</option>
                <option value="Completed">✅ Completed</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">Priority</label>
              <select className="w-full border-2 border-slate-100 rounded-[24px] p-5 bg-slate-50 font-black text-slate-700 outline-none appearance-none" value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value as Priority})}>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            <div ref={dependenciesSectionRef} className="col-span-1 md:col-span-2 space-y-2">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2 flex items-center gap-2"><LinkIcon size={14} /> Dependencies (Must be completed first)</label>
              <div className="relative w-full z-40">
                <div 
                  className="w-full border-2 border-slate-100 rounded-[24px] p-5 bg-slate-50 cursor-pointer flex justify-between items-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDependenciesDropdownOpen(!isDependenciesDropdownOpen);
                    setIsDropdownOpen(false);
                    setIsClientDropdownOpen(false);
                  }}
                >
                  <div className="flex flex-wrap gap-2">
                    {formData.dependencies.length === 0 ? <span className="text-slate-300 italic font-bold">No dependencies</span> : 
                      formData.dependencies.map(id => {
                        const proj = projects.find(p => p.id === id);
                        return <span key={id} className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">{proj?.title || id}</span>
                      })
                    }
                  </div>
                  <ChevronDown size={20} className="text-slate-300" />
                </div>
                
                {isDependenciesDropdownOpen && (
                  <div onClick={e => e.stopPropagation()} className="absolute top-full left-0 right-0 mt-4 bg-white border-2 border-slate-100 rounded-[30px] shadow-2xl p-6 space-y-4 animate-in slide-in-from-top-4 duration-300">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                      <input 
                        className="w-full bg-slate-50 border-0 outline-none pl-12 pr-4 py-4 rounded-xl font-bold text-sm" 
                        placeholder="Search projects..." 
                        value={dependencySearch} 
                        onChange={e => setDependencySearch(e.target.value)}
                      />
                    </div>
                    <div className="max-h-[200px] overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                      {filteredDependencies.map(proj => {
                        const depClient = clients.find(c => c.id === proj.clientId) || (proj.clientIds?.length ? clients.find(c => proj.clientIds!.includes(c.id)) : null);
                        const isDepSelected = formData.dependencies.includes(proj.id);
                        return (
                          <div key={proj.id} onClick={() => toggleDependency(proj.id)} onDoubleClick={() => { if (!isDepSelected) toggleDependency(proj.id); setIsDependenciesDropdownOpen(false); }} className={`flex items-center justify-between p-3.5 rounded-xl cursor-pointer transition-all ${isDepSelected ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-50'}`}>
                            <div className="flex flex-col">
                              <span className="font-black uppercase tracking-widest text-[10px]">{proj.title}</span>
                              {depClient && <span className={`text-[8px] font-bold uppercase tracking-widest ${isDepSelected ? 'text-indigo-300' : 'text-slate-400'}`}>{depClient.name || depClient.company}</span>}
                            </div>
                            {isDepSelected && <Check size={16} />}
                          </div>
                        );
                      })}
                      {filteredDependencies.length === 0 && <p className="text-center text-slate-300 text-xs py-4 font-bold">No projects found</p>}
                    </div>
                    <button type="button" onClick={() => setIsDependenciesDropdownOpen(false)} className="w-full py-3 bg-slate-100 text-slate-500 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200">Done Selecting</button>
                  </div>
                )}
              </div>
            </div>

            <div className="col-span-1 md:col-span-2 space-y-2">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">Delivery Assets (Instagram)</label>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1 sm:flex-[2]">
                    <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input 
                      className="w-full border-2 border-slate-100 rounded-[24px] pl-12 pr-4 py-4 bg-slate-50 font-bold focus:border-indigo-500 outline-none text-sm" 
                      placeholder="https://instagram.com/p/..."
                      value={newInstaLink}
                      onChange={e => setNewInstaLink(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-4">
                    <div className="relative flex-1">
                      <Tag className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                      <input 
                        className="w-full border-2 border-slate-100 rounded-[24px] pl-10 pr-4 py-4 bg-slate-50 font-bold focus:border-indigo-500 outline-none uppercase text-[10px] tracking-widest" 
                        placeholder="Label"
                        value={newInstaTag}
                        onChange={e => setNewInstaTag(e.target.value)}
                        onKeyDown={e => { if(e.key === 'Enter') { e.preventDefault(); addInstaLink(); } }}
                      />
                    </div>
                    <button 
                      type="button"
                      onClick={addInstaLink}
                      className="bg-indigo-600 text-white px-6 sm:px-8 py-4 sm:py-0 rounded-[24px] font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shrink-0"
                    >
                      Add Link
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 mt-4">
                {(formData.instaLinks || []).map((link, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center gap-3 bg-indigo-50/80 border border-indigo-100/50 px-4 py-2.5 rounded-xl group/link transition-all hover:bg-indigo-100 cursor-pointer shadow-sm active:scale-95"
                    onClick={() => window.open(link.url, '_blank')}
                  >
                    <Instagram size={14} className="text-indigo-600" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-700 leading-none">{link.tag}</span>
                    <button 
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeInstaLink(idx); }}
                      className="text-indigo-300 hover:text-rose-500 transition-colors p-1"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="col-span-1 md:col-span-2 space-y-2">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">Project Tags</label>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                <input 
                  className="flex-1 border-2 border-slate-100 rounded-[20px] px-5 py-4 bg-slate-50 font-bold outline-none text-sm" 
                  placeholder="Add custom tag..."
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                />
                <button 
                  type="button" 
                  onClick={addTag} 
                  className="bg-indigo-600 text-white px-6 py-4 rounded-[20px] font-black text-[10px] uppercase tracking-widest active:scale-95 shadow-lg shrink-0"
                >
                  Add Tag
                </button>
              </div>
              <div className="flex flex-wrap gap-2 min-h-[40px]">
                {(formData.tags || []).map(tag => (
                  <span key={tag} className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase text-indigo-700">
                    #{tag}
                    <button type="button" onClick={() => removeTag(tag)} className="text-rose-400 hover:text-rose-600"><X size={12} /></button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-slate-50">
            <button type="submit" className="w-full sm:flex-1 bg-slate-900 text-white py-5 rounded-[24px] font-black text-[11px] uppercase tracking-widest shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2">
              <Check size={16} /> Create Unit
            </button>
            <button type="button" onClick={handleSaveAndAssign} className="w-full sm:flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-5 rounded-[24px] font-black text-[11px] uppercase tracking-widest shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2">
              <Zap size={16} /> Save & Assign Team
            </button>
            <button type="button" onClick={onClose} className="w-full sm:flex-1 py-5 rounded-[24px] border-2 border-slate-100 font-black text-[11px] uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all">Cancel</button>
          </div>
        </form>
      </div>
      {showAssignModal && savedProject && (
        <AssignTeamModal project={savedProject} team={team} onClose={() => { setShowAssignModal(false); onClose(); }} />
      )}
    </div>
  );
};

export default NewProjectModal;
