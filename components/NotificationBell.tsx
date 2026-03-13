import React, { useState, useEffect, useRef } from 'react';
import { Bell, Clock, Calendar as CalendarIcon, X, CheckCircle, Check, AlertTriangle } from 'lucide-react';
import { Project } from '../types';
import { format, differenceInHours, differenceInMinutes } from 'date-fns';

interface NotificationBellProps {
  projects: Project[];
  onProjectClick: (projectId: string) => void;
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
  } catch {
    // Ignore parse errors
  }
}

const NotificationBell: React.FC<NotificationBellProps> = ({ projects, onProjectClick }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
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
            // Ignore parse errors
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
            // Ignore parse errors
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
        const notifiedKeys: Record<string, number> = JSON.parse(localStorage.getItem('mmr_system_notifs') || '{}');
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
    const interval = setInterval(generateNotifications, 60000);
    return () => clearInterval(interval);
  }, [projects]);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;

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
    } catch {
      setTestPushStatus('blocked');
    }
    setTimeout(() => setTestPushStatus('idle'), 2500);
  };

  const testPushLabel = testPushStatus === 'sending' ? 'Sending...'
    : testPushStatus === 'sent' ? 'Sent!'
    : testPushStatus === 'blocked' ? 'Blocked'
    : 'Test Push';

  const testPushIcon = testPushStatus === 'sent'
    ? <Check size={10} className="text-emerald-500" />
    : testPushStatus === 'blocked'
    ? <AlertTriangle size={10} className="text-rose-500" />
    : <Bell size={10} />;

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white animate-pulse" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden animate-in slide-in-from-top-2">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Notifications</h3>
            <div className="flex items-center gap-3">
              <button 
                type="button"
                onClick={handleTestPush}
                disabled={testPushStatus === 'sending'}
                className={`text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer active:scale-95 transition-all ${
                  testPushStatus === 'sent' ? 'text-emerald-600' 
                  : testPushStatus === 'blocked' ? 'text-rose-500' 
                  : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {testPushIcon} {testPushLabel}
              </button>
              {unreadCount > 0 && (
                <button 
                  onClick={markAllAsRead}
                  className="text-[9px] font-bold text-indigo-600 hover:text-indigo-700 uppercase tracking-wider flex items-center gap-1"
                >
                  <CheckCircle size={10} /> Mark all read
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center justify-center text-slate-400">
                <Bell size={32} className="mb-3 opacity-20" />
                <p className="text-[10px] font-black uppercase tracking-widest">All caught up!</p>
                <p className="text-xs mt-1">No upcoming shoots or deadlines.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {notifications.map(notif => (
                  <div 
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif.projectId)}
                    className={`p-4 hover:bg-slate-50 transition-colors cursor-pointer relative group ${notif.isRead ? 'opacity-60' : 'bg-indigo-50/30'}`}
                  >
                    <div className="flex gap-3">
                      <div className={`mt-0.5 shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${notif.type === 'shoot' ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'}`}>
                        {notif.type === 'shoot' ? <Clock size={14} /> : <CalendarIcon size={14} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-slate-900 truncate pr-4">{notif.title}</p>
                          {!notif.isRead && (
                            <button 
                              onClick={(e) => markAsRead(notif.id, e)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-200 rounded-full absolute right-2 top-3"
                              title="Mark as read"
                            >
                              <X size={12} className="text-slate-400" />
                            </button>
                          )}
                        </div>
                        <p className={`text-xs mt-0.5 ${notif.urgency === 'high' ? 'text-rose-600 font-bold' : 'text-slate-600'}`}>
                          {notif.message}
                        </p>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-2">
                          {notif.timeStr}
                        </p>
                      </div>
                    </div>
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
