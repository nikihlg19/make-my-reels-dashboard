import React, { useState, useEffect, useRef } from 'react';
import {
  Bell, Clock, Calendar as CalendarIcon, CheckCircle, Check,
  AlertTriangle, UserCheck, XCircle, RefreshCw, Zap, UserX,
} from 'lucide-react';
import { Project, PendingApproval } from '../types';
import { format, differenceInHours, differenceInMinutes, formatDistanceToNow } from 'date-fns';
import { useDBNotifications, DBNotification } from '../src/hooks/useDBNotifications';

interface NotificationBellProps {
  projects: Project[];
  onProjectClick: (projectId: string) => void;
  isAdmin?: boolean;
  pendingApprovals?: PendingApproval[];
  onApprove?: (approvalId: string) => void;
  onReject?: (approvalId: string) => void;
  onSmartAssign?: (projectId: string) => void;
}

interface LocalNotification {
  id: string;
  projectId: string;
  title: string;
  message: string;
  type: 'shoot' | 'deadline';
  urgency: 'high' | 'medium';
  timeStr: string;
  isRead: boolean;
  source: 'local';
  createdAt: string;
}

// --- Helper: Send push notification via Service Worker ---
async function sendPushNotification(title: string, body: string, tag?: string) {
  const options: NotificationOptions & { vibrate?: number[]; badge?: string; requireInteraction?: boolean } = {
    body, icon: '/favicon.ico', badge: '/favicon.ico',
    tag: tag || 'mmr-notification', vibrate: [100, 50, 100, 50, 200],
    requireInteraction: false,
  };
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, options);
      return;
    } catch { /* fall through */ }
  }
  try { new Notification(title, { body, icon: options.icon, tag: options.tag }); } catch { /* ignore */ }
}

// --- Helper: Prune old dedup keys older than 48h ---
function pruneOldNotifKeys() {
  try {
    const raw = localStorage.getItem('mmr_system_notifs');
    if (!raw) return;
    const keys: Record<string, number | boolean> = JSON.parse(raw);
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    let changed = false;
    for (const key of Object.keys(keys)) {
      const val = keys[key];
      if (val === true || (typeof val === 'number' && val < cutoff)) { delete keys[key]; changed = true; }
    }
    if (changed) localStorage.setItem('mmr_system_notifs', JSON.stringify(keys));
  } catch { /* ignore */ }
}

// --- DB notification icon + colour config ---
function dbNotifStyle(type: string): { icon: React.ReactNode; bg: string; text: string; label: string } {
  switch (type) {
    case 'assignment_accepted':
      return { icon: <CheckCircle size={18} />, bg: 'from-emerald-50 to-emerald-100', text: 'text-emerald-600', label: 'Accepted' };
    case 'assignment_declined':
      return { icon: <UserX size={18} />, bg: 'from-rose-50 to-rose-100', text: 'text-rose-600', label: 'Declined' };
    case 'assignment_cascaded':
      return { icon: <RefreshCw size={18} />, bg: 'from-indigo-50 to-indigo-100', text: 'text-indigo-600', label: 'Auto-sent' };
    case 'assignment_exhausted':
      return { icon: <AlertTriangle size={18} />, bg: 'from-amber-50 to-amber-100', text: 'text-amber-600', label: 'No candidates' };
    case 'assignment_expired':
      return { icon: <Clock size={18} />, bg: 'from-slate-50 to-slate-100', text: 'text-slate-500', label: 'Expired' };
    default:
      return { icon: <Bell size={18} />, bg: 'from-indigo-50 to-indigo-100', text: 'text-indigo-600', label: 'Alert' };
  }
}

const ASSIGNMENT_TYPES = new Set([
  'assignment_accepted', 'assignment_declined', 'assignment_cascaded',
  'assignment_exhausted', 'assignment_expired',
]);

const NotificationBell: React.FC<NotificationBellProps> = ({
  projects, onProjectClick, isAdmin = false,
  pendingApprovals = [], onApprove, onReject, onSmartAssign,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [localNotifs, setLocalNotifs] = useState<LocalNotification[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'approvals'>('all');
  const [testPushStatus, setTestPushStatus] = useState<'idle' | 'sending' | 'sent' | 'blocked'>('idle');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { notifications: dbNotifs, unreadCount: dbUnread, markRead, markAllRead } = useDBNotifications();

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Generate time-based local notifications from project dates
  useEffect(() => {
    const generate = () => {
      const now = new Date();
      const next: LocalNotification[] = [];
      pruneOldNotifKeys();

      projects.forEach(project => {
        if (project.status === 'Completed' || project.status === 'Expired') return;

        if (project.eventDate) {
          try {
            const eventDateTime = new Date(`${project.eventDate}T${project.eventTime || '09:00'}`);
            if (!isNaN(eventDateTime.getTime()) && eventDateTime > now) {
              const hrs = differenceInHours(eventDateTime, now);
              const mins = differenceInMinutes(eventDateTime, now);
              if (hrs === 0 && mins > 0 && mins <= 60) {
                next.push({ id: `${project.id}-shoot-1h`, projectId: project.id, title: project.title, message: `Shoot starts in ${mins} minutes!`, type: 'shoot', urgency: 'high', timeStr: format(eventDateTime, 'h:mm a'), isRead: false, source: 'local', createdAt: new Date().toISOString() });
              } else if (hrs > 0 && hrs <= 24) {
                next.push({ id: `${project.id}-shoot-24h`, projectId: project.id, title: project.title, message: `Shoot tomorrow at ${format(eventDateTime, 'h:mm a')}`, type: 'shoot', urgency: 'medium', timeStr: format(eventDateTime, 'MMM d, h:mm a'), isRead: false, source: 'local', createdAt: new Date().toISOString() });
              }
            }
          } catch { /* ignore */ }
        }

        if (project.submissionDeadline) {
          try {
            const dl = new Date(`${project.submissionDeadline}T23:59:59`);
            if (!isNaN(dl.getTime()) && dl > now) {
              const hrs = differenceInHours(dl, now);
              if (hrs > 0 && hrs <= 24) {
                next.push({ id: `${project.id}-deadline-24h`, projectId: project.id, title: project.title, message: 'Submission deadline is tomorrow!', type: 'deadline', urgency: 'medium', timeStr: format(dl, 'MMM d'), isRead: false, source: 'local', createdAt: new Date().toISOString() });
              }
            }
          } catch { /* ignore */ }
        }
      });

      next.sort((a, b) => (a.urgency === 'high' ? -1 : 1) - (b.urgency === 'high' ? -1 : 1));

      setLocalNotifs(prev => {
        const prevMap = new Map(prev.map(n => [n.id, n]));
        let notifiedKeys: Record<string, number> = {};
        try { notifiedKeys = JSON.parse(localStorage.getItem('mmr_system_notifs') || '{}'); } catch { /* ignore */ }
        let changed = false;
        next.forEach(n => {
          if (!prevMap.has(n.id) && !notifiedKeys[n.id]) {
            if ('Notification' in window && Notification.permission === 'granted') {
              sendPushNotification(n.title, n.message, `mmr-${n.id}`);
            }
            notifiedKeys[n.id] = Date.now();
            changed = true;
          }
        });
        if (changed) localStorage.setItem('mmr_system_notifs', JSON.stringify(notifiedKeys));
        return next.map(n => { const ex = prevMap.get(n.id); return ex ? { ...n, isRead: ex.isRead } : n; });
      });
    };

    generate();
    const interval = setInterval(() => { if (document.visibilityState === 'visible') generate(); }, 60000);
    return () => clearInterval(interval);
  }, [projects]);

  // Request permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  }, []);

  const markLocalRead = (id: string) => setLocalNotifs(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  const markAllLocalRead = () => setLocalNotifs(prev => prev.map(n => ({ ...n, isRead: true })));

  const localUnread = localNotifs.filter(n => !n.isRead).length;
  const pendingCount = pendingApprovals.length;
  const totalBadge = dbUnread + localUnread + (isAdmin ? pendingCount : 0);

  const handleTestPush = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!('Notification' in window)) { setTestPushStatus('blocked'); setTimeout(() => setTestPushStatus('idle'), 2500); return; }
    if (Notification.permission === 'denied') { setTestPushStatus('blocked'); setTimeout(() => setTestPushStatus('idle'), 2500); return; }
    if (Notification.permission === 'default') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') { setTestPushStatus('blocked'); setTimeout(() => setTestPushStatus('idle'), 2500); return; }
    }
    setTestPushStatus('sending');
    try { await sendPushNotification('MMR Studio', 'Test notification — push is working! 🎬', 'mmr-test-push'); setTestPushStatus('sent'); }
    catch { setTestPushStatus('blocked'); }
    setTimeout(() => setTestPushStatus('idle'), 2500);
  };

  const handleMarkAllRead = async () => {
    markAllLocalRead();
    await markAllRead();
  };

  const allUnread = dbUnread + localUnread;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl transition-all group"
      >
        <Bell size={22} className="group-hover:rotate-12 transition-transform duration-300" />
        {totalBadge > 0 && (
          <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-gradient-to-tr from-rose-600 to-rose-400 rounded-full border-2 border-white animate-pulse shadow-sm" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-[380px] bg-slate-50/80 backdrop-blur-3xl rounded-[28px] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] border border-slate-200/60 z-50 overflow-hidden animate-in zoom-in-95 slide-in-from-top-4 duration-200">

          {/* Header */}
          <div className="p-5 border-b border-slate-200/60 flex flex-col gap-4 bg-white/80">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2">
                Notifications
                {totalBadge > 0 && <span className="bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full text-[10px] tracking-widest">{totalBadge}</span>}
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleTestPush}
                  disabled={testPushStatus === 'sending'}
                  title="Test Push"
                  className={`p-2 rounded-xl transition-all ${testPushStatus === 'sent' ? 'text-emerald-600 bg-emerald-50' : testPushStatus === 'blocked' ? 'text-rose-500 bg-rose-50' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
                >
                  {testPushStatus === 'sent' ? <Check size={16} className="text-emerald-500" /> : testPushStatus === 'blocked' ? <AlertTriangle size={16} className="text-rose-500" /> : <Bell size={16} />}
                </button>
                {allUnread > 0 && (
                  <button onClick={handleMarkAllRead} title="Mark all as read" className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all">
                    <CheckCircle size={16} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-2xl">
              {(['all', 'unread'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 ${activeTab === tab ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {tab}
                </button>
              ))}
              {isAdmin && (
                <button onClick={() => setActiveTab('approvals')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 relative ${activeTab === 'approvals' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  Approvals
                  {pendingCount > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[8px] font-black rounded-full flex items-center justify-center">{pendingCount}</span>}
                </button>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[440px] overflow-y-auto custom-scrollbar p-2 bg-slate-50/50">

            {/* Approvals tab */}
            {activeTab === 'approvals' && isAdmin ? (
              pendingApprovals.length === 0 ? (
                <div className="p-12 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 border-4 border-slate-50 shadow-sm"><UserCheck size={24} className="text-emerald-400" /></div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-1">All Clear</h4>
                  <p className="text-[10px] text-slate-400 font-bold">No pending approvals.</p>
                </div>
              ) : (
                <div className="space-y-1.5 pb-1">
                  {pendingApprovals.map(a => (
                    <div key={a.id} className="mx-1 p-4 rounded-[20px] border bg-white border-amber-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] relative overflow-hidden">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400" />
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-br from-amber-50 to-amber-100 text-amber-600"><UserCheck size={18} /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-amber-600">Approval Request</span>
                            <span className="text-[9px] font-bold text-slate-400 ml-auto">{new Date(a.requestedAt).toLocaleDateString()}</span>
                          </div>
                          <p className="text-[13px] text-slate-900 font-black tracking-tight truncate">
                            {a.type === 'delete' ? '🗑️ Delete' : a.type === 'create' ? '➕ Create' : '✏️ Edit'}: {a.entityTitle}
                          </p>
                          <p className="text-[11px] text-slate-500 font-medium mt-0.5">Requested by <span className="font-bold text-slate-700">{a.requestedBy}</span></p>
                          {a.type === 'edit' && (
                            <div className="mt-2 space-y-1">
                              {Object.entries(a.changes).slice(0, 3).map(([field, val]) => (
                                <div key={field} className="text-[10px] text-slate-400 font-medium">
                                  <span className="font-bold text-slate-600">{field}:</span>{' '}
                                  <span className="line-through text-rose-400">{String((val as any).before || '—').slice(0, 30)}</span>{' → '}
                                  <span className="text-emerald-600">{String((val as any).after || '—').slice(0, 30)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2 mt-3">
                            <button onClick={(e) => { e.stopPropagation(); onApprove?.(a.id); }} className="flex-1 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all flex items-center justify-center gap-1"><Check size={14} /> Approve</button>
                            <button onClick={(e) => { e.stopPropagation(); onReject?.(a.id); }} className="flex-1 py-2 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all flex items-center justify-center gap-1"><XCircle size={14} /> Reject</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              (() => {
                // Merge DB + local, filter for unread tab
                const dbItems = (activeTab === 'unread' ? dbNotifs.filter(n => !n.readAt) : dbNotifs);
                const localItems = (activeTab === 'unread' ? localNotifs.filter(n => !n.isRead) : localNotifs);
                const hasAny = dbItems.length > 0 || localItems.length > 0;

                if (!hasAny) return (
                  <div className="p-12 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 border-4 border-slate-50 shadow-sm"><Bell size={24} className="text-slate-300" /></div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-1">You're all caught up</h4>
                    <p className="text-[10px] text-slate-400 font-bold">No {activeTab === 'unread' ? 'unread ' : ''}notifications right now.</p>
                  </div>
                );

                return (
                  <div className="space-y-1.5 pb-1">
                    {/* DB notifications (assignment events) */}
                    {dbItems.map((n: DBNotification) => {
                      const style = dbNotifStyle(n.type);
                      const isRead = !!n.readAt;
                      const showSmartAssign = ASSIGNMENT_TYPES.has(n.type) && n.projectId && onSmartAssign &&
                        (n.type === 'assignment_declined' || n.type === 'assignment_exhausted' || n.type === 'assignment_cascaded');

                      return (
                        <div
                          key={n.id}
                          onClick={() => { if (n.projectId) { onProjectClick(n.projectId); setIsOpen(false); } if (!isRead) markRead(n.id); }}
                          className={`group mx-1 p-4 rounded-[20px] border transition-all duration-300 cursor-pointer overflow-hidden relative flex gap-4 ${isRead ? 'bg-white/80 border-slate-200/60 hover:border-slate-300 hover:shadow-sm' : 'bg-white border-white shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.1)] hover:-translate-y-0.5'}`}
                        >
                          {!isRead && <div className={`absolute left-0 top-0 bottom-0 w-1 ${n.urgency === 'high' ? 'bg-rose-500' : 'bg-indigo-500'}`} />}

                          <div className={`mt-0.5 shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-br ${style.bg} ${style.text} transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3`}>
                            {style.icon}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[9px] font-black uppercase tracking-widest ${n.urgency === 'high' ? 'text-rose-500' : 'text-indigo-500'}`}>{style.label}</span>
                              <span className="text-[9px] font-bold text-slate-400 ml-auto whitespace-nowrap">
                                {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                              </span>
                            </div>
                            <p className={`text-[13px] truncate ${isRead ? 'text-slate-600 font-bold' : 'text-slate-900 font-black tracking-tight'}`}>{n.title}</p>
                            <p className={`text-[11px] line-clamp-2 mt-0.5 leading-relaxed font-medium ${isRead ? 'text-slate-500' : 'text-slate-600'}`}>{n.message}</p>

                            {showSmartAssign && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onSmartAssign!(n.projectId!); setIsOpen(false); if (!isRead) markRead(n.id); }}
                                className="mt-2 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors"
                              >
                                <Zap size={9} /> Open Smart Assign
                              </button>
                            )}
                          </div>

                          {!isRead && (
                            <button
                              onClick={(e) => { e.stopPropagation(); markRead(n.id); }}
                              className="absolute right-4 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 opacity-0 transition-all duration-300 scale-90 group-hover:opacity-100 group-hover:scale-100 group-hover:bg-indigo-50 group-hover:text-indigo-600 group-hover:border-indigo-200"
                              title="Mark as read"
                            >
                              <Check size={14} />
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {/* Local time-based notifications */}
                    {localItems.map((n: LocalNotification) => (
                      <div
                        key={n.id}
                        onClick={() => { onProjectClick(n.projectId); setIsOpen(false); markLocalRead(n.id); }}
                        className={`group mx-1 p-4 rounded-[20px] border transition-all duration-300 cursor-pointer overflow-hidden relative flex gap-4 ${n.isRead ? 'bg-white/80 border-slate-200/60 hover:border-slate-300 hover:shadow-sm' : 'bg-white border-white shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.1)] hover:-translate-y-0.5'}`}
                      >
                        {!n.isRead && <div className={`absolute left-0 top-0 bottom-0 w-1 ${n.urgency === 'high' ? 'bg-rose-500' : 'bg-indigo-500'}`} />}
                        <div className={`mt-0.5 shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 ${n.type === 'shoot' ? 'bg-gradient-to-br from-rose-50 to-rose-100 text-rose-600' : 'bg-gradient-to-br from-indigo-50 to-indigo-100 text-indigo-600'}`}>
                          {n.type === 'shoot' ? <Clock size={18} /> : <CalendarIcon size={18} />}
                        </div>
                        <div className="flex-1 min-w-0 pr-6 relative">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[9px] font-black uppercase tracking-widest ${n.urgency === 'high' ? 'text-rose-500' : 'text-indigo-500'}`}>{n.urgency === 'high' ? 'Urgent' : 'Reminder'}</span>
                            <span className="text-[9px] font-bold text-slate-400 ml-auto whitespace-nowrap">{n.timeStr}</span>
                          </div>
                          <p className={`text-[13px] truncate ${n.isRead ? 'text-slate-600 font-bold' : 'text-slate-900 font-black tracking-tight'}`}>{n.title}</p>
                          <p className={`text-[11px] line-clamp-2 mt-0.5 leading-relaxed font-medium ${n.isRead ? 'text-slate-500' : 'text-slate-600'}`}>{n.message}</p>
                        </div>
                        {!n.isRead && (
                          <button
                            onClick={(e) => { e.stopPropagation(); markLocalRead(n.id); }}
                            className="absolute right-4 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 opacity-0 transition-all duration-300 scale-90 group-hover:opacity-100 group-hover:scale-100 group-hover:bg-indigo-50 group-hover:text-indigo-600 group-hover:border-indigo-200"
                            title="Mark as read"
                          >
                            <Check size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
