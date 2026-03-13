
import React, { useMemo } from 'react';
import { TeamMember, Project, Client } from '../types';
import { Target, CheckCircle2, Users, Star, Calendar as CalendarIcon, Clock, Filter, BarChart3, TrendingUp, PieChart as PieChartIcon, IndianRupee } from 'lucide-react';
import { DateFilter } from '../App';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

interface AnalyticsProps {
  team: TeamMember[];
  projects: Project[];
  clients?: Client[];
  dateFilter: DateFilter;
  setDateFilter: (filter: DateFilter) => void;
  onPreviewMember: (member: TeamMember) => void;
  onEditProject: (project: Project) => void;
}

const Analytics: React.FC<AnalyticsProps> = ({ team, projects, clients = [], dateFilter, setDateFilter, onPreviewMember, onEditProject }) => {
  const filteredProjects = useMemo(() => {
    if (dateFilter.type === 'all') return projects;

    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();

    if (dateFilter.type === '1m') {
      startDate.setMonth(now.getMonth() - 1);
    } else if (dateFilter.type === '1y') {
      startDate.setFullYear(now.getFullYear() - 1);
    } else if (dateFilter.type === 'custom') {
      if (dateFilter.start) startDate = new Date(dateFilter.start);
      if (dateFilter.end) endDate = new Date(dateFilter.end);
      // Set end date to end of day
      endDate.setHours(23, 59, 59, 999);
    }

    return projects.filter(p => {
      const pDate = new Date(p.eventDate || p.submissionDeadline || p.updatedAt || 0);
      if (isNaN(pDate.getTime())) return true; // Include if no valid date

      if (dateFilter.type === 'custom') {
        return pDate >= startDate && pDate <= endDate;
      } else {
        return pDate >= startDate;
      }
    });
  }, [projects, dateFilter]);

  const totalProjects = filteredProjects.length;
  const completedCount = filteredProjects.filter(p => p.status === 'Completed').length;
  const totalMembers = team.length;
  
  // Only calculate average for members who have actually been rated, using 2 decimal precision
  const ratedMembers = team.filter(m => m.completedProjects > 0);
  const avgRatingValue = ratedMembers.length > 0 
    ? (ratedMembers.reduce((acc, curr) => acc + curr.avgRating, 0) / ratedMembers.length).toFixed(2) 
    : 'N/A';

  const monthlyData = useMemo(() => {
    const data: Record<string, { sortKey: string, name: string, revenue: number, expenses: number }> = {};
    filteredProjects.forEach(p => {
      if (p.status === 'Quote Sent' || p.status === 'Expired') return;
      const date = new Date(p.eventDate || p.submissionDeadline || new Date().toISOString());
      if (isNaN(date.getTime())) return;
      
      const sortKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const name = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      
      if (!data[sortKey]) {
        data[sortKey] = { sortKey, name, revenue: 0, expenses: 0 };
      }
      data[sortKey].revenue += (p.budget || 0);
      data[sortKey].expenses += (p.expenses || 0);
    });
    
    return Object.values(data).sort((a, b) => a.sortKey.localeCompare(b.sortKey)).slice(-12);
  }, [filteredProjects]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {
      'Expired': 0, 'Quote Sent': 0, 'To Do': 0, 'In Progress': 0, 'Completed': 0
    };
    filteredProjects.forEach(p => {
      if (counts[p.status] !== undefined) {
        counts[p.status]++;
      }
    });
    return [
      { name: 'Completed', value: counts['Completed'], color: '#10B981' },
      { name: 'In Progress', value: counts['In Progress'], color: '#3B82F6' },
      { name: 'To Do', value: counts['To Do'], color: '#F59E0B' },
      { name: 'Quote Sent', value: counts['Quote Sent'], color: '#8B5CF6' },
      { name: 'Expired', value: counts['Expired'], color: '#EF4444' },
    ].filter(d => d.value > 0);
  }, [filteredProjects]);

  const clientData = useMemo(() => {
    const data: Record<string, { name: string, revenue: number }> = {};
    filteredProjects.forEach(p => {
      if (p.status === 'Quote Sent' || p.status === 'Expired') return;
      
      const clientIds = p.clientIds || (p.clientId ? [p.clientId] : []);
      
      if (clientIds.length === 0) {
        const clientName = 'Unknown';
        if (!data[clientName]) {
          data[clientName] = { name: clientName, revenue: 0 };
        }
        data[clientName].revenue += (p.budget || 0);
        return;
      }

      // Split revenue equally among clients
      const splitRevenue = (p.budget || 0) / clientIds.length;

      clientIds.forEach(clientId => {
        let clientName = clientId;
        if (clients && clients.length > 0) {
          const client = clients.find(c => c.id === clientId);
          if (client) {
            clientName = client.company ? `${client.name} - ${client.company}` : client.name;
          }
        }
        if (!clientName) clientName = 'Unknown';

        if (!data[clientName]) {
          data[clientName] = { name: clientName, revenue: 0 };
        }
        data[clientName].revenue += splitRevenue;
      });
    });
    return Object.values(data).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [filteredProjects, clients]);

  const topTeamMembers = useMemo(() => {
    return [...team].sort((a, b) => {
      const aProjects = filteredProjects.filter(p => p.teamMemberIds.includes(a.id)).length;
      const bProjects = filteredProjects.filter(p => p.teamMemberIds.includes(b.id)).length;
      return bProjects - aProjects;
    }).slice(0, 10);
  }, [team, filteredProjects]);

  const recentProjects = useMemo(() => {
    return [...filteredProjects]
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
      .slice(0, 10);
  }, [filteredProjects]);

  return (
    <div className="h-full overflow-y-auto pb-24 p-4 md:p-10 max-w-[1400px] mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 md:gap-8 mb-8 md:mb-12">
        <div className="flex items-center gap-4">
          <div className="p-3 md:p-4 bg-indigo-600 rounded-[20px] md:rounded-[24px] text-white shadow-xl shadow-indigo-100 shrink-0">
            <BarChart3 size={24} className="md:w-8 md:h-8" />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tighter uppercase">Intelligence Dashboard</h2>
            <p className="text-[10px] md:text-xs text-slate-400 font-bold uppercase tracking-widest mt-1 italic">Production Throughput & Specialist Efficiency</p>
          </div>
        </div>

        <div className="bg-white border-2 border-slate-100 rounded-[24px] md:rounded-[28px] p-2 flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-2 shadow-sm w-full lg:w-auto">
          <div className="flex items-center gap-2 px-4 py-2 sm:border-r border-slate-100 w-full sm:w-auto">
            <Filter size={14} className="text-indigo-500 shrink-0" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Timeframe</span>
          </div>
          
          <div className="flex flex-wrap gap-1 px-2 sm:px-0 w-full sm:w-auto">
            {(['1m', '1y', 'all', 'custom'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setDateFilter({ ...dateFilter, type })}
                className={`px-3 md:px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex-1 sm:flex-none ${
                  dateFilter.type === type 
                  ? 'bg-indigo-600 text-white shadow-lg scale-105' 
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}
              >
                {type === '1m' ? '1 Month' : type === '1y' ? '1 Year' : type === 'all' ? 'All' : 'Custom'}
              </button>
            ))}
          </div>

          {dateFilter.type === 'custom' && (
            <div className="flex flex-col sm:flex-row items-center gap-2 px-2 sm:pl-4 sm:pr-2 animate-in slide-in-from-left-4 duration-300 w-full sm:w-auto mt-2 sm:mt-0">
              <input 
                type="date"
                className="w-full sm:w-auto bg-slate-50 border-2 border-slate-100 rounded-xl px-3 py-1.5 text-[10px] font-bold outline-none focus:border-indigo-300 transition-all"
                value={dateFilter.start || ''}
                onChange={(e) => setDateFilter({ ...dateFilter, start: e.target.value })}
              />
              <span className="text-[10px] font-black text-slate-300 hidden sm:inline">to</span>
              <input 
                type="date"
                className="w-full sm:w-auto bg-slate-50 border-2 border-slate-100 rounded-xl px-3 py-1.5 text-[10px] font-bold outline-none focus:border-indigo-300 transition-all"
                value={dateFilter.end || ''}
                onChange={(e) => setDateFilter({ ...dateFilter, end: e.target.value })}
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
        <SummaryCard icon={<Target size={28} />} label="Period Projects" value={totalProjects} bgColor="bg-indigo-600" />
        <SummaryCard icon={<CheckCircle2 size={28} />} label="Closed Deliveries" value={completedCount} bgColor="bg-emerald-50" />
        <SummaryCard icon={<Users size={28} />} label="Specialists" value={totalMembers} bgColor="bg-slate-900" />
        <SummaryCard icon={<Star size={28} />} label="Average Quality" value={avgRatingValue} bgColor="bg-amber-500" />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        {/* Revenue vs Expenses */}
        <div className="bg-white rounded-[32px] border-2 border-slate-50 shadow-xl shadow-slate-200/50 p-6 lg:col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <TrendingUp size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Financial Trajectory</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Revenue vs Expenses over time</p>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} tickFormatter={(val) => `₹${val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}`} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', fontWeight: 700, fontSize: '12px' }}
                  formatter={(value: number) => [`₹${value.toLocaleString()}`, undefined]}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', paddingTop: '20px' }} />
                <Bar dataKey="revenue" name="Revenue" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="expenses" name="Expenses" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Project Status */}
        <div className="bg-white rounded-[32px] border-2 border-slate-50 shadow-xl shadow-slate-200/50 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <PieChartIcon size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Status Distribution</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Current pipeline state</p>
            </div>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', fontWeight: 700, fontSize: '12px' }}
                />
                <Legend iconType="circle" layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Clients */}
        <div className="bg-white rounded-[32px] border-2 border-slate-50 shadow-xl shadow-slate-200/50 p-6 lg:col-span-3">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
              <IndianRupee size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Top Client Revenue</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Highest performing accounts</p>
            </div>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={clientData} layout="vertical" margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} tickFormatter={(val) => `₹${val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}`} />
                <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#475569' }} width={100} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', fontWeight: 700, fontSize: '12px' }}
                  formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Revenue']}
                />
                <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[0, 4, 4, 0]} maxBarSize={30}>
                  {clientData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'][index % 5]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[40px] border-2 border-slate-50 shadow-xl shadow-slate-200/50 overflow-hidden mb-12">
        <div className="p-8 border-b bg-slate-50/50 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight uppercase">Talent Performance Matrix</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Top 10 Specialists by workload</p>
          </div>
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-black text-slate-500 uppercase">On Track</span>
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white border-b">
              <tr>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Specialist</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Load</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Closed</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Active</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Quality</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Throughput</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {topTeamMembers.map(member => {
                const memberProjects = filteredProjects.filter(p => p.teamMemberIds.includes(member.id));
                const active = memberProjects.filter(p => p.status !== 'Completed').length;
                const completed = memberProjects.filter(p => p.status === 'Completed').length;
                const rate = memberProjects.length > 0 ? (completed / memberProjects.length) * 100 : 0;
                const hasCompletedProjects = member.completedProjects > 0;

                return (
                  <tr 
                    key={member.id} 
                    onClick={() => onPreviewMember(member)}
                    className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                  >
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-[18px] flex items-center justify-center font-black text-white shadow-lg transition-transform group-hover:scale-110 ${member.color || 'bg-slate-900'}`}>{member.avatar}</div>
                        <div>
                          <div className="font-black text-slate-800 uppercase tracking-tight text-sm">{member.name}</div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{Array.isArray(member.role) ? member.role[0] : member.role}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 font-black text-slate-700 text-xs shadow-inner">
                        {memberProjects.length}
                      </div>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-50 font-black text-emerald-600 text-xs shadow-sm border border-emerald-100/50">
                        {completed}
                      </div>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-50 font-black text-indigo-600 text-xs shadow-sm border border-indigo-100/50">
                        {active}
                      </div>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <div className={`inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full shadow-sm border transition-all ${hasCompletedProjects ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                        {hasCompletedProjects && <Star size={12} className="fill-amber-500 text-amber-500" />}
                        <span className="font-black text-xs">{hasCompletedProjects ? member.avgRating.toFixed(2) : 'N/A'}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden min-w-[120px] shadow-inner">
                          <div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-1000" style={{ width: `${rate}%` }} />
                        </div>
                        <span className="text-[10px] font-black text-slate-700 tabular-nums">{rate.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-[40px] border-2 border-slate-50 shadow-xl shadow-slate-200/50 overflow-hidden">
        <div className="p-8 border-b bg-slate-50/50 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight uppercase">Recent Projects in Timeframe</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Latest 10 projects • Click to view or edit details</p>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white border-b">
              <tr>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Project</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Client</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Priority</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Budget</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {recentProjects.map(project => {
                const client = clients.find(c => c.id === project.clientId);
                return (
                  <tr 
                    key={project.id} 
                    onClick={() => onEditProject(project)}
                    className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                  >
                    <td className="px-8 py-6">
                      <div className="font-black text-slate-800 uppercase tracking-tight text-sm">{project.title}</div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="font-bold text-slate-600 text-xs">{client ? client.company : 'Unknown'}</div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${
                        project.status === 'Completed' ? 'bg-emerald-50 text-emerald-600' :
                        project.status === 'In Progress' ? 'bg-indigo-50 text-indigo-600' :
                        project.status === 'To Do' ? 'bg-amber-50 text-amber-600' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {project.status}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${
                        project.priority === 'High' ? 'bg-orange-50 text-orange-500' :
                        project.priority === 'Medium' ? 'bg-amber-50 text-amber-500' :
                        'bg-emerald-50 text-emerald-500'
                      }`}>
                        {project.priority}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <span className="font-black text-slate-700 tabular-nums text-sm">₹{(project.budget || 0).toLocaleString()}</span>
                    </td>
                  </tr>
                );
              })}
              {recentProjects.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-8 py-12 text-center text-slate-400 font-bold text-sm">
                    No projects found in this timeframe.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const SummaryCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number; bgColor: string }> = ({ icon, label, value, bgColor }) => (
  <div className={`${bgColor} text-white p-8 rounded-[40px] shadow-2xl relative overflow-hidden group hover:-translate-y-2 transition-all duration-500`}>
    <div className="relative z-10 flex flex-col h-full justify-between">
      <div className="p-3 bg-white/20 rounded-2xl w-fit backdrop-blur-md mb-8 group-hover:rotate-12 transition-transform">{icon}</div>
      <div>
        <div className="text-5xl font-black mb-1 tracking-tighter">{value}</div>
        <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 italic">{label}</div>
      </div>
    </div>
    <div className="absolute right-[-40px] bottom-[-40px] opacity-10 group-hover:scale-125 transition-transform duration-700 pointer-events-none">
      {React.isValidElement(icon) && React.cloneElement(icon as React.ReactElement<any>, { size: 180 })}
    </div>
  </div>
);

export default Analytics;
