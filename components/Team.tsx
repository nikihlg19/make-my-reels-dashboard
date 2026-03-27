
import React, { useState, useMemo, useRef } from 'react';
import { TeamMember, Project } from '../types';
import { Plus, X, Search, Check, ChevronDown, Users, Copy, Trash2, ExternalLink, Upload } from 'lucide-react';

import { LocationAutocomplete } from './LocationAutocomplete';
import ConfirmDialog from './ConfirmDialog';
import { supabase } from '../src/lib/supabase';
import { compressImage, sanitizeName, getDateStamp } from '../src/utils/imageCompression';
import { TeamAvailabilityCalendar } from './TeamAvailabilityCalendar';

// Re-export extracted components so existing imports (e.g. App.tsx) keep working
import TeamMemberCardComponent from './TeamMemberCard';
export { default as TeamMemberCard } from './TeamMemberCard';
import EditMemberModal from './EditMemberModal';
import MemberTagsModal from './MemberTagsModal';

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
  teamRoles?: string[];
  isAdmin?: boolean;
  globalSearchQuery?: string;
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
  globalSearchQuery = '',
  teamRoles = ROLES,
  isAdmin = false
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
  const [newAadhaarUrl, setNewAadhaarUrl] = useState('');
  const [isNewAadhaarUploading, setIsNewAadhaarUploading] = useState(false);
  const [newAadhaarViewer, setNewAadhaarViewer] = useState(false);
  const [showNewAadhaarDeleteConfirm, setShowNewAadhaarDeleteConfirm] = useState(false);
  const newAadhaarInputRef = useRef<HTMLInputElement>(null);

  const handleNewAadhaarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-selected
    e.target.value = '';
    if (!file.type.startsWith('image/')) { alert('Please upload an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('File must be under 5MB'); return; }
    if (!supabase) { alert('Storage not available'); return; }

    setIsNewAadhaarUploading(true);
    try {
      // Archive previous file before replacing
      if (newAadhaarUrl) {
        await archiveAadhaarImage(newAadhaarUrl);
      }

      const compressed = await compressImage(file);
      const safeName = sanitizeName(newMember.name || newMember.phone);
      const path = `aadhaar/${safeName}_aadhaar_${getDateStamp()}.jpg`;

      const { error } = await supabase.storage.from('documents').upload(path, compressed, { upsert: true });
      if (error) throw error;

      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
      setNewAadhaarUrl(`${urlData.publicUrl}?t=${Date.now()}`);
    } catch (err: any) {
      alert('Upload failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsNewAadhaarUploading(false);
    }
  };

  // Archive an aadhaar image before deleting (moves to archive/ folder, auto-erased every 30 days)
  const archiveAadhaarImage = async (imageUrl: string) => {
    if (!supabase || !imageUrl) return;
    try {
      // Extract file path from public URL (e.g. .../documents/aadhaar/filename.jpg -> aadhaar/filename.jpg)
      const urlObj = new URL(imageUrl);
      const pathParts = urlObj.pathname.split('/documents/');
      if (pathParts.length < 2) return;
      const originalPath = pathParts[1];
      const archivePath = `archive/${originalPath}`;

      // Copy to archive folder
      const { error: copyError } = await supabase.storage.from('documents').copy(originalPath, archivePath);
      if (copyError) console.warn('Archive copy failed:', copyError.message);

      // Remove original
      const { error: removeError } = await supabase.storage.from('documents').remove([originalPath]);
      if (removeError) console.warn('Remove original failed:', removeError.message);
    } catch (err) {
      console.warn('Archive failed:', err);
    }
  };

  const handleNewAadhaarDelete = async () => {
    await archiveAadhaarImage(newAadhaarUrl);
    setNewAadhaarUrl('');
    setShowNewAadhaarDeleteConfirm(false);
  };

  const copyAadhaarToClipboard = async (url: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      alert('Image copied to clipboard!');
    } catch {
      await navigator.clipboard.writeText(url);
      alert('Image URL copied to clipboard!');
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
      .replace(/[^a-zA-Z\s]/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
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
      aadhaar_image_url: newAadhaarUrl || undefined,
    };
    onAddMember(member);
    setIsModalOpen(false);
    setNewMember({ name: '', phone: '', location: '', onboardingNotes: '' });
    setSelectedRoles([]);
    setCustomRole('');
    setMemberTags([]);
    setNewAadhaarUrl('');
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
          <TeamMemberCardComponent
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
            isAdmin={isAdmin}
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

      {/* Availability Calendar — Phase 2 */}
      {team.filter(m => !m.isDeleted).length > 0 && (
        <div className="mt-8">
          <TeamAvailabilityCalendar team={team.filter(m => !m.isDeleted)} />
        </div>
      )}

      {deleteTargetId && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setDeleteTargetId(null)} />
          <div onClick={e => e.stopPropagation()} className="relative bg-white rounded-[28px] w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center bg-rose-50">
                <Trash2 size={28} className="text-rose-500" />
              </div>
              <h3 className="text-lg font-black text-slate-800 tracking-tight uppercase mb-2">Delete Team Member</h3>
              <p className="text-sm text-slate-500 font-medium">
                {isAdmin
                  ? "Are you sure you want to delete this team member?"
                  : "Are you sure you want to delete this team member and send for approval to Admin?"}
              </p>
            </div>
            <div className="flex border-t border-slate-100">
              <button onClick={() => setDeleteTargetId(null)} className="flex-1 py-4 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all flex items-center justify-center gap-2">
                <X size={16} /> Cancel
              </button>
              <button onClick={() => { onDeleteMember(deleteTargetId); setDeleteTargetId(null); }} className="flex-1 py-4 text-[11px] font-black uppercase tracking-widest text-white bg-rose-500 hover:bg-rose-600 transition-all flex items-center justify-center gap-2">
                <Trash2 size={16} /> Delete
              </button>
            </div>
          </div>
        </div>
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


              {isAdmin && <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] ml-2">Aadhaar Card (Optional)</label>
                <input type="file" ref={newAadhaarInputRef} accept="image/*" className="hidden" onChange={handleNewAadhaarUpload} />
                {newAadhaarUrl ? (
                  <div className="relative group">
                    <img
                      src={newAadhaarUrl}
                      alt="Aadhaar"
                      className="w-full h-40 object-cover rounded-2xl border-2 border-slate-100 cursor-pointer"
                      onClick={() => setNewAadhaarViewer(true)}
                    />
                    <div className="absolute top-2 right-2 flex gap-1.5">
                      <button type="button" onClick={() => copyAadhaarToClipboard(newAadhaarUrl)} className="p-2 bg-white/90 rounded-xl shadow hover:bg-indigo-50 transition-all" title="Copy to clipboard"><Copy size={14} className="text-indigo-600" /></button>
                      <button type="button" onClick={() => setNewAadhaarViewer(true)} className="p-2 bg-white/90 rounded-xl shadow hover:bg-indigo-50 transition-all" title="View full image"><ExternalLink size={14} className="text-indigo-600" /></button>
                      <button type="button" onClick={() => newAadhaarInputRef.current?.click()} className="p-2 bg-white/90 rounded-xl shadow hover:bg-white transition-all" title="Replace image"><Upload size={14} className="text-slate-600" /></button>
                      <button type="button" onClick={() => setShowNewAadhaarDeleteConfirm(true)} className="p-2 bg-white/90 rounded-xl shadow hover:bg-red-50 transition-all" title="Remove image"><X size={14} className="text-red-500" /></button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => newAadhaarInputRef.current?.click()}
                    disabled={isNewAadhaarUploading}
                    className="w-full border-2 border-dashed border-slate-200 rounded-2xl p-6 flex flex-col items-center gap-2 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all"
                  >
                    {isNewAadhaarUploading ? (
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Uploading...</span>
                    ) : (
                      <>
                        <Upload size={20} className="text-slate-300" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Upload Aadhaar Image</span>
                        <span className="text-[9px] text-slate-300 font-bold">JPG, PNG up to 5MB</span>
                      </>
                    )}
                  </button>
                )}
              </div>}

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

          {showNewAadhaarDeleteConfirm && (
            <ConfirmDialog
              title="Delete Aadhaar Image"
              message="This image will be archived and automatically erased after 30 days. Are you sure?"
              confirmLabel="Yes, Delete"
              variant="danger"
              onConfirm={handleNewAadhaarDelete}
              onCancel={() => setShowNewAadhaarDeleteConfirm(false)}
            />
          )}

          {newAadhaarViewer && newAadhaarUrl && (
            <div
              className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
              onClick={() => setNewAadhaarViewer(false)}
            >
              <div className="relative max-w-3xl max-h-[90vh] w-full" onClick={e => e.stopPropagation()}>
                <div className="absolute -top-3 right-0 z-10 flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await fetch(newAadhaarUrl);
                        const blob = await res.blob();
                        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                        alert('Image copied to clipboard!');
                      } catch {
                        await navigator.clipboard.writeText(newAadhaarUrl);
                        alert('Image URL copied to clipboard!');
                      }
                    }}
                    className="w-10 h-10 bg-white rounded-full shadow-xl flex items-center justify-center hover:bg-indigo-50 transition-all"
                    title="Copy image to clipboard"
                  >
                    <Copy size={18} className="text-indigo-600" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewAadhaarViewer(false)}
                    className="w-10 h-10 bg-white rounded-full shadow-xl flex items-center justify-center hover:bg-slate-100 transition-all"
                  >
                    <X size={20} className="text-slate-700" />
                  </button>
                </div>
                <img
                  src={newAadhaarUrl}
                  alt="Aadhaar Card"
                  className="w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
                />
              </div>
            </div>
          )}
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
          isAdmin={isAdmin}
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

export default Team;
