import React, { useState } from 'react';
import { X, Plus, CalendarOff, Trash2 } from 'lucide-react';
import { format, addDays, startOfWeek, parseISO, isWithinInterval } from 'date-fns';
import type { TeamMember } from '../types';
import { useTeamAvailability } from '../src/hooks/useTeamAvailability';

interface TeamAvailabilityCalendarProps {
  team: TeamMember[];
}

export const TeamAvailabilityCalendar: React.FC<TeamAvailabilityCalendarProps> = ({ team }) => {
  const [selectedMemberId, setSelectedMemberId] = useState<string>(team[0]?.id || '');
  const [addingBlock, setAddingBlock] = useState(false);
  const [newFrom, setNewFrom] = useState('');
  const [newTo, setNewTo] = useState('');
  const [newReason, setNewReason] = useState('');
  const [saving, setSaving] = useState(false);

  const { availability, loading, addBlock, removeBlock } = useTeamAvailability(selectedMemberId);

  const selectedMember = team.find(m => m.id === selectedMemberId);

  // Build a 4-week grid starting from today's week
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday
  const days = Array.from({ length: 28 }, (_, i) => addDays(weekStart, i));

  const isBlocked = (date: Date) => {
    const ds = format(date, 'yyyy-MM-dd');
    return availability.some(a => ds >= a.unavailableFrom && ds <= a.unavailableTo);
  };

  const handleSave = async () => {
    if (!newFrom || !newTo || !selectedMemberId) return;
    setSaving(true);
    await addBlock(selectedMemberId, newFrom, newTo, newReason || undefined);
    setAddingBlock(false);
    setNewFrom(''); setNewTo(''); setNewReason('');
    setSaving(false);
  };

  return (
    <div className="bg-white rounded-[24px] border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarOff size={16} className="text-slate-400" />
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-700">Team Availability</h3>
        </div>
        <button
          type="button"
          onClick={() => setAddingBlock(v => !v)}
          className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          <Plus size={12} /> Block Date
        </button>
      </div>

      {/* Member picker */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {team.filter(m => !m.isDeleted).map(m => (
          <button
            key={m.id}
            type="button"
            onClick={() => setSelectedMemberId(m.id)}
            className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${
              selectedMemberId === m.id
                ? `${m.color || 'bg-indigo-600'} text-white shadow-sm`
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {m.name.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* Add block form */}
      {addingBlock && (
        <div className="mb-4 p-4 bg-indigo-50 rounded-2xl border border-indigo-100 space-y-3 animate-in slide-in-from-top-2 duration-200">
          <p className="text-[9px] font-black text-indigo-700 uppercase tracking-widest">Block dates for {selectedMember?.name}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[8px] font-black text-slate-400 uppercase">From</label>
              <input type="date" value={newFrom} onChange={e => setNewFrom(e.target.value)}
                className="w-full text-[10px] font-bold border border-slate-200 rounded-xl p-2 outline-none focus:border-indigo-400" />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-slate-400 uppercase">To</label>
              <input type="date" value={newTo} min={newFrom} onChange={e => setNewTo(e.target.value)}
                className="w-full text-[10px] font-bold border border-slate-200 rounded-xl p-2 outline-none focus:border-indigo-400" />
            </div>
          </div>
          <input
            type="text" placeholder="Reason (optional)" value={newReason}
            onChange={e => setNewReason(e.target.value)}
            className="w-full text-[10px] font-bold border border-slate-200 rounded-xl p-2 outline-none focus:border-indigo-400"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setAddingBlock(false)}
              className="flex-1 py-2 rounded-xl text-[9px] font-black uppercase text-slate-400 bg-white border border-slate-200 hover:bg-slate-50 transition-all">
              Cancel
            </button>
            <button type="button" disabled={!newFrom || !newTo || saving} onClick={handleSave}
              className="flex-1 py-2 rounded-xl text-[9px] font-black uppercase text-white bg-indigo-600 hover:bg-indigo-700 transition-all disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Block'}
            </button>
          </div>
        </div>
      )}

      {/* 4-week grid */}
      <div className="grid grid-cols-7 gap-0.5 mb-3">
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
          <div key={d} className="text-center text-[7px] font-black text-slate-300 uppercase tracking-widest pb-1">{d}</div>
        ))}
        {days.map(day => {
          const blocked = isBlocked(day);
          const isToday = format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
          return (
            <div
              key={day.toISOString()}
              className={`aspect-square rounded-lg flex items-center justify-center text-[8px] font-black transition-all ${
                blocked ? 'bg-rose-100 text-rose-500' :
                isToday ? 'bg-indigo-600 text-white' :
                'bg-slate-50 text-slate-400 hover:bg-slate-100'
              }`}
              title={blocked ? 'Unavailable' : undefined}
            >
              {format(day, 'd')}
            </div>
          );
        })}
      </div>

      {/* Blocked periods list */}
      {availability.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-2">Blocked Periods</p>
          {availability.map(a => (
            <div key={a.id} className="flex items-center justify-between bg-rose-50 rounded-xl px-3 py-2">
              <div>
                <p className="text-[9px] font-black text-rose-700">
                  {format(parseISO(a.unavailableFrom), 'd MMM')} — {format(parseISO(a.unavailableTo), 'd MMM yyyy')}
                </p>
                {a.reason && <p className="text-[8px] text-rose-400 font-bold mt-0.5">{a.reason}</p>}
              </div>
              <button
                type="button"
                onClick={() => removeBlock(a.id)}
                className="p-1.5 rounded-lg hover:bg-rose-100 text-rose-400 hover:text-rose-600 transition-all"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && availability.length === 0 && (
        <p className="text-center text-[9px] font-black text-slate-200 uppercase tracking-widest py-2">
          No blocked dates for {selectedMember?.name}
        </p>
      )}
    </div>
  );
};
