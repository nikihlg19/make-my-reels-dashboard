import React, { useState, useRef } from 'react';
import { useAuth, useSession } from '@clerk/react';
import { TeamMember } from '../types';
import { X, Check, ChevronDown, Copy, ExternalLink, Upload, Image } from 'lucide-react';
import { LocationAutocomplete } from './LocationAutocomplete';
import ConfirmDialog from './ConfirmDialog';
import { supabase, createClerkSupabaseClient } from '../src/lib/supabase';
import { compressImage } from '../src/utils/imageCompression';

export interface EditMemberModalProps {
  member: TeamMember;
  onClose: () => void;
  onUpdate: (member: TeamMember) => void;
  teamRoles: string[];
  isAdmin?: boolean;
}

const EditMemberModal: React.FC<EditMemberModalProps> = ({ member, onClose, onUpdate, teamRoles, isAdmin = false }) => {
  const { getToken } = useAuth();
  const { session } = useSession();
  const authedSupabase = createClerkSupabaseClient(session);
  const [formData, setFormData] = useState({
    name: member.name,
    phone: member.phone.replace('+91', ''),
    location: member.location || '',
    role: Array.isArray(member.role) ? member.role : [member.role],
  });
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [aadhaarUrl, setAadhaarUrl] = useState(member.aadhaar_image_url || '');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [aadhaarViewer, setAadhaarViewer] = useState(false);
  const [showAadhaarDeleteConfirm, setShowAadhaarDeleteConfirm] = useState(false);
  const aadhaarInputRef = useRef<HTMLInputElement>(null);

  // Call server-side endpoint for archive + DB update (uses service role)
  const callAadhaarApi = async (body: Record<string, any>) => {
    const token = await getToken();
    const res = await fetch('/api/team/aadhaar-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Server error');
    }
    return res.json();
  };

  // Client-side fallback: move old file to archive/ using download → re-upload → delete
  const archiveOldFile = async (oldUrl: string) => {
    if (!oldUrl) return;
    try {
      const urlObj = new URL(oldUrl);
      const parts = urlObj.pathname.split('/documents/');
      if (parts.length < 2) return;
      const originalPath = parts[1].split('?')[0];
      const archivePath = `archive/${originalPath}`;

      // Download the original file
      const { data: fileData, error: downloadErr } = await authedSupabase.storage
        .from('documents')
        .download(originalPath);
      if (downloadErr || !fileData) {
        console.warn('[aadhaar] download for archive failed:', downloadErr?.message);
        return;
      }

      // Upload to archive/
      const { error: uploadErr } = await authedSupabase.storage
        .from('documents')
        .upload(archivePath, fileData, { upsert: true });
      if (uploadErr) {
        console.warn('[aadhaar] archive upload failed:', uploadErr.message);
        return;
      }

      // Delete original
      await authedSupabase.storage.from('documents').remove([originalPath]);
    } catch (err) {
      console.warn('[aadhaar] client-side archive failed:', err);
    }
  };

  const handleAadhaarDelete = async () => {
    setAadhaarUrl('');
    setShowAadhaarDeleteConfirm(false);
    // Archive old file then delete — try server API first, fall back to client-side
    callAadhaarApi({ memberId: member.id, action: 'delete', oldUrl: aadhaarUrl })
      .catch(() => archiveOldFile(aadhaarUrl));
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

  const handleAadhaarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (JPG, PNG, etc.)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be under 5MB');
      return;
    }

    setIsUploading(true);
    try {
      const compressed = await compressImage(file);
      const firstName = member.name.trim().split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      const now = new Date();
      const dateTime = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
      const storagePath = `aadhaar/${member.id}_${firstName}_${dateTime}.jpg`;
      const { error: uploadError } = await authedSupabase.storage
        .from('documents')
        .upload(storagePath, compressed);
      if (uploadError) throw uploadError;

      const { data: urlData } = authedSupabase.storage.from('documents').getPublicUrl(storagePath);
      const newUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      setAadhaarUrl(newUrl);
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);

      // Archive old file — try server API first (production), fall back to client-side (local dev)
      if (aadhaarUrl) {
        callAadhaarApi({ memberId: member.id, action: 'archive', oldUrl: aadhaarUrl, newUrl })
          .catch(() => archiveOldFile(aadhaarUrl));
      }
    } catch (err: any) {
      alert('Upload failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsUploading(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const updatedMember = {
      ...member,
      name: formData.name,
      phone: `+91${formData.phone}`,
      location: formData.location,
      role: formData.role.length > 0 ? formData.role : ['Member'],
      aadhaar_image_url: aadhaarUrl || undefined,
    };

    // onUpdate triggers useSupabaseMutations which writes to DB server-side
    onUpdate(updatedMember);
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



          {uploadSuccess && (
            <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-2xl animate-in slide-in-from-top-2 duration-300">
              <Check size={16} className="text-emerald-600 shrink-0" />
              <span className="text-xs font-black text-emerald-700 uppercase tracking-widest">Aadhaar uploaded successfully</span>
            </div>
          )}

          {isAdmin && <div className="space-y-2">
            <label className="block text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">Aadhaar Card (JPG/PNG)</label>
            <input
              ref={aadhaarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAadhaarUpload}
              className="hidden"
            />
            {aadhaarUrl ? (
              <div className="relative rounded-2xl overflow-hidden border-2 border-slate-100">
                <img
                  src={aadhaarUrl}
                  alt="Aadhaar"
                  className="w-full h-40 object-cover cursor-pointer"
                  onClick={() => setAadhaarViewer(true)}
                />
                <div className="absolute top-2 right-2 flex gap-1.5">
                  <button type="button" onClick={() => copyAadhaarToClipboard(aadhaarUrl)} className="p-2 bg-white/90 rounded-xl shadow hover:bg-indigo-50 transition-all" title="Copy to clipboard"><Copy size={14} className="text-indigo-600" /></button>
                  <button type="button" onClick={() => setAadhaarViewer(true)} className="p-2 bg-white/90 rounded-xl shadow hover:bg-indigo-50 transition-all" title="View full image"><ExternalLink size={14} className="text-indigo-600" /></button>
                  <button type="button" onClick={() => aadhaarInputRef.current?.click()} className="p-2 bg-white/90 rounded-xl shadow hover:bg-white transition-all" title="Replace image"><Upload size={14} className="text-slate-600" /></button>
                  <button type="button" onClick={() => setShowAadhaarDeleteConfirm(true)} className="p-2 bg-white/90 rounded-xl shadow hover:bg-red-50 transition-all" title="Remove image"><X size={14} className="text-red-500" /></button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => aadhaarInputRef.current?.click()}
                disabled={isUploading}
                className="w-full border-2 border-dashed border-slate-200 rounded-[22px] p-6 flex flex-col items-center gap-2 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all"
              >
                {isUploading ? (
                  <span className="text-xs font-bold text-indigo-500 animate-pulse">Uploading...</span>
                ) : (
                  <>
                    <Image size={24} className="text-slate-300" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Upload Aadhaar Image</span>
                  </>
                )}
              </button>
            )}
          </div>}

          <div className="pt-4">
             <button type="submit" className="w-full py-5 bg-slate-900 text-white rounded-[22px] font-black text-[11px] uppercase tracking-widest shadow-xl transition-all active:scale-95">Save Changes</button>
          </div>
        </form>
      </div>

      {aadhaarViewer && aadhaarUrl && (
        <div
          className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setAadhaarViewer(false)}
        >
          <div className="relative max-w-3xl max-h-[90vh] w-full" onClick={e => e.stopPropagation()}>
            <div className="absolute -top-3 right-0 z-10 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch(aadhaarUrl);
                    const blob = await res.blob();
                    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                    alert('Image copied to clipboard!');
                  } catch {
                    // Fallback: copy URL
                    await navigator.clipboard.writeText(aadhaarUrl);
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
                onClick={() => setAadhaarViewer(false)}
                className="w-10 h-10 bg-white rounded-full shadow-xl flex items-center justify-center hover:bg-slate-100 transition-all"
              >
                <X size={20} className="text-slate-700" />
              </button>
            </div>
            <img
              src={aadhaarUrl}
              alt="Aadhaar Card"
              className="w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
            />
          </div>
        </div>
      )}

      {showAadhaarDeleteConfirm && (
        <ConfirmDialog
          title="Delete Aadhaar Image"
          message="This image will be archived and automatically erased after 30 days. Are you sure?"
          confirmLabel="Yes, Delete"
          variant="danger"
          onConfirm={handleAadhaarDelete}
          onCancel={() => setShowAadhaarDeleteConfirm(false)}
        />
      )}
    </div>
  );
};

export default EditMemberModal;
