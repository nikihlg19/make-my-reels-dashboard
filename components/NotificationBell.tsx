import React, { useState, useEffect, useRef } from 'react';
import { Bell, Clock, Calendar as CalendarIcon, X, CheckCircle, Check, AlertTriangle, UserCheck, XCircle } from 'lucide-react';
import { Project, PendingApproval } from '../types';
import { format, differenceInHours, differenceInMinutes } from 'date-fns';

interface NotificationBellProps {
  projects: Project[];
  onProjectClick: (projectId: string) => void;
  isAdmin?: boolean;
  pendingApprovals?: PendingApproval[];
  onApprove?: (approvalId: string) => void;
  onReject?: (approvalId: string) => void;
}

interface AppNotification {
  id: string;
  projectId: string;
  title: string;
  message: string;
  type: 'shoot' | 'deadline';
  urgency: 'high' | 'medium';
  timeStr: string;
  isRead: boolean;
}

// --- Helper: Send push notification via Service Worker first, then fallback ---
async function sendPushNotification(title: string, body: string, tag?: string, url?: string) {
  const options: NotificationOptions & { vibrate?: number[]; badge?: string; requireInteraction?: boolean; actions?: any[]; data?: any } = {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: tag || 'mmr-notification',
    vibrate: [100, 50, 100, 50, 200],
    requireInteraction: false,
    data: { url: url || '/' },
  };

  // Prefer Service Worker showNotification (works on mobile / PWA)
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, options);
      return;
    } catch (swErr) {
      console.warn('SW showNotification failed, falling back:', swErr);
    }
  }

  // Fallback: standard Notification constructor (desktop only)
  try {
    new Notification(title, { body: options.body, icon: options.icon, tag: options.tag });
  } catch (fallbackErr) {
    console.warn('Fallback Notification() also failed:', fallbackErr);
  }
}

// --- Helper: Prune old dedup keys older than 48 hours ---
function pruneOldNotifKeys() {
  try {
    const raw = localStorage.getItem('mmr_system_notifs');
    if (!raw) return;
    const keys: Record<string, number | boolean> = JSON.parse(raw);
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    let changed = false;
    for (const key of Object.keys(keys)) {
      const val = keys[key];
      // Old format used `true`, treat as expired
      if (val === true || (typeof val === 'number' && val < cutoff)) {
        delete keys[key];
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem('mmr_system_notifs', JSON.stringify(keys));
    }
  } catch (e) {
    console.error('Failed to parse notification data:', e);
  }
}

const NotificationBell: React.FC<NotificationBellProps> = ({ projects, onProjectClick, isAdmin = false, pendingApprovals = [], onApprove, onReject }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'approvals'>('all');
  const [testPushStatus, setTestPushStatus] = useState<'idle' | 'sending' | 'sent' | 'blocked'>('idle');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Generate notifications based on current time
  useEffect(() => {
    const generateNotifications = () => {
      const now = new Date();
      const newNotifs: AppNotification[] = [];

      // Prune old dedup keys on each cycle
      pruneOldNotifKeys();

      projects.forEach(project => {
        if (project.status === 'Completed' || project.status === 'Expired') return;

        // Check Shoot Date — for any active project (To Do, In Progress, Quote Sent)
        if (project.eventDate) {
          try {
            const eventDateStr = project.eventDate;
            const eventTimeStr = project.eventTime || '09:00';
            const eventDateTime = new Date(`${eventDateStr}T${eventTimeStr}`);
            
            if (!isNaN(eventDateTime.getTime()) && eventDateTime > now) {
              const hoursDiff = differenceInHours(eventDateTime, now);
              const minsDiff = differenceInMinutes(eventDateTime, now);

              // 1 Hour Before Notification
              if (hoursDiff === 0 && minsDiff > 0 && minsDiff <= 60) {
                newNotifs.push({
                  id: `${project.id}-shoot-1h`,
                  projectId: project.id,
                  title: project.title,
                  message: `Shoot starts in ${minsDiff} minutes!`,
                  type: 'shoot',
                  urgency: 'high',
                  timeStr: format(eventDateTime, 'h:mm a'),
                  isRead: false
                });
              } 
              // 24 Hours Before Notification
              else if (hoursDiff > 0 && hoursDiff <= 24) {
                newNotifs.push({
                  id: `${project.id}-shoot-24h`,
                  projectId: project.id,
                  title: project.title,
                  message: `Shoot scheduled for tomorrow at ${format(eventDateTime, 'h:mm a')}`,
                  type: 'shoot',
                  urgency: 'medium',
                  timeStr: format(eventDateTime, 'MMM d, h:mm a'),
                  isRead: false
                });
              }
            }
          } catch (e) {
            console.error('Failed to parse shoot date:', e);
          }
        }

        // Check Deadline
        if (project.submissionDeadline) {
          try {
            const deadlineDateStr = project.submissionDeadline;
            const deadlineDateTime = new Date(`${deadlineDateStr}T23:59:59`);
            
            if (!isNaN(deadlineDateTime.getTime()) && deadlineDateTime > now) {
              const hoursDiff = differenceInHours(deadlineDateTime, now);

              if (hoursDiff > 0 && hoursDiff <= 24) {
                newNotifs.push({
                  id: `${project.id}-deadline-24h`,
                  projectId: project.id,
                  title: project.title,
                  message: `Submission deadline is tomorrow!`,
                  type: 'deadline',
                  urgency: 'medium',
                  timeStr: format(deadlineDateTime, 'MMM d'),
                  isRead: false
                });
              }
            }
          } catch (e) {
            console.error('Failed to parse deadline date:', e);
          }
        }
      });

      // Sort: High urgency first
      newNotifs.sort((a, b) => {
        if (a.urgency === 'high' && b.urgency !== 'high') return -1;
        if (a.urgency !== 'high' && b.urgency === 'high') return 1;
        return 0;
      });

      setNotifications(prev => {
        const prevMap = new Map<string, AppNotification>(prev.map(n => [n.id, n]));
        
        // Check for newly added notifications to trigger system push
        let notifiedKeys: Record<string, number> = {};
        try { notifiedKeys = JSON.parse(localStorage.getItem('mmr_system_notifs') || '{}'); } catch (e) { console.error('Corrupted notification localStorage data:', e); }
        let hasNewSystemNotifs = false;

        newNotifs.forEach(n => {
          if (!prevMap.has(n.id) && !notifiedKeys[n.id]) {
            if ('Notification' in window && Notification.permission === 'granted') {
              sendPushNotification(n.title, n.message, `mmr-${n.id}`);
            }
            notifiedKeys[n.id] = Date.now(); // Store timestamp for pruning
            hasNewSystemNotifs = true;
          }
        });

        if (hasNewSystemNotifs) {
          localStorage.setItem('mmr_system_notifs', JSON.stringify(notifiedKeys));
        }

        return newNotifs.map(n => {
          const existing = prevMap.get(n.id);
          if (existing) {
            return { ...n, isRead: existing.isRead };
          }
          return n;
        });
      });
    };

    generateNotifications();
    // Only poll when tab is visible to save battery
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        generateNotifications();
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [projects]);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const pendingCount = pendingApprovals.length;
  const totalBadge = unreadCount + (isAdmin ? pendingCount : 0);

  const markAsRead = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const handleNotificationClick = (projectId: string) => {
    onProjectClick(projectId);
    setIsOpen(false);
  };

  const handleTestPush = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!('Notification' in window)) {
      setTestPushStatus('blocked');
      setTimeout(() => setTestPushStatus('idle'), 2500);
      return;
    }

    if (Notification.permission === 'denied') {
      setTestPushStatus('blocked');
      setTimeout(() => setTestPushStatus('idle'), 2500);
      return;
    }

    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setTestPushStatus('blocked');
        setTimeout(() => setTestPushStatus('idle'), 2500);
        return;
      }
    }

    setTestPushStatus('sending');
    try {
      await sendPushNotification(
        'MMR Studio',
        'Test notification — push is working! 🎬',
        'mmr-test-push'
      );
      setTestPushStatus('sent');
    } catch (e) {
      console.error('Push notification test failed:', e);
      setTestPushStatus('blocked');
    }
    setTimeout(() => setTestPushStatus('idle'), 2500);
  };

  const testPushLabel = testPushStatus === 'sending' ? 'Sending...'
    : testPushStatus === 'sent' ? 'Sent!'
    : testPushStatus === 'blocked' ? 'Blocked'
    : 'Test Push';

  const testPushIcon = testPushStatus === 'sent'
    ? <Check size={16} className="text-emerald-500" />
    : testPushStatus === 'blocked'
    ? <AlertTriangle size={16} className="text-rose-500" />
    : <Bell size={16} />;

  const displayedNotifications = activeTab === 'unread'
    ? notifications.filter(n => !n.isRead) 
    : notifications;

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
          <div className="p-5 border-b border-slate-200/60 flex flex-col gap-4 bg-white/80">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2">
                Notifications
                {totalBadge > 0 && (
                  <span className="bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full text-[10px] tracking-widest">{totalBadge}</span>
                )}
              </h3>
              <div className="flex items-center gap-1">
                <button 
                  onClick={handleTestPush} 
                  disabled={testPushStatus === 'sending'}
                  title="Test Push Notification" 
                  className={`p-2 rounded-xl transition-all ${
                    testPushStatus === 'sent' ? 'text-emerald-600 bg-emerald-50' 
                    : testPushStatus === 'blocked' ? 'text-rose-500 bg-rose-50' 
                    : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
                  }`}
                >
                  {testPushIcon}
                </button>
                {unreadCount > 0 && (
                  <button 
                    onClick={markAllAsRead} 
                    title="Mark all as read" 
                    className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                  >
                    <CheckCircle size={16} />
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-2xl">
              <button 
                onClick={() => setActiveTab('all')} 
                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 ${activeTab === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                All
              </button>
              <button 
                onClick={() => setActiveTab('unread')} 
                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 ${activeTab === 'unread' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Unread
              </button>
              {isAdmin && (
                <button 
                  onClick={() => setActiveTab('approvals')} 
                  className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 relative ${activeTab === 'approvals' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Approvals
                  {pendingCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[8px] font-black rounded-full flex items-center justify-center">{pendingCount}</span>
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto custom-scrollbar p-2 bg-slate-50/50">
            {activeTab === 'approvals' && isAdmin ? (
              pendingApprovals.length === 0 ? (
                <div className="p-12 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 border-4 border-slate-50 shadow-sm">
                    <UserCheck size={24} className="text-emerald-400" />
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-1">All Clear</h4>
                  <p className="text-[10px] text-slate-400 font-bold">No pending approvals from team.</p>
                </div>
              ) : (
                <div className="space-y-1.5 flex flex-col pb-1">
                  {pendingApprovals.map(a => (
                    <div key={a.id} className="mx-1 p-4 rounded-[20px] border bg-white border-amber-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden relative">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400" />
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-br from-amber-50 to-amber-100 text-amber-600">
                          <UserCheck size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-amber-600">Approval Request</span>
                            <span className="text-[9px] font-bold text-slate-400 ml-auto">{new Date(a.requestedAt).toLocaleDateString()}</span>
                          </div>
                          <p className="text-[13px] text-slate-900 font-black tracking-tight truncate">
                            {a.type === 'delete' ? '🗑️ Delete' : a.type === 'create' ? '➕ Create' : '✏️ Edit'}: {a.entityTitle}
                          </p>
                          <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                            Requested by <span className="font-bold text-slate-700">{a.requestedBy}</span>
                          </p>
                          {a.type === 'edit' && (
                            <div className="mt-2 space-y-1">
                              {Object.entries(a.changes).slice(0, 3).map(([field, val]) => (
                                <div key={field} className="text-[10px] text-slate-400 font-medium">
                                  <span className="font-bold text-slate-600">{field}:</span>{' '}
                                  <span className="line-through text-rose-400">{String(val.before || '—').slice(0, 30)}</span>{' → '}
                                  <span className="text-emerald-600">{String(val.after || '—').slice(0, 30)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2 mt-3">
                            <button 
                              onClick={(e) => { e.stopPropagation(); onApprove?.(a.id); }}
                              className="flex-1 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all flex items-center justify-center gap-1"
                            >
                              <Check size={14} /> Approve
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); onReject?.(a.id); }}
                              className="flex-1 py-2 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all flex items-center justify-center gap-1"
                            >
                              <XCircle size={14} /> Reject
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : displayedNotifications.length === 0 ? (
              <div className="p-12 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 border-4 border-slate-50 shadow-sm">
                  <Bell size={24} className="text-slate-300" />
                </div>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-1">You're all caught up</h4>
                <p className="text-[10px] text-slate-400 font-bold">No {activeTab === 'unread' ? 'unread ' : ''}notifications right now.</p>
              </div>
            ) : (
              <div className="space-y-1.5 flex flex-col pb-1">
                {displayedNotifications.map(notif => (
                  <div 
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif.projectId)}
                    className={`group mx-1 p-4 rounded-[20px] border transition-all duration-300 cursor-pointer overflow-hidden relative flex gap-4 ${
                      notif.isRead 
                        ? 'bg-white/80 border-slate-200/60 hover:border-slate-300 hover:shadow-sm' 
                        : 'bg-white border-white shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.1)] hover:-translate-y-0.5'
                    }`}
                  >
                    {/* Unread Accent Bar */}
                    {!notif.isRead && (
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${notif.urgency === 'high' ? 'bg-rose-500' : 'bg-indigo-500'}`} />
                    )}
                    
                    <div className={`mt-0.5 shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 ${
                      notif.type === 'shoot' 
                        ? 'bg-gradient-to-br from-rose-50 to-rose-100 text-rose-600' 
                        : 'bg-gradient-to-br from-indigo-50 to-indigo-100 text-indigo-600'
                    }`}>
                       {notif.type === 'shoot' ? <Clock size={18} /> : <CalendarIcon size={18} />}
                    </div>
                    <div className="flex-1 min-w-0 pr-6 relative">
                       <div className="flex items-center gap-2 mb-1">
                         <span className={`text-[9px] font-black uppercase tracking-widest ${notif.urgency === 'high' ? 'text-rose-500' : 'text-indigo-500'}`}>
                           {notif.urgency === 'high' ? 'Urgent' : 'Reminder'}
                         </span>
                         <span className="text-[9px] font-bold text-slate-400 ml-auto whitespace-nowrap">{notif.timeStr}</span>
                       </div>
                       <p className={`text-[13px] truncate ${notif.isRead ? 'text-slate-600 font-bold' : 'text-slate-900 font-black tracking-tight'}`}>
                         {notif.title}
                       </p>
                       <p className={`text-[11px] line-clamp-2 mt-0.5 leading-relaxed font-medium ${notif.isRead ? 'text-slate-500' : 'text-slate-600'}`}>
                         {notif.message}
                       </p>
                    </div>
                    
                    {/* Mark read button inside the absolute overlay space */}
                    {!notif.isRead && (
                      <button 
                        onClick={(e) => markAsRead(notif.id, e)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 opacity-0 transition-all duration-300 scale-90 group-hover:opacity-100 group-hover:scale-100 group-hover:bg-indigo-50 group-hover:text-indigo-600 group-hover:border-indigo-200"
                        title="Mark as read"
                      >
                        <Check size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
