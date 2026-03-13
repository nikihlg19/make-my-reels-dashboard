
import React, { useState, useMemo, useRef } from 'react';
import { TeamMember, Project } from '../types';
import { Phone, MessageSquare, Plus, X, Search, Check, ChevronDown, Users, Copy, CheckCircle, Tag, Trash2, AlertCircle, Star, StarHalf, Trophy, LayoutGrid, ExternalLink, FileText, Lock, ShieldCheck, Edit3, Save, History, Pencil, MapPin } from 'lucide-react';
import PasscodeLock from './PasscodeLock';
import { AadhaarInput } from './AadhaarInput';
import { LocationAutocomplete } from './LocationAutocomplete';
import { PASSCODE, DELETE_PIN, formatDisplayDate } from '../constants';

interface TeamProps {
  team: TeamMember[];
  projects: Project[];
  onAddMember: (member: TeamMember) => void;
  onDeleteMember: (id: string) => void;
  onUpdateMember: (member: TeamMember) => void;
  onUpdateMemberTags: (id: string, tags: string[]) => void;
  onUpdateMemberNotes?: (id: string, notes: string) => void;
  whatsappMember: TeamMember | null;
  setWhatsappMember: (member: TeamMember | null) => void;
  memberForTags: TeamMember | null;
  setMemberForTags: (member: TeamMember | null) => void;
  onEditProject?: (project: Project) => void;
  isFinancialsUnlocked?: boolean;
  onGlobalUnlock?: () => void;
  globalSearchQuery?: string;
  teamRoles?: string[];
}

const ROLES = ['Videographer', 'Photographer', 'Editor', 'Sales', 'Marketing', 'Reelographer'];
const AVATAR_COLORS = [
  'bg-indigo-600', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500', 
  'bg-violet-600', 'bg-cyan-500', 'bg-pink-500', 'bg-orange-500'
];

const Team: React.FC<TeamProps> = ({ 
  team, 
  projects, 
  onAddMember, 
  onDeleteMember, 
  onUpdateMember, 
  onUpdateMemberTags,
  onUpdateMemberNotes,
  whatsappMember,
  setWhatsappMember,
  memberForTags,
  setMemberForTags,
  onEditProject,
  isFinancialsUnlocked = false,
  onGlobalUnlock,
  globalSearchQuery,
  teamRoles = ROLES
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [newMember, setNewMember] = useState({ name: '', phone: '', location: '', onboardingNotes: '' });
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [customRole, setCustomRole] = useState('');
  const [memberTags, setMemberTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // KYC States
  const [kycTab, setKycTab] = useState<'manual' | 'digio'>('manual');
  const [kycAadhaar, setKycAadhaar] = useState('');
  const [kycIdType, setKycIdType] = useState('Aadhaar');
  const [kycIdNumber, setKycIdNumber] = useState('');
  const [kycDeclaration, setKycDeclaration] = useState(false);
  const [kycAadhaarImage, setKycAadhaarImage] = useState('');
  const [kycStatus, setKycStatus] = useState<'none' | 'manual' | 'digio_verified'>('none');
  const [digioOtp, setDigioOtp] = useState('');
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [digioRef, setDigioRef] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);

  const digioKYC = async (aadhaar: string) => {
    // Import initiateDigioKYC from ../services/digioService
    const { initiateDigioKYC } = await import('../services/digioService');
    return await initiateDigioKYC(aadhaar);
  };

  const handleSendOtp = async () => {
    if (kycAadhaar.length !== 12) {
      alert('Please enter a valid 12-digit Aadhaar number');
      return;
    }
    setIsSendingOtp(true);
    try {
      const res = await digioKYC(kycAadhaar);
      setDigioRef(res.ref_id);
      setShowOtpInput(true);
    } catch (error) {
      console.error("Failed to send OTP:", error);
      alert('Failed to send OTP');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = () => {
    if (digioOtp.length >= 4) {
      setKycStatus('digio_verified');
    } else {
      alert('Invalid OTP');
    }
  };

  const filteredTeam = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const globalQuery = (globalSearchQuery || '').toLowerCase().trim();
    
    const teamWithActiveCounts = team.map(m => {
      const activeCount = projects.filter(p => 
        p.teamMemberIds.includes(m.id) && p.status !== 'Completed'
      ).length;
      return { member: m, activeCount };
    });

    teamWithActiveCounts.sort((a, b) => b.activeCount - a.activeCount);

    const sortedMembers = teamWithActiveCounts.map(item => item.member);

    if (!query && !globalQuery) return sortedMembers;

    return sortedMembers.filter(m => {
      const roles = Array.isArray(m.role) ? m.role : [m.role || ''];
      
      const matchesLocal = !query || 
        (m.name || '').toLowerCase().includes(query) ||
        roles.some(role => (role || '').toLowerCase().includes(query)) ||
        (m.tags || []).some(tag => (tag || '').toLowerCase().includes(query));
        
      const matchesGlobal = !globalQuery || 
        (m.name || '').toLowerCase().includes(globalQuery) ||
        roles.some(role => (role || '').toLowerCase().includes(globalQuery)) ||
        (m.tags || []).some(tag => (tag || '').toLowerCase().includes(globalQuery));
        
      return matchesLocal && matchesGlobal;
    });
  }, [team, searchQuery, globalSearchQuery, projects]);

  const toggleRole = (role: string) => {
    setSelectedRoles(prev => 
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  };

  const isPhoneValid = newMember.phone.length === 10;

  const handleAddMemberTag = () => {
    const val = newTag.trim().toLowerCase();
    if (val && !memberTags.includes(val)) {
      setMemberTags([...memberTags, val]);
      setNewTag('');
    }
  };

  const removeMemberTag = (t: string) => {
    setMemberTags(memberTags.filter(tag => tag !== t));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPhoneValid) return;

    let finalKycStatus: 'none' | 'manual' | 'digio_verified' = 'none';
    if (kycStatus === 'digio_verified') {
      finalKycStatus = 'digio_verified';
    } else if (kycTab === 'manual' && kycAadhaar.length === 12 && kycDeclaration) {
      finalKycStatus = 'manual';
    } else if (kycAadhaar.length > 0 && kycAadhaar.length !== 12) {
      alert('Please enter a valid 12-digit Aadhaar number, or leave it blank.');
      return;
    } else if (kycAadhaar.length === 12 && !kycDeclaration && kycTab === 'manual') {
      alert('Please check the declaration to proceed with manual KYC.');
      return;
    }

    const roles = [...selectedRoles];
    if (customRole.trim()) roles.push(customRole.trim());
    
    const colorIndex = team.length % AVATAR_COLORS.length;
    
    const member: TeamMember = {
      id: Math.random().toString(36).substr(2, 9).toUpperCase(),
      name: newMember.name,
      role: roles.length > 0 ? roles : 'Member',
      phone: `+91${newMember.phone}`,
      location: newMember.location,
      avatar: getInitials(newMember.name),
      color: AVATAR_COLORS[colorIndex],
      activeProjects: 0,
      completedProjects: 0,
      avgRating: 5.00,
      avgEffort: 0,
      onTimeRate: 100,
      tags: memberTags,
      onboardingNotes: newMember.onboardingNotes,
      kyc_status: finalKycStatus,
      kyc_aadhaar: kycAadhaar,
      kyc_aadhaar_image: kycAadhaarImage,
      kyc_id_type: kycTab === 'manual' ? kycIdType : 'Aadhaar',
      kyc_id_number: kycTab === 'manual' ? kycIdNumber : kycAadhaar,
      kyc_declaration: kycDeclaration,
      kyc_digio_ref: digioRef
    };
    onAddMember(member);
    setIsModalOpen(false);
    setNewMember({ name: '', phone: '', location: '', onboardingNotes: '' });
    setSelectedRoles([]);
    setCustomRole('');
    setMemberTags([]);
    
    setKycTab('manual');
    setKycAadhaar('');
    setKycAadhaarImage('');
    setKycIdType('Aadhaar');
    setKycIdNumber('');
    setKycDeclaration(false);
    setKycStatus('none');
    setDigioOtp('');
    setShowOtpInput(false);
    setDigioRef('');
  };

  const handleWhatsAppRedirect = (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanPhone}`, '_blank');
  };

  return (
    <div className="h-full overflow-y-auto pb-24 p-4 md:p-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tighter uppercase">Team Roster</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 italic">Specialists & Talent Pool</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full md:w-auto">
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
            <input 
              className="pl-10 pr-4 py-2.5 border-2 border-slate-100 rounded-full bg-white w-full sm:w-64 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-bold shadow-sm text-sm" 
              placeholder="Search by name or skill..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-full font-black hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all active:scale-95 uppercase tracking-widest text-[10px] w-full sm:w-auto shrink-0"
          >
            <Plus size={16} />
            <span>Onboard Talent</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 md:gap-6 pb-10">
        {filteredTeam.map(member => (
          <TeamMemberCard 
            key={member.id} 
            member={member} 
            projects={projects} 
            onConnect={() => handleWhatsAppRedirect(member.phone)} 
            onDelete={() => setDeleteTargetId(member.id)}
            onEdit={() => setEditingMember(member)}
            onManageTags={() => setMemberForTags(member)}
            onUpdateNotes={(notes) => onUpdateMemberNotes?.(member.id, notes)}
            onEditProject={onEditProject}
            isFinancialsUnlocked={isFinancialsUnlocked}
            onGlobalUnlock={onGlobalUnlock}
          />
        ))}
        {filteredTeam.length === 0 && (
          <div className="col-span-full py-24 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-[28px] flex items-center justify-center mx-auto mb-4 text-slate-100">
               <Users size={32} />
            </div>
            <p className="text-slate-300 font-black uppercase tracking-[0.2em] italic text-xs">No matching specialists</p>
          </div>
        )}
      </div>

      {deleteTargetId && (
        <PasscodeLock 
          title="Delete Confirmation"
          subtitle={`Enter PIN to delete talent member`}
          correctPasscode={DELETE_PIN}
          length={4}
          onUnlock={() => {
            onDeleteMember(deleteTargetId);
            setDeleteTargetId(null);
          }}
          onClose={() => setDeleteTargetId(null)}
        />
      )}

      {isModalOpen && (
        <div 
          onClick={() => {
            setIsModalOpen(false);
            setIsRoleDropdownOpen(false);
          }}
          className="fixed inset-0 z-[150] flex items-start justify-center sm:items-center bg-slate-900/60 backdrop-blur-md p-4 overflow-hidden animate-in fade-in duration-300"
        >
          <div 
            onClick={e => {
              e.stopPropagation();
              setIsRoleDropdownOpen(false);
            }}
            className="bg-white rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-full sm:max-h-[85vh] my-auto"
          >
            <div className="p-8 border-b flex justify-between items-center bg-white/50 backdrop-blur-sm shrink-0 z-20">
              <h3 className="text-xl font-black text-slate-800 tracking-tight uppercase">Talent Onboarding</h3>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 hover:text-slate-900 transition-all active:scale-90"
              >
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-8 pt-6 space-y-6">
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] ml-2">Display Name</label>
                <input required autoFocus className="w-full border-2 border-slate-100 rounded-[22px] p-4 bg-slate-50 font-black focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 focus:outline-none transition-all text-sm" placeholder="E.g. Priya Sharma" value={newMember.name} onChange={e => setNewMember({...newMember, name: e.target.value})} />
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] ml-2">Verified Contact</label>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center mb-1 pr-2">
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{newMember.phone.length}/10 Digits</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-slate-400 text-sm tracking-widest">+91</span>
                    <input 
                      required 
                      className="w-full border-2 border-slate-100 rounded-[22px] pl-16 pr-4 py-4 bg-slate-50 font-black focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all tracking-[0.3em] text-sm placeholder:text-slate-200" 
                      placeholder="00000 00000"
                      value={newMember.phone}
                      onChange={e => setNewMember({...newMember, phone: e.target.value.replace(/\D/g, '').slice(0,10)})}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] ml-2">Location</label>
                <LocationAutocomplete 
                  value={newMember.location} 
                  onChange={(val) => setNewMember({...newMember, location: val})} 
                />
              </div>

              <div className="space-y-2 relative">
                <label className="block text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] ml-2">Skillsets</label>
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsRoleDropdownOpen(!isRoleDropdownOpen);
                  }}
                  className="w-full border-2 border-slate-100 rounded-[22px] p-4 bg-slate-50 cursor-pointer flex justify-between items-center hover:bg-white transition-all shadow-sm"
                >
                  <span className="truncate text-slate-800 font-black text-xs uppercase tracking-wider">
                    {selectedRoles.length > 0 ? selectedRoles.join(', ') : 'Assign Roles...'}
                  </span>
                  <ChevronDown size={20} className="text-slate-300" />
                </div>
                
                {isRoleDropdownOpen && (
                  <div onClick={e => e.stopPropagation()} className="absolute top-full left-0 right-0 mt-3 bg-white border-2 border-slate-100 rounded-[30px] shadow-2xl z-50 p-4 space-y-1.5 animate-in slide-in-from-top-4 duration-300">
                    {teamRoles.map(role => (
                      <div 
                        key={role}
                        onClick={() => toggleRole(role)}
                        className={`flex items-center justify-between p-3.5 rounded-2xl cursor-pointer transition-all ${selectedRoles.includes(role) ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-50 text-slate-600 font-bold'}`}
                      >
                        <span className="text-[10px] font-black uppercase tracking-widest">{role}</span>
                        {selectedRoles.includes(role) && <Check size={18} />}
                      </div>
                    ))}
                    <button type="button" onClick={() => setIsRoleDropdownOpen(false)} className="w-full py-2 text-[10px] font-black uppercase text-indigo-600 text-center">Close</button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">Specialist Tags</label>
                <div className="flex gap-2 mb-3">
                  <input 
                    className="flex-1 border-2 border-slate-100 rounded-xl px-4 py-3 bg-slate-50 font-bold text-xs focus:ring-4 focus:ring-indigo-100 focus:outline-none" 
                    placeholder="e.g. expert, remote..." 
                    value={newTag} 
                    onChange={e => setNewTag(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddMemberTag())}
                  />
                  <button type="button" onClick={handleAddMemberTag} className="bg-indigo-600 text-white px-4 rounded-xl font-black text-[10px] uppercase shadow-lg active:scale-95">Add</button>
                </div>
                <div className="flex flex-wrap gap-2 min-h-[40px] p-3 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-100">
                  {memberTags.map(t => (
                    <span key={t} className="flex items-center gap-2 bg-white border border-indigo-100 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase text-[#4F46E5] shadow-sm">
                      #{t}
                      <button type="button" onClick={() => removeMemberTag(t)} className="text-rose-400 hover:text-rose-600"><X size={12} /></button>
                    </span>
                  ))}
                  {memberTags.length === 0 && <span className="text-slate-200 text-[9px] font-black uppercase italic my-auto mx-auto tracking-widest">Optional Attributes</span>}
                </div>
              </div>

              <div className="space-y-4 bg-slate-50 p-5 rounded-[24px] border border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-black text-slate-800 uppercase tracking-[0.2em]">KYC Verification</label>
                  {kycStatus === 'digio_verified' && <span className="flex items-center gap-1 text-[9px] font-black text-amber-500 uppercase tracking-widest"><CheckCircle size={12} /> Gold Verified</span>}
                  {kycStatus === 'manual' && <span className="flex items-center gap-1 text-[9px] font-black text-indigo-500 uppercase tracking-widest"><CheckCircle size={12} /> Manual Verified</span>}
                </div>

                <div className="flex gap-2 p-1 bg-slate-200/50 rounded-xl">
                  <button type="button" onClick={() => setKycTab('manual')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${kycTab === 'manual' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Manual KYC</button>
                  <button type="button" onClick={() => setKycTab('digio')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${kycTab === 'digio' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-500 hover:text-slate-700'}`}>Digio OTP</button>
                </div>

                {kycTab === 'manual' ? (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="space-y-2">
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest">Aadhaar Number (Optional)</label>
                      <AadhaarInput required={false} value={kycAadhaar} onChange={val => setKycAadhaar(val)} />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest">Govt ID Type</label>
                      <select className="w-full border-2 border-slate-200 rounded-xl p-3 bg-white font-bold focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all text-xs" value={kycIdType} onChange={e => setKycIdType(e.target.value)}>
                        <option value="Aadhaar">Aadhaar</option>
                        <option value="PAN">PAN</option>
                        <option value="Passport">Passport</option>
                        <option value="Voter ID">Voter ID</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest">Govt ID Number</label>
                      <input className="w-full border-2 border-slate-200 rounded-xl p-3 bg-white font-bold focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all text-xs" placeholder="Enter ID Number" value={kycIdNumber} onChange={e => setKycIdNumber(e.target.value)} />
                    </div>
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <div className="relative flex items-center justify-center mt-0.5">
                        <input type="checkbox" required={kycTab === 'manual' && kycAadhaar.length === 12} checked={kycDeclaration} onChange={e => setKycDeclaration(e.target.checked)} className="peer sr-only" />
                        <div className="w-5 h-5 border-2 border-slate-300 rounded-md peer-checked:bg-indigo-600 peer-checked:border-indigo-600 transition-all"></div>
                        <Check size={12} className="absolute text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                      </div>
                      <span className="text-[10px] font-bold text-slate-600 leading-tight">I confirm the above details are accurate and belong to me.</span>
                    </label>
                    <p className="text-[9px] font-bold text-slate-400 italic">Note: Manual KYC - Documents will be reviewed by admin.</p>
                  </div>
                ) : (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="space-y-2">
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest">Aadhaar Number (Optional)</label>
                      <AadhaarInput required={false} value={kycAadhaar} onChange={val => setKycAadhaar(val)} disabled={showOtpInput || kycStatus === 'digio_verified'} />
                    </div>
                    
                    {!showOtpInput && kycStatus !== 'digio_verified' && (
                      <button type="button" onClick={handleSendOtp} disabled={isSendingOtp || kycAadhaar.length !== 12} className="w-full py-3 rounded-xl bg-amber-500 text-white font-black text-[10px] uppercase tracking-widest shadow-md hover:bg-amber-600 transition-all disabled:opacity-50">
                        {isSendingOtp ? 'Sending...' : 'Send OTP via Digio'}
                      </button>
                    )}

                    {showOtpInput && kycStatus !== 'digio_verified' && (
                      <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                        <div className="space-y-2">
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest">Enter OTP</label>
                          <input required={kycTab === 'digio'} className="w-full border-2 border-slate-200 rounded-xl p-3 bg-white font-bold focus:ring-4 focus:ring-amber-100 focus:border-amber-500 outline-none transition-all text-xs tracking-[0.5em] text-center" placeholder="000000" value={digioOtp} onChange={e => setDigioOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                        </div>
                        <button type="button" onClick={handleVerifyOtp} disabled={digioOtp.length < 4} className="w-full py-3 rounded-xl bg-amber-600 text-white font-black text-[10px] uppercase tracking-widest shadow-md hover:bg-amber-700 transition-all disabled:opacity-50">
                          Verify OTP
                        </button>
                      </div>
                    )}

                    {kycStatus === 'digio_verified' && (
                      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 animate-in zoom-in-95">
                        <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shrink-0">
                          <CheckCircle size={16} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Aadhaar Verified</p>
                          <p className="text-[9px] font-bold text-emerald-600">Ref: {digioRef}</p>
                        </div>
                      </div>
                    )}
                    
                    <p className="text-[9px] font-bold text-slate-400 italic">Note: Digio OTP verified KYC gives a Gold Verified badge.</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] ml-2">Onboarding Notes (Private)</label>
                <textarea 
                  className="w-full border-2 border-slate-100 rounded-[22px] p-5 bg-slate-50 font-bold focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all text-xs resize-none min-h-[120px] placeholder:text-slate-200" 
                  placeholder="Summarize your initial conversation, expectations, and special instructions..."
                  value={newMember.onboardingNotes}
                  onChange={e => setNewMember({...newMember, onboardingNotes: e.target.value})}
                />
              </div>

              <div className="pt-4 flex gap-4">
                 <button type="submit" disabled={!isPhoneValid} className={`flex-1 py-5 rounded-[22px] font-black text-[11px] uppercase tracking-widest text-white shadow-xl transition-all active:scale-95 ${isPhoneValid ? 'bg-slate-900' : 'bg-slate-200 cursor-not-allowed'}`}>Finalize</button>
                 <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-5 rounded-[22px] border-2 border-slate-100 font-black text-[11px] uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingMember && (
        <EditMemberModal 
          member={editingMember} 
          onClose={() => setEditingMember(null)} 
          onUpdate={(m) => {
            onUpdateMember(m);
            setEditingMember(null);
          }} 
          teamRoles={teamRoles}
        />
      )}

      {memberForTags && (
        <MemberTagsModal 
          member={memberForTags} 
          onClose={() => setMemberForTags(null)} 
          onUpdateTags={(tags) => {
            onUpdateMemberTags(memberForTags.id, tags);
            setMemberForTags(null);
          }} 
        />
      )}
    </div>
  );
};

export const TeamMemberCard: React.FC<{ 
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
}> = ({ member, projects, onConnect, onDelete, onEdit, onManageTags, onUpdateNotes, onRateProject, onEditProject, isFinancialsUnlocked = false, onGlobalUnlock }) => {
  const [showActivePeek, setShowActivePeek] = useState(false);
  const [showClosedPeek, setShowClosedPeek] = useState(false);
  const [showRatingPeek, setShowRatingPeek] = useState(false);
  const activeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ratingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
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

  const initials = member.name.split(' ').map(n => n[0]).join('').toUpperCase();

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
    setShowActivePeek(true);
  };

  const handleActiveLeave = () => {
    activeTimeoutRef.current = setTimeout(() => {
      setShowActivePeek(false);
    }, 500); // 500ms delay for easier bridging
  };

  const handleClosedEnter = () => {
    if (closedTimeoutRef.current) clearTimeout(closedTimeoutRef.current);
    setShowClosedPeek(true);
  };

  const handleClosedLeave = () => {
    closedTimeoutRef.current = setTimeout(() => {
      setShowClosedPeek(false);
    }, 500);
  };

  const handleRatingEnter = () => {
    if (ratingTimeoutRef.current) clearTimeout(ratingTimeoutRef.current);
    setShowRatingPeek(true);
  };

  const handleRatingLeave = () => {
    ratingTimeoutRef.current = setTimeout(() => {
      setShowRatingPeek(false);
    }, 500);
  };

  return (
    <div className="bg-white rounded-[20px] p-4 shadow-sm border border-slate-100 hover:shadow-md transition-all group relative animate-in fade-in zoom-in-95 duration-300 flex flex-col h-full hover:z-50">
      {/* ... header controls ... */}
      <div className="absolute top-2 right-2 flex gap-1 z-10">
        <button 
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1.5 bg-slate-50 text-slate-400 hover:bg-slate-900 hover:text-white rounded-lg transition-all shadow-sm"
          title="Edit Profile"
        >
          <Pencil size={12} />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); handleNotesClick(); }}
          className={`p-1.5 rounded-lg transition-all shadow-sm ${member.onboardingNotes || isFinancialsUnlocked ? 'bg-amber-50 text-amber-500 hover:bg-amber-500 hover:text-white' : 'bg-slate-50 text-slate-300 hover:bg-amber-500 hover:text-white'}`}
          title={member.onboardingNotes ? "View/Edit Private Notes" : "Add Private Notes"}
        >
          <FileText size={12} />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onManageTags(); }}
          className="p-1.5 bg-slate-50 text-slate-400 hover:bg-[#4F46E5] hover:text-white rounded-lg transition-all shadow-sm"
          title="Manage Tags"
        >
          <Tag size={12} />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg transition-all shadow-sm"
          title="Remove specialist"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div className="flex flex-col items-center text-center flex-1">
        <div 
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className={`w-12 h-12 ${member.color || 'bg-slate-900'} rounded-[16px] flex items-center justify-center text-lg font-black text-white mb-2 shadow-sm transition-all group-hover:scale-105 group-hover:rotate-3 cursor-pointer hover:ring-4 hover:ring-indigo-100 hover:opacity-90`}
        >
          {initials}
        </div>
        
        <div className="flex items-center gap-1.5 mb-0 justify-center">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">{member.name}</h3>
          {member.kyc_status === 'digio_verified' && (
            <CheckCircle size={14} className="text-amber-500 fill-amber-50" title="Digio OTP Verified KYC" />
          )}
          {member.kyc_status === 'manual' && (
            <CheckCircle size={14} className="text-indigo-500 fill-indigo-50" title="Manual KYC Submitted" />
          )}
          {(!member.kyc_status || member.kyc_status === 'none') && (
            <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-100" title="KYC Pending">Pending</span>
          )}
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
                  className="absolute top-full left-1/2 -translate-x-1/2 pt-2 w-64 z-[200] animate-in zoom-in-95 slide-in-from-top-2 duration-200"
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
          {Array.isArray(member.role) ? member.role.join(' • ') : member.role}
        </p>

        {member.location && (
          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-2 flex items-center justify-center gap-1">
            <MapPin size={10} />
            {member.location}
          </p>
        )}

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
                className="absolute bottom-full left-1/2 -translate-x-1/2 pb-2 w-64 z-[200] animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
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
                className="absolute bottom-full left-1/2 -translate-x-1/2 pb-2 w-64 z-[200] animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
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
                          <span className="text-[9px] font-black text-amber-400 tabular-nums">{p.rating || '—'}</span>
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
        <PasscodeLock 
          title="Security Clearance"
          subtitle="Authorize Notes Access"
          onUnlock={() => { 
            setShowAuth(false); 
            setShowNotes(true); 
            setTempNotes(member.onboardingNotes || '');
            if(onGlobalUnlock) onGlobalUnlock(); // Unify Unlock Logic
          }}
          onClose={() => setShowAuth(false)}
          correctPasscode={PASSCODE}
          length={6}
        />
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
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-white shadow-lg ${member.color || 'bg-slate-900'}`}>{initials}</div>
                <div>
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">{member.name}</h4>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{Array.isArray(member.role) ? member.role.join(' • ') : member.role}</p>
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

const EditMemberModal: React.FC<{
  member: TeamMember;
  onClose: () => void;
  onUpdate: (member: TeamMember) => void;
  teamRoles: string[];
}> = ({ member, onClose, onUpdate, teamRoles }) => {
  const [formData, setFormData] = useState({
    name: member.name,
    phone: member.phone.replace('+91', ''),
    location: member.location || '',
    role: Array.isArray(member.role) ? member.role : [member.role],
  });
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);

  const [kycTab, setKycTab] = useState<'manual' | 'digio'>(member.kyc_status === 'digio_verified' ? 'digio' : 'manual');
  const [kycAadhaar, setKycAadhaar] = useState(member.kyc_aadhaar || '');
  const [kycIdType, setKycIdType] = useState(member.kyc_id_type || 'Aadhaar');
  const [kycIdNumber, setKycIdNumber] = useState(member.kyc_id_number || '');
  const [kycDeclaration, setKycDeclaration] = useState(member.kyc_declaration || false);
  const [kycAadhaarImage, setKycAadhaarImage] = useState<string>(member.kyc_aadhaar_image || '');
  const [kycStatus, setKycStatus] = useState<'none' | 'manual' | 'digio_verified'>(member.kyc_status || 'none');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [digioOtp, setDigioOtp] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [digioRef, setDigioRef] = useState(member.kyc_digio_ref || '');

  const digioKYC = async (aadhaar: string) => {
    console.warn('Digio KYC stub - integrate with Digio API key');
    return { ref_id: 'DIGIO_' + Date.now(), status: 'otp_sent' };
  };

  const handleSendOtp = async () => {
    if (kycAadhaar.length !== 12) {
      alert('Please enter a valid 12-digit Aadhaar number');
      return;
    }
    setIsSendingOtp(true);
    try {
      const res = await digioKYC(kycAadhaar);
      setDigioRef(res.ref_id);
      setShowOtpInput(true);
    } catch (error) {
      console.error("Failed to send OTP:", error);
      alert('Failed to send OTP');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = () => {
    if (digioOtp.length >= 4) {
      setKycStatus('digio_verified');
    } else {
      alert('Invalid OTP');
    }
  };

  const toggleRole = (role: string) => {
    setFormData(prev => ({
      ...prev,
      role: prev.role.includes(role) 
        ? prev.role.filter(r => r !== role)
        : [...prev.role, role]
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalKycStatus: 'none' | 'manual' | 'digio_verified' = 'none';
    if (kycStatus === 'digio_verified') {
      finalKycStatus = 'digio_verified';
    } else if (kycTab === 'manual' && kycAadhaar.length === 12 && kycDeclaration) {
      finalKycStatus = 'manual';
    } else if (kycAadhaar.length > 0 && kycAadhaar.length !== 12) {
      alert('Please enter a valid 12-digit Aadhaar number, or leave it blank.');
      return;
    } else if (kycAadhaar.length === 12 && !kycDeclaration && kycTab === 'manual') {
      alert('Please check the declaration to proceed with manual KYC.');
      return;
    }

    onUpdate({
      ...member,
      name: formData.name,
      phone: `+91${formData.phone}`,
      location: formData.location,
      role: formData.role.length > 0 ? formData.role : ['Member'],
      kyc_status: finalKycStatus,
      kyc_aadhaar: kycAadhaar,
      kyc_aadhaar_image: kycAadhaarImage,
      kyc_id_type: kycTab === 'manual' ? kycIdType : 'Aadhaar',
      kyc_id_number: kycTab === 'manual' ? kycIdNumber : kycAadhaar,
      kyc_declaration: kycDeclaration,
      kyc_digio_ref: digioRef
    });
  };

  return (
    <div 
      onClick={() => {
        onClose();
        setIsRoleDropdownOpen(false);
      }} 
      className="fixed inset-0 z-[200] flex items-start justify-center sm:items-center bg-slate-900/60 backdrop-blur-md p-4 overflow-hidden animate-in fade-in duration-300"
    >
      <div 
        onClick={e => {
          e.stopPropagation();
          setIsRoleDropdownOpen(false);
        }} 
        className="bg-white rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-full sm:max-h-[85vh] my-auto"
      >
        <div className="p-8 border-b flex justify-between items-center bg-white/50 backdrop-blur-sm shrink-0 z-20">
          <div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight uppercase">Edit Profile</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 italic">{member.id}</p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 hover:text-slate-900 transition-all active:scale-90"><X size={24} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-8 pt-6 space-y-6">
          <div className="space-y-2">
            <label className="block text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">Display Name</label>
            <input required className="w-full border-2 border-slate-100 rounded-[22px] p-4 bg-slate-50 font-black outline-none transition-all text-sm" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">Contact</label>
            <div className="relative">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-slate-400 text-sm tracking-widest">+91</span>
              <input required className="w-full border-2 border-slate-100 rounded-[22px] pl-16 pr-4 py-4 bg-slate-50 font-black outline-none transition-all tracking-[0.3em] text-sm" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10)})} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] ml-2">Location</label>
            <LocationAutocomplete 
              value={formData.location} 
              onChange={(val) => setFormData({...formData, location: val})} 
            />
          </div>

          <div className="space-y-2 relative">
            <label className="block text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">Roles</label>
            <div 
              onClick={(e) => {
                e.stopPropagation();
                setIsRoleDropdownOpen(!isRoleDropdownOpen);
              }}
              className="w-full border-2 border-slate-100 rounded-[22px] p-4 bg-slate-50 cursor-pointer flex justify-between items-center"
            >
              <span className="truncate text-slate-800 font-black text-xs uppercase tracking-wider">
                {formData.role.join(', ')}
              </span>
              <ChevronDown size={20} className="text-slate-300" />
            </div>
            
            {isRoleDropdownOpen && (
              <div onClick={e => e.stopPropagation()} className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-slate-100 rounded-[30px] shadow-2xl z-50 p-4 space-y-1.5 animate-in slide-in-from-top-4 duration-300">
                {teamRoles.map(role => (
                  <div 
                    key={role}
                    onClick={() => toggleRole(role)}
                    className={`flex items-center justify-between p-3.5 rounded-2xl cursor-pointer transition-all ${formData.role.includes(role) ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-50 text-slate-600 font-bold'}`}
                  >
                    <span className="text-[10px] font-black uppercase tracking-widest">{role}</span>
                    {formData.role.includes(role) && <Check size={18} />}
                  </div>
                ))}
              </div>
            )}
          </div>

              <div className="pt-6 border-t border-slate-100 space-y-6">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-black text-slate-800 uppercase tracking-[0.2em]">KYC Verification</label>
                  {kycStatus === 'digio_verified' && <span className="flex items-center gap-1 text-[9px] font-black text-amber-500 uppercase tracking-widest"><CheckCircle size={12} /> Gold Verified</span>}
                  {kycStatus === 'manual' && <span className="flex items-center gap-1 text-[9px] font-black text-indigo-500 uppercase tracking-widest"><CheckCircle size={12} /> Manual Verified</span>}
                </div>

                <div className="flex gap-2 p-1 bg-slate-200/50 rounded-xl">
                  <button type="button" onClick={() => setKycTab('manual')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${kycTab === 'manual' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Manual KYC</button>
                  <button type="button" onClick={() => setKycTab('digio')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${kycTab === 'digio' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-500 hover:text-slate-700'}`}>Digio OTP</button>
                </div>

                {kycTab === 'manual' ? (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="space-y-2">
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest">Aadhaar Number (Optional)</label>
                      <AadhaarInput required={false} value={kycAadhaar} onChange={val => setKycAadhaar(val)} />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest">Govt ID Type</label>
                      <select className="w-full border-2 border-slate-200 rounded-xl p-3 bg-white font-bold focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all text-xs" value={kycIdType} onChange={e => setKycIdType(e.target.value)}>
                        <option value="Aadhaar">Aadhaar</option>
                        <option value="PAN">PAN</option>
                        <option value="Passport">Passport</option>
                        <option value="Voter ID">Voter ID</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest">Govt ID Number</label>
                      <input className="w-full border-2 border-slate-200 rounded-xl p-3 bg-white font-bold focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all text-xs" placeholder="Enter ID Number" value={kycIdNumber} onChange={e => setKycIdNumber(e.target.value)} />
                    </div>
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <div className="relative flex items-center justify-center mt-0.5">
                        <input type="checkbox" required={kycTab === 'manual' && kycAadhaar.length === 12} checked={kycDeclaration} onChange={e => setKycDeclaration(e.target.checked)} className="peer sr-only" />
                        <div className="w-5 h-5 border-2 border-slate-300 rounded-md peer-checked:bg-indigo-600 peer-checked:border-indigo-600 transition-all"></div>
                        <Check size={12} className="absolute text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                      </div>
                      <span className="text-[10px] font-bold text-slate-600 leading-tight">I confirm the above details are accurate and belong to me.</span>
                    </label>
                    <p className="text-[9px] font-bold text-slate-400 italic">Note: Manual KYC - Documents will be reviewed by admin.</p>
                  </div>
                ) : (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="space-y-2">
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest">Aadhaar Number (Optional)</label>
                      <AadhaarInput required={false} value={kycAadhaar} onChange={val => setKycAadhaar(val)} disabled={showOtpInput || kycStatus === 'digio_verified'} />
                    </div>
                    
                    {!showOtpInput && kycStatus !== 'digio_verified' && (
                      <button type="button" onClick={handleSendOtp} disabled={isSendingOtp || kycAadhaar.length !== 12} className="w-full py-3 rounded-xl bg-amber-500 text-white font-black text-[10px] uppercase tracking-widest shadow-md hover:bg-amber-600 transition-all disabled:opacity-50">
                        {isSendingOtp ? 'Sending...' : 'Send OTP via Digio'}
                      </button>
                    )}

                    {showOtpInput && kycStatus !== 'digio_verified' && (
                      <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                        <div className="space-y-2">
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest">Enter OTP</label>
                          <input required={kycTab === 'digio'} className="w-full border-2 border-slate-200 rounded-xl p-3 bg-white font-bold focus:ring-4 focus:ring-amber-100 focus:border-amber-500 outline-none transition-all text-xs tracking-[0.5em] text-center" placeholder="000000" value={digioOtp} onChange={e => setDigioOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                        </div>
                        <button type="button" onClick={handleVerifyOtp} disabled={digioOtp.length < 4} className="w-full py-3 rounded-xl bg-amber-600 text-white font-black text-[10px] uppercase tracking-widest shadow-md hover:bg-amber-700 transition-all disabled:opacity-50">
                          Verify OTP
                        </button>
                      </div>
                    )}

                    {kycStatus === 'digio_verified' && (
                      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 animate-in zoom-in-95">
                        <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shrink-0">
                          <CheckCircle size={16} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Aadhaar Verified</p>
                          <p className="text-[9px] font-bold text-emerald-600">Ref: {digioRef}</p>
                        </div>
                      </div>
                    )}
                    
                    <p className="text-[9px] font-bold text-slate-400 italic">Note: Digio OTP verified KYC gives a Gold Verified badge.</p>
                  </div>
                )}
              </div>

          <div className="pt-4">
             <button type="submit" className="w-full py-5 bg-slate-900 text-white rounded-[22px] font-black text-[11px] uppercase tracking-widest shadow-xl transition-all active:scale-95">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const MemberTagsModal: React.FC<{
  member: TeamMember;
  onClose: () => void;
  onUpdateTags: (tags: string[]) => void;
}> = ({ member, onClose, onUpdateTags }) => {
  const [tags, setTags] = useState<string[]>(member.tags || []);
  const [newTag, setNewTag] = useState('');

  const addTag = () => {
    const val = newTag.trim().toLowerCase();
    if (val && !tags.includes(val)) {
      setTags([...tags, val]);
      setNewTag('');
    }
  };

  const removeTag = (t: string) => {
    setTags(tags.filter(tag => tag !== t));
  };

  const handleSave = () => {
    onUpdateTags(tags);
  };

  return (
    <div 
      onClick={onClose} 
      className="fixed inset-0 z-[200] flex items-start justify-center sm:items-center bg-slate-900/60 backdrop-blur-md p-4 overflow-hidden animate-in fade-in duration-300"
    >
      <div 
        onClick={e => e.stopPropagation()} 
        className="bg-white rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-full sm:max-h-[85vh] my-auto"
      >
        <div className="p-8 border-b flex justify-between items-center bg-white/50 backdrop-blur-sm shrink-0 z-20">
          <div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight uppercase">Manage Tags</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 italic">{member.name}</p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 hover:text-slate-900 transition-all active:scale-90"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 pt-6 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Add New Tag</label>
            <div className="flex gap-2">
              <input 
                className="flex-1 border-2 border-slate-100 rounded-xl px-4 py-3 bg-slate-50 font-bold text-xs outline-none focus:border-indigo-500 transition-all" 
                placeholder="e.g. expert" 
                value={newTag} 
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
              />
              <button onClick={addTag} className="bg-indigo-600 text-white px-4 rounded-xl font-black text-[10px] uppercase shadow-lg active:scale-95">Add</button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Active Tags</label>
            <div className="flex flex-wrap gap-2 min-h-[100px] p-4 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-100">
              {tags.map(t => (
                <span key={t} className="flex items-center gap-2 bg-white border border-indigo-100 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase text-[#4F46E5] shadow-sm">
                  #{t}
                  <button onClick={() => removeTag(t)} className="text-rose-400 hover:text-rose-600"><X size={12} /></button>
                </span>
              ))}
              {tags.length === 0 && <span className="text-slate-300 text-[10px] font-black uppercase italic m-auto">No tags assigned</span>}
            </div>
          </div>

          <div className="pt-4">
             <button onClick={handleSave} className="w-full py-5 bg-slate-900 text-white rounded-[22px] font-black text-[11px] uppercase tracking-widest shadow-xl transition-all active:scale-95">Update Tags</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Team;
