import React, { useState } from 'react';
import { TeamMember } from '../types';
import { X } from 'lucide-react';

export interface MemberTagsModalProps {
  member: TeamMember;
  onClose: () => void;
  onUpdateTags: (tags: string[]) => void;
}

const MemberTagsModal: React.FC<MemberTagsModalProps> = ({ member, onClose, onUpdateTags }) => {
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

export default MemberTagsModal;
