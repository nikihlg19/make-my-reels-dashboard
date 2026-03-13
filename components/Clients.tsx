
import React, { useState, useMemo } from 'react';
import { Client, Project, TeamMember } from '../types';
import { Search, Plus, Briefcase, Mail, Phone, Trash2, ExternalLink, User, Calendar, Pencil, X, Check, FileText, Copy, MessageSquare } from 'lucide-react';
import PasscodeLock from './PasscodeLock';
import { DELETE_PIN } from '../constants';
import { ProjectCard } from './Board';

interface ClientsProps {
  clients: Client[];
  projects: Project[];
  team: TeamMember[];
  onAddClient: () => void;
  onUpdateClient: (client: Client) => void;
  onDeleteClient: (id: string) => void;
  onEditProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  onPreviewMember: (member: TeamMember) => void;
  editingClient?: Client | null;
  setEditingClient?: (client: Client | null) => void;
  isFinancialsUnlocked: boolean;
  globalSearchQuery?: string;
}

export const ClientCard: React.FC<{
  client: Client;
  projects: Project[];
  onEdit: () => void;
  onDelete: () => void;
  onHistory: () => void;
  onWhatsApp: () => void;
}> = ({ client, projects, onEdit, onDelete, onHistory, onWhatsApp }) => {
  const clientProjects = projects.filter(p => (p.clientIds || (p.clientId ? [p.clientId] : [])).includes(client.id));
  const activeProjects = clientProjects.filter(p => p.status !== 'Completed');

  return (
    <div className="bg-white rounded-[20px] p-4 shadow-sm border border-slate-100 hover:shadow-md transition-all group relative">
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={onEdit}
          className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors"
        >
          <Pencil size={12} />
        </button>
        <button 
          onClick={onDelete}
          className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div className="flex flex-col items-center text-center">
        <div 
          onClick={onEdit}
          className={`w-12 h-12 ${client.color} rounded-[16px] flex items-center justify-center text-lg font-black text-white mb-2 shadow-sm group-hover:scale-105 transition-all cursor-pointer hover:ring-4 hover:ring-indigo-100 hover:opacity-90`}
        >
          {client.avatar}
        </div>
        
        <h3 
          onClick={onEdit}
          className="text-sm font-black text-slate-800 uppercase tracking-tight mb-0.5 line-clamp-1 cursor-pointer hover:text-indigo-600 transition-colors"
        >
          {client.name}
        </h3>
        <div className="flex items-center gap-1 text-[8px] text-slate-400 font-bold uppercase tracking-widest mb-2">
          <Briefcase size={8} /> <span className="truncate max-w-[120px]">{client.company}</span>
        </div>

        <div className="w-full space-y-1.5 mb-3">
          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
            <div className="flex flex-col items-start">
              <span className="text-[9px] font-black text-[#4F46E5] tabular-nums leading-none mb-0.5">{clientProjects.length}</span>
              <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none">Total Units</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-black text-emerald-600 tabular-nums leading-none mb-0.5">{activeProjects.length}</span>
              <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none">Live Pipeline</span>
            </div>
          </div>
        </div>

        <div className="w-full space-y-1 mb-3">
          <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-600 bg-white border border-slate-100 px-2 py-1 rounded-lg">
            <Mail size={10} className="text-slate-300 shrink-0" />
            <span className="truncate">{client.email || 'Not Provided'}</span>
          </div>
          <a 
            href={`tel:${client.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center justify-between text-[8px] font-bold text-slate-600 bg-white border border-slate-100 px-2 py-1 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors group no-underline"
            title="Call phone number"
          >
            <div className="flex items-center gap-1.5 overflow-hidden">
              <Phone size={10} className="text-slate-300 shrink-0" />
              <span className="truncate">{client.phone}</span>
            </div>
          </a>
        </div>

        <div className="grid grid-cols-[1fr_1.2fr] gap-2">
          <button 
            onClick={onHistory}
            className="w-full bg-slate-50 text-slate-400 py-2 rounded-xl font-black text-[8px] uppercase tracking-widest hover:bg-indigo-50 hover:text-indigo-600 transition-all flex items-center justify-center gap-1.5 border border-slate-100"
          >
            <Briefcase size={10} /> History
          </button>
          <button 
            onClick={onWhatsApp}
            className="w-full bg-[#25D366] text-white py-2 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-sm hover:bg-[#128C7E] transition-all flex items-center justify-center gap-1.5 group/btn overflow-hidden relative active:scale-95"
          >
            <MessageSquare size={12} /> WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
};

const Clients: React.FC<ClientsProps> = ({ clients, projects, team, onAddClient, onUpdateClient, onDeleteClient, onEditProject, onDeleteProject, onPreviewMember, editingClient: externalEditingClient, setEditingClient: externalSetEditingClient, isFinancialsUnlocked, globalSearchQuery }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [internalEditingClient, setInternalEditingClient] = useState<Client | null>(null);
  const [historyClient, setHistoryClient] = useState<Client | null>(null);

  const editingClient = externalEditingClient !== undefined ? externalEditingClient : internalEditingClient;
  const setEditingClient = externalSetEditingClient || setInternalEditingClient;

  const handleWhatsAppRedirect = (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanPhone}`, '_blank');
  };

  const filteredClients = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const globalQuery = (globalSearchQuery || '').toLowerCase().trim();
    
    if (!query && !globalQuery) return clients;
    
    return clients.filter(c => {
      const matchesLocal = !query || 
        (c.name || '').toLowerCase().includes(query) || 
        (c.company || '').toLowerCase().includes(query) ||
        (c.email || '').toLowerCase().includes(query) ||
        (c.phone || '').toLowerCase().includes(query);
        
      const matchesGlobal = !globalQuery || 
        (c.name || '').toLowerCase().includes(globalQuery) || 
        (c.company || '').toLowerCase().includes(globalQuery) ||
        (c.email || '').toLowerCase().includes(globalQuery) ||
        (c.phone || '').toLowerCase().includes(globalQuery);
        
      return matchesLocal && matchesGlobal;
    });
  }, [clients, searchQuery, globalSearchQuery]);

  return (
    <div className="h-full overflow-y-auto pb-24 p-6 md:p-8 max-w-[1400px] mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 md:gap-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tighter uppercase">Client Portfolio</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 italic">Brand Partners & Accounts</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full md:w-auto">
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
            <input 
              className="pl-10 pr-4 py-2.5 border-2 border-slate-100 rounded-full bg-white w-full sm:w-64 focus:ring-4 focus:ring-indigo-100 outline-none transition-all font-bold shadow-sm text-sm" 
              placeholder="Search accounts..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            onClick={onAddClient}
            className="flex items-center justify-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-full font-black hover:bg-black shadow-xl transition-all active:scale-95 uppercase tracking-widest text-[10px] w-full sm:w-auto shrink-0"
          >
            <Plus size={16} />
            <span>New Account</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 md:gap-6">
        {filteredClients.map(client => (
          <ClientCard 
            key={client.id}
            client={client}
            projects={projects}
            onEdit={() => setEditingClient(client)}
            onDelete={() => setDeleteTargetId(client.id)}
            onHistory={() => setHistoryClient(client)}
            onWhatsApp={() => handleWhatsAppRedirect(client.phone)}
          />
        ))}

        {deleteTargetId && (
          <PasscodeLock 
            title="Delete Confirmation"
            subtitle={`Enter PIN to delete client portfolio`}
            correctPasscode={DELETE_PIN}
            length={4}
            onUnlock={() => {
              onDeleteClient(deleteTargetId);
              setDeleteTargetId(null);
            }}
            onClose={() => setDeleteTargetId(null)}
          />
        )}

        {editingClient && (
          <EditClientModal 
            client={editingClient} 
            onClose={() => setEditingClient(null)} 
            onUpdate={(c) => {
              onUpdateClient(c);
              setEditingClient(null);
            }} 
          />
        )}

        {historyClient && (
          <ClientHistoryModal
            client={historyClient}
            projects={projects.filter(p => (p.clientIds || (p.clientId ? [p.clientId] : [])).includes(historyClient.id))}
            team={team}
            allProjects={projects}
            onClose={() => setHistoryClient(null)}
            onEditProject={onEditProject}
            onDeleteProject={onDeleteProject}
            onPreviewMember={onPreviewMember}
            isFinancialsUnlocked={isFinancialsUnlocked}
          />
        )}

        {filteredClients.length === 0 && (
          <div className="col-span-full py-32 text-center bg-slate-50/50 rounded-[48px] border-4 border-dashed border-slate-100">
            <Briefcase size={48} className="mx-auto text-slate-200 mb-4" />
            <p className="text-slate-400 font-black uppercase tracking-widest text-xs italic">No client accounts synced</p>
            <button onClick={onAddClient} className="mt-4 text-[#4F46E5] text-[10px] font-black uppercase tracking-widest hover:underline">Register your first client</button>
          </div>
        )}
      </div>
    </div>
  );
};

export const EditClientModal: React.FC<{
  client: Client;
  onClose: () => void;
  onUpdate: (client: Client) => void;
}> = ({ client, onClose, onUpdate }) => {
  const [formData, setFormData] = useState({
    name: client.name,
    company: client.company,
    email: client.email || '',
    phone: client.phone.replace('+91', ''),
    notes: client.notes || ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate({
      ...client,
      name: formData.name,
      company: formData.company,
      email: formData.email.trim() || undefined,
      phone: `+91${formData.phone}`,
      notes: formData.notes,
      avatar: formData.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    });
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-[200] flex items-start justify-center sm:items-center bg-slate-900/60 backdrop-blur-md p-4 overflow-hidden animate-in fade-in duration-300">
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-full sm:max-h-[85vh] my-auto">
        <div className="p-8 border-b flex justify-between items-center bg-white/50 backdrop-blur-sm shrink-0 z-20">
          <div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight uppercase">Edit Account</h3>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 hover:text-slate-900 transition-all active:scale-90"><X size={24} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-8 pt-6 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">Client Name</label>
            <input required className="w-full border-2 border-slate-100 rounded-xl p-4 bg-slate-50 font-black focus:border-indigo-500 outline-none transition-all text-sm" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">Brand / Company</label>
            <input required className="w-full border-2 border-slate-100 rounded-xl p-4 bg-slate-50 font-black focus:border-indigo-500 outline-none transition-all text-sm" value={formData.company} onChange={e => setFormData({...formData, company: e.target.value})} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">Phone</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400 text-[10px]">+91</span>
                <input required className="w-full border-2 border-slate-100 rounded-xl pl-12 pr-4 py-3 bg-slate-50 font-black focus:border-indigo-500 outline-none transition-all text-sm" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10)})} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">Email</label>
              <input type="email" className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 bg-slate-50 font-black focus:border-indigo-500 outline-none transition-all text-sm" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">Account Notes</label>
            <textarea className="w-full border-2 border-slate-100 rounded-xl p-4 bg-slate-50 font-bold outline-none resize-none min-h-[100px] text-xs" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
          </div>

          <div className="pt-6 border-t border-slate-50">
            <button type="submit" className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-2">
              <Check size={18} /> Update Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Clients;

const ClientHistoryModal: React.FC<{
  client: Client;
  projects: Project[];
  team: TeamMember[];
  allProjects: Project[];
  onClose: () => void;
  onEditProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  onPreviewMember: (member: TeamMember) => void;
  isFinancialsUnlocked: boolean;
}> = ({ client, projects, team, allProjects, onClose, onEditProject, onDeleteProject, onPreviewMember, isFinancialsUnlocked }) => {
  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      if (a.status === 'Completed' && b.status !== 'Completed') return 1;
      if (a.status !== 'Completed' && b.status === 'Completed') return -1;
      return new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime();
    });
  }, [projects]);

  return (
    <div onClick={onClose} className="fixed inset-0 z-[200] flex items-start justify-center sm:items-center bg-slate-900/60 backdrop-blur-md p-4 overflow-hidden animate-in fade-in duration-300">
      <div onClick={e => e.stopPropagation()} className="bg-[#F4F5F7] rounded-[40px] w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-full sm:max-h-[90vh] my-auto">
        <div className="p-8 border-b border-slate-200 flex justify-between items-center bg-white/50 backdrop-blur-sm shrink-0 z-20">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 ${client.color} rounded-2xl flex items-center justify-center text-lg font-black text-white shadow-md`}>
              {client.avatar}
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight uppercase">{client.company}</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Project History</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 hover:text-slate-900 transition-all active:scale-90"><X size={24} /></button>
        </div>

        <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
          {sortedProjects.length === 0 ? (
            <div className="py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-200">
              <Briefcase size={40} className="mx-auto text-slate-300 mb-4" />
              <p className="text-slate-400 font-black uppercase tracking-widest text-xs">No projects found for this client</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sortedProjects.map(project => (
                <ProjectCard 
                  key={project.id} 
                  project={project} 
                  team={team} 
                  projects={allProjects}
                  onClick={() => onEditProject(project)}
                  onPreviewMember={onPreviewMember}
                  onDelete={() => onDeleteProject(project.id)}
                  isFinancialsUnlocked={isFinancialsUnlocked}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
