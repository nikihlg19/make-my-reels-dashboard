
import React, { useState, useMemo } from 'react';
import { format, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, isToday, endOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, X, Calendar as CalendarIcon, Clock, Search, HelpCircle, Settings, ChevronDown, Video } from 'lucide-react';
import { CalendarEvent, Project } from '../types';
import { INITIAL_EVENTS } from '../constants';

// Manual implementations to fix missing date-fns exports in this environment
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const subMonths = (date: Date, amount: number) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() - amount);
  return d;
};
const startOfWeek = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
};

interface CalendarProps {
  projects: Project[];
  onEditProject: (projectId: string) => void;
  onCreateProject: (date: string) => void;
}

const Calendar: React.FC<CalendarProps> = ({ projects, onEditProject, onCreateProject }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [manualEvents, setManualEvents] = useState<CalendarEvent[]>(INITIAL_EVENTS);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');

  const projectEvents = useMemo(() => {
    const events: CalendarEvent[] = [];
    projects.forEach(p => {
      events.push({ id: `shoot-${p.id}`, title: `SHOOT: ${p.title}${p.eventTime ? ` @ ${p.eventTime}` : ''}`, date: p.eventDate, type: 'shoot', projectId: p.id });
      if (p.submissionDeadline) {
        events.push({ id: `deadline-${p.id}`, title: `DUE: ${p.title}`, date: p.submissionDeadline, type: 'project', projectId: p.id });
      }
    });
    return events;
  }, [projects]);

  const holidays = useMemo(() => [
    { date: '2026-01-01', title: "New Year's Day" },
    { date: '2026-01-26', title: "Republic Day" },
    { date: '2026-03-04', title: "Holi" }
  ], []);

  const allEvents = useMemo(() => [...manualEvents, ...projectEvents], [manualEvents, projectEvents]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth));
    const end = endOfWeek(endOfMonth(currentMonth));
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const getEventsForDay = (date: Date) => {
    const dayStr = format(date, 'yyyy-MM-dd');
    return [
      ...allEvents.filter(e => isSameDay(new Date(e.date), date)),
      ...holidays.filter(h => h.date === dayStr).map(h => ({ ...h, id: h.title, type: 'holiday' as const }))
    ].sort((a, b) => {
      const priority = { shoot: 1, project: 2, holiday: 3 };
      return (priority[a.type as keyof typeof priority] || 4) - (priority[b.type as keyof typeof priority] || 4);
    });
  };

  const handleDayClick = (day: Date) => {
    setSelectedDate(day);
    setIsSidePanelOpen(true);
  };

  const handleAddEvent = () => {
    if (!selectedDate || !newEventTitle) return;
    const event: CalendarEvent = {
      id: Math.random().toString(36).substr(2, 9),
      title: newEventTitle,
      date: format(selectedDate, 'yyyy-MM-dd'),
      type: 'shoot'
    };
    setManualEvents([...manualEvents, event]);
    setNewEventTitle('');
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-white overflow-hidden pb-16 md:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 md:px-6 py-3 border-b border-slate-200 shrink-0 sm:h-16 gap-3 sm:gap-0">
        <div className="flex items-center justify-between sm:justify-start gap-3 md:gap-8 w-full sm:w-auto">
          <button onClick={() => setCurrentMonth(new Date())} className="px-4 py-1.5 border border-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50 hidden sm:block">Today</button>
          <div className="flex items-center gap-3">
             <div className="flex items-center bg-slate-50 p-1 rounded-lg border border-slate-200">
                <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 hover:bg-white rounded transition-all"><ChevronLeft size={16} /></button>
                <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 hover:bg-white rounded transition-all"><ChevronRight size={16} /></button>
             </div>
             <h2 className="hidden sm:block text-base md:text-lg font-black text-slate-800 uppercase tracking-tight">{format(currentMonth, 'MMMM yyyy')}</h2>
          </div>
          <div className="flex items-center gap-2 sm:hidden">
            <input 
              type="month" 
              className="px-2 py-1.5 border border-slate-200 rounded-lg text-[10px] font-bold bg-slate-50 uppercase tracking-widest outline-none w-[140px]"
              value={format(currentMonth, 'yyyy-MM')}
              min={`${new Date().getFullYear() - 2}-01`}
              max={`${new Date().getFullYear() + 2}-12`}
              onChange={(e) => {
                if (e.target.value) {
                  const [year, month] = e.target.value.split('-');
                  setCurrentMonth(new Date(parseInt(year), parseInt(month) - 1, 1));
                }
              }}
            />
            <button onClick={() => setCurrentMonth(new Date())} className="px-3 py-1.5 border border-slate-200 rounded-lg text-[10px] font-bold hover:bg-slate-50 uppercase tracking-widest">Today</button>
          </div>
        </div>
        <div className="hidden sm:flex items-center justify-end gap-1 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 w-fit self-end sm:self-auto">
          <input 
            type="month" 
            className="bg-transparent outline-none cursor-pointer"
            value={format(currentMonth, 'yyyy-MM')}
            min={`${new Date().getFullYear() - 2}-01`}
            max={`${new Date().getFullYear() + 2}-12`}
            onChange={(e) => {
              if (e.target.value) {
                const [year, month] = e.target.value.split('-');
                setCurrentMonth(new Date(parseInt(year), parseInt(month) - 1, 1));
              }
            }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-hidden md:overflow-y-auto min-h-0 flex flex-col scrollbar-hide">
        <div className="grid grid-cols-7 border-b border-slate-200 shrink-0 bg-slate-50/30 sticky top-0 z-10 border-l border-slate-200">
          {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day, i) => (
            <div key={day} className="py-2 md:py-3 text-center text-[10px] font-black text-slate-400 md:tracking-[0.2em] border-r border-slate-200">
              <span className="hidden md:inline">{day}</span>
              <span className="md:hidden">{['S', 'M', 'T', 'W', 'T', 'F', 'S'][i]}</span>
            </div>
          ))}
        </div>

        <div className="flex-1 grid grid-cols-7 grid-rows-6 border-l border-slate-200">
          {calendarDays.slice(0, 42).map((day) => {
          const dayEvents = getEventsForDay(day);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isTodayDate = isToday(day);
          const hasHoliday = dayEvents.some(e => e.type === 'holiday');
          return (
            <div 
              key={day.toISOString()} 
              onClick={() => handleDayClick(day)}
              className={`min-h-0 md:min-h-[120px] p-0.5 md:p-2 border-r border-b border-slate-200 hover:bg-indigo-50/20 transition-colors cursor-pointer flex flex-col items-center md:items-start gap-0.5 md:gap-2 ${!isCurrentMonth ? 'bg-slate-50/40 grayscale opacity-60' : isTodayDate ? 'bg-indigo-50/60 border-indigo-100/40' : 'bg-white'}`}
            >
              <div className="flex flex-col md:flex-row items-center justify-between w-full gap-1">
                <span className={`w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded-full text-xs md:text-sm font-black transition-all ${isTodayDate ? 'bg-[#4F46E5] text-white shadow-lg scale-105' : hasHoliday ? 'text-emerald-600' : isCurrentMonth ? 'text-slate-800' : 'text-slate-400'}`}>
                  {format(day, 'd')}
                </span>
                {dayEvents.length > 0 && (
                  <span className="hidden md:flex text-[7px] md:text-[8px] font-black text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-md min-w-[16px] items-center justify-center border border-sky-100/50 shadow-sm">
                    {dayEvents.length}
                  </span>
                )}
              </div>
              
              {/* Desktop view: Event titles */}
              <div className="hidden md:flex flex-1 overflow-y-hidden flex-col gap-1 w-full min-w-0">
                {dayEvents.slice(0, 2).map((event: any, i) => (
                  <div key={i} className={`text-[7px] md:text-[8px] px-1.5 py-1 rounded-lg truncate font-black uppercase tracking-tighter border shadow-sm flex items-center gap-1 ${event.type === 'shoot' ? 'bg-rose-500 text-white border-rose-600' : event.type === 'project' ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                    {event.type === 'shoot' && <Video size={10} className="shrink-0" />}
                    {event.title}
                  </div>
                ))}
                {dayEvents.length > 2 && (
                  <div className="text-[7px] text-slate-400 font-bold pl-1">+{dayEvents.length - 2} more</div>
                )}
              </div>

              {/* Mobile view: Colored dots */}
              <div className="flex md:hidden flex-wrap justify-center gap-0.5 w-full px-0.5">
                {dayEvents.slice(0, 4).map((event: any, i) => (
                  <div key={i} className={`w-1.5 h-1.5 rounded-full shadow-sm ${event.type === 'shoot' ? 'bg-rose-500' : event.type === 'project' ? 'bg-indigo-500' : 'bg-emerald-500'}`} />
                ))}
                {dayEvents.length > 4 && (
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400 shadow-sm" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
    
    {/* Legend */}
    <div className="mt-6 flex flex-wrap items-center gap-6 px-4 py-3 bg-white border border-slate-200 rounded-2xl shadow-sm max-w-6xl mx-auto">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-rose-500 shadow-sm"></div>
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Shoot Date</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-indigo-500 shadow-sm"></div>
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Deadline</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm"></div>
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Festival / Holiday</span>
      </div>
    </div>

      {/* Side Panel */}
      {isSidePanelOpen && (
        <div className="fixed inset-0 z-[110] flex justify-end">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsSidePanelOpen(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-500">
            <div className="p-4 md:p-8 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="text-xl md:text-2xl font-black text-slate-800 tracking-tighter uppercase">{format(selectedDate!, 'do MMMM')}</h3>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1 italic">{format(selectedDate!, 'EEEE')}</p>
              </div>
              <button onClick={() => setIsSidePanelOpen(false)} className="p-2 md:p-3 hover:bg-slate-50 rounded-2xl transition-all"><X size={24} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 md:space-y-10">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Quick Add Activity</label>
                <div className="flex gap-2">
                  <input className="flex-1 border-2 border-slate-100 rounded-xl px-4 py-3 bg-slate-50 font-bold text-sm" placeholder="Meeting, task, etc..." value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddEvent()} />
                  <button onClick={handleAddEvent} className="bg-indigo-600 text-white p-3 rounded-xl shadow-lg"><Plus size={20} /></button>
                </div>
              </div>

              <div className="space-y-6">
                <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest border-b border-slate-200 pb-2">Day Schedule</h4>
                {getEventsForDay(selectedDate!).length === 0 ? (
                  <div className="text-center py-20 opacity-30"><CalendarIcon size={40} className="mx-auto mb-4" /><p className="text-[10px] font-black uppercase tracking-widest">No Events</p></div>
                ) : (
                  <div className="space-y-4">
                    {getEventsForDay(selectedDate!).map((event: any, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => event.projectId && onEditProject(event.projectId)}
                        className={`p-4 rounded-2xl border-2 transition-all group ${event.projectId ? 'cursor-pointer hover:shadow-lg active:scale-[0.98]' : ''} ${event.type === 'shoot' ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-200'}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                           <div className="flex items-center gap-2">
                              <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${event.type === 'shoot' ? 'bg-rose-500 text-white' : 'bg-indigo-500 text-white'}`}>{event.type}</span>
                              <Clock size={12} className="text-slate-300" />
                           </div>
                           {event.projectId && <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest group-hover:underline">Edit Details</span>}
                        </div>
                        <div className="flex items-center gap-3">
                           {event.type === 'shoot' && <Video size={16} className="text-slate-700" />}
                           <p className="text-sm font-black text-slate-800 uppercase leading-none">{event.title}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-8 border-t border-slate-200">
               <button onClick={() => { onCreateProject(format(selectedDate!, 'yyyy-MM-dd')); setIsSidePanelOpen(false); }} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl flex items-center justify-center gap-3">
                 <Plus size={18} /> New Unit
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Calendar;
