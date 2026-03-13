
import React, { useState } from 'react';
import { X, User, Briefcase, Phone, Mail, FileText, Check } from 'lucide-react';
import { Client } from '../types';

interface NewClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddClient: (client: Client) => void;
}

const AVATAR_COLORS = [
  'bg-indigo-600', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500', 
  'bg-violet-600', 'bg-cyan-500', 'bg-pink-500', 'bg-orange-500'
];

const NewClientModal: React.FC<NewClientModalProps> = ({ isOpen, onClose, onAddClient }) => {
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    notes: ''
  });

  if (!isOpen) return null;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const colorIndex = Math.floor(Math.random() * AVATAR_COLORS.length);
    
    const newClient: Client = {
      id: Math.random().toString(36).substr(2, 9),
      name: formData.name,
      company: formData.company,
      email: formData.email.trim() || undefined,
      phone: formData.phone.startsWith('+91') ? formData.phone : `+91${formData.phone}`,
      notes: formData.notes,
      avatar: getInitials(formData.name || formData.company),
      color: AVATAR_COLORS[colorIndex],
      createdAt: new Date().toISOString()
    };

    onAddClient(newClient);
    onClose();
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
            <h3 className="text-xl font-black text-slate-800 tracking-tight uppercase">Client Onboarding</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Add new production partner</p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 hover:text-slate-900 transition-all active:scale-90"><X size={24} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-8 pt-6 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Client Full Name</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
              <input 
                required 
                autoFocus
                className="w-full pl-12 pr-4 py-4 border-2 border-slate-100 rounded-2xl bg-slate-50 font-black text-sm outline-none focus:border-indigo-500 transition-all" 
                placeholder="E.g. Akash Mehta"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Company / Brand</label>
            <div className="relative">
              <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
              <input 
                className="w-full pl-12 pr-4 py-4 border-2 border-slate-100 rounded-2xl bg-slate-50 font-black text-sm outline-none focus:border-indigo-500 transition-all" 
                placeholder="E.g. Mehta Jewels"
                value={formData.company}
                onChange={e => setFormData({...formData, company: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Phone</label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                <input 
                  required 
                  className="w-full pl-10 pr-4 py-3 border-2 border-slate-100 rounded-xl bg-slate-50 font-bold text-xs outline-none focus:border-indigo-500 transition-all" 
                  placeholder="9876543210"
                  value={formData.phone}
                  onChange={e => setFormData({...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Email (Optional)</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                <input 
                  type="email"
                  className="w-full pl-10 pr-4 py-3 border-2 border-slate-100 rounded-xl bg-slate-50 font-bold text-xs outline-none focus:border-indigo-500 transition-all" 
                  placeholder="hello@brand.com"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Onboarding Notes</label>
            <div className="relative">
              <FileText className="absolute left-4 top-6 text-slate-300" size={16} />
              <textarea 
                className="w-full pl-12 pr-4 py-4 border-2 border-slate-100 rounded-2xl bg-slate-50 font-bold text-xs outline-none focus:border-indigo-500 transition-all min-h-[100px] resize-none" 
                placeholder="Budget constraints, style preferences..."
                value={formData.notes}
                onChange={e => setFormData({...formData, notes: e.target.value})}
              />
            </div>
          </div>

          <div className="pt-4 flex gap-4">
            <button 
              type="submit" 
              className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Check size={16} /> Confirm
            </button>
            <button 
              type="button" 
              onClick={onClose} 
              className="flex-1 py-4 border-2 border-slate-100 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewClientModal;
