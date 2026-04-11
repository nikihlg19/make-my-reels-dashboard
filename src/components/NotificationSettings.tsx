import React, { useState, useCallback, useRef } from 'react';
import { Settings, Smartphone, Mail, Bell, Send, ExternalLink, X, Loader2 } from 'lucide-react';
import { useUser, useAuth } from '@clerk/react';
import { useNotificationPreferences } from '../hooks/useNotificationPreferences';
import { usePushSubscription } from '../hooks/usePushSubscription';
import { ChannelPreference, NotificationPreferences } from '../schemas';

const PREFERENCE_CATEGORIES = [
  { key: 'shoot_reminder_1h', label: '1 Hour Shoot Reminders', desc: 'Alerts right before a shoot starts' },
  { key: 'shoot_reminder_24h', label: '24 Hour Shoot Reminders', desc: 'Daily roundup of tomorrow\'s shoots' },
  { key: 'deadline_reminder', label: 'Delivery Deadlines', desc: 'Approaching project submission deadlines' },
  { key: 'status_change', label: 'Status Changes', desc: 'When project statuses shift (e.g., In Progress -> Review)' },
  { key: 'project_assigned', label: 'Project Assignments', desc: 'When you are assigned to a new project' },
  { key: 'payment_received', label: 'Payments', desc: 'Billing updates and payment confirmations' },
] as const;

export default function NotificationSettings() {
  const { user } = useUser();
  const userId = user?.id;
  const { getToken } = useAuth();
  const { preferences, isLoading, updatePreferences, telegramChatId, disconnectTelegram } = useNotificationPreferences(userId);
  const { isSupported, isSubscribed, subscribe } = usePushSubscription();
  const [isSaving, setIsSaving] = useState(false);
  const [isConnectingTelegram, setIsConnectingTelegram] = useState(false);
  const quietHoursTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleConnectTelegram = useCallback(async () => {
    setIsConnectingTelegram(true);
    try {
      const jwt = await getToken({ template: 'supabase' });
      const res = await fetch('/api/telegram/create-link', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!res.ok) throw new Error('Failed to create link');
      const { token } = await res.json();
      const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME;
      if (!botUsername) { alert('Telegram bot not configured'); return; }
      window.open(`https://t.me/${botUsername}?start=${token}`, '_blank');
    } catch (err) {
      console.error('[telegram] connect error:', err);
      alert('Failed to generate Telegram link. Please try again.');
    } finally {
      setIsConnectingTelegram(false);
    }
  }, [getToken]);

  const debouncedUpdateQuietHours = useCallback((field: string, value: string) => {
    if (quietHoursTimer.current) clearTimeout(quietHoursTimer.current);
    quietHoursTimer.current = setTimeout(() => {
      updatePreferences({ [field]: value });
    }, 800);
  }, [updatePreferences]);

  if (isLoading || !preferences) {
    return (
      <div className="p-8 flex items-center justify-center text-slate-400">
        <div className="animate-pulse flex items-center gap-2">
          <Settings size={16} className="animate-spin" /> Loading settings...
        </div>
      </div>
    );
  }

  const handleToggle = async (category: keyof NotificationPreferences, channel: keyof ChannelPreference) => {
    const currentCatState = preferences[category] as ChannelPreference | undefined;
    if (!currentCatState) return;

    // If enabling push, explicitly trigger permission flow
    if (channel === 'push' && !currentCatState.push && !isSubscribed) {
      const allowed = await subscribe(userId);
      if (!allowed) return; // User denied or error
    }

    const updatedCategory = { ...currentCatState, [channel]: !currentCatState[channel] };
    
    setIsSaving(true);
    await updatePreferences({ [category]: updatedCategory });
    setIsSaving(false);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden text-slate-800 animate-in fade-in duration-300">
      <div className="p-6 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Bell size={20} className="text-indigo-600" /> Notification Preferences
          </h2>
          <p className="text-sm text-slate-500 mt-1">Control how and when you receive alerts.</p>
        </div>
        
        {isSupported && !isSubscribed && (
          <button 
            onClick={() => subscribe(userId)}
            className="px-4 py-2 bg-indigo-50 text-indigo-700 text-sm font-bold rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-2"
          >
            <Smartphone size={16} /> Enable Push Notifications
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Notification Type</th>
              <th className="p-4 text-center text-xs font-black text-slate-500 uppercase tracking-widest w-24">
                <div className="flex flex-col items-center gap-1">
                  <Bell size={16} className="text-slate-400" /> In-App
                </div>
              </th>
              <th className="p-4 text-center text-xs font-black text-slate-500 uppercase tracking-widest w-24">
                <div className="flex flex-col items-center gap-1">
                  <Smartphone size={16} className="text-slate-400" /> Push
                </div>
              </th>
              <th className="p-4 text-center text-xs font-black text-slate-500 uppercase tracking-widest w-24">
                <div className="flex flex-col items-center gap-1">
                  <Mail size={16} className="text-slate-400" /> Email
                </div>
              </th>
              <th className="p-4 text-center text-xs font-black text-slate-500 uppercase tracking-widest w-24">
                <div className="flex flex-col items-center gap-1">
                  <Send size={16} className="text-slate-400" /> Telegram
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {PREFERENCE_CATEGORIES.map(({ key, label, desc }) => {
              const pref = preferences[key as keyof NotificationPreferences] as ChannelPreference | undefined;
              if (!pref) return null;
              
              return (
                <tr key={key} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4">
                    <div className="font-semibold text-sm">{label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                  </td>
                  
                  {/* In-App Toggle */}
                  <td className="p-4 text-center align-middle">
                    <button 
                      disabled={isSaving}
                      onClick={() => handleToggle(key as keyof NotificationPreferences, 'in_app')}
                      className={`w-10 h-6 rounded-full relative transition-colors ${pref.in_app ? 'bg-indigo-500' : 'bg-slate-200'} ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${pref.in_app ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </td>
                  
                  {/* Push Toggle */}
                  <td className="p-4 text-center align-middle">
                    <button 
                      disabled={isSaving || (pref.push && !isSubscribed)} // Disallow toggling push off if system isn't even subscribed? No, let them toggle preferences independent of browser state if they want, but show warning.
                      onClick={() => handleToggle(key as keyof NotificationPreferences, 'push')}
                      className={`w-10 h-6 rounded-full relative transition-colors ${pref.push ? 'bg-indigo-500' : 'bg-slate-200'} ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${pref.push ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </td>
                  
                  {/* Email Toggle */}
                  <td className="p-4 text-center align-middle">
                    <button
                      disabled={isSaving}
                      onClick={() => handleToggle(key as keyof NotificationPreferences, 'email')}
                      className={`w-10 h-6 rounded-full relative transition-colors ${pref.email ? 'bg-indigo-500' : 'bg-slate-200'} ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${pref.email ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </td>

                  {/* Telegram Toggle */}
                  <td className="p-4 text-center align-middle">
                    <button
                      disabled={isSaving || !telegramChatId}
                      title={!telegramChatId ? 'Connect Telegram first' : undefined}
                      onClick={() => handleToggle(key as keyof NotificationPreferences, 'telegram')}
                      className={`w-10 h-6 rounded-full relative transition-colors ${!telegramChatId ? 'bg-slate-100 cursor-not-allowed' : pref.telegram ? 'bg-indigo-500' : 'bg-slate-200'} ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${pref.telegram && telegramChatId ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {/* Telegram Connection Section */}
      <div className="p-6 border-t border-slate-100 flex items-center justify-between">
        <div>
          <h4 className="font-bold text-sm flex items-center gap-2">
            <Send size={16} className="text-blue-500" /> Telegram Notifications
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            {telegramChatId
              ? 'Connected — you will receive notifications in Telegram.'
              : 'Connect your Telegram to receive instant phone notifications.'}
          </p>
        </div>
        {telegramChatId ? (
          <button
            onClick={disconnectTelegram}
            className="px-4 py-2 bg-red-50 text-red-600 text-sm font-bold rounded-lg hover:bg-red-100 transition-colors flex items-center gap-2"
          >
            <X size={16} /> Disconnect
          </button>
        ) : (
          <button
            onClick={handleConnectTelegram}
            disabled={isConnectingTelegram}
            className="px-4 py-2 bg-blue-50 text-blue-700 text-sm font-bold rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isConnectingTelegram ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
            {isConnectingTelegram ? 'Generating link...' : 'Connect Telegram'}
          </button>
        )}
      </div>

      {/* Quiet Hours Section */}
      <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
         <div>
            <h4 className="font-bold text-sm">Quiet Hours</h4>
            <p className="text-xs text-slate-500">Mute non-critical push notifications during these hours.</p>
         </div>
         <div className="flex items-center gap-3">
            <input 
              type="time" 
              className="px-3 py-1.5 rounded bg-white border border-slate-200 text-sm"
              defaultValue={preferences.quietHoursStart || "22:00"}
              onChange={(e) => debouncedUpdateQuietHours('quietHoursStart', e.target.value)}
            />
            <span className="text-slate-400 text-xs font-bold uppercase">To</span>
            <input 
              type="time" 
              className="px-3 py-1.5 rounded bg-white border border-slate-200 text-sm"
              defaultValue={preferences.quietHoursEnd || "08:00"}
              onChange={(e) => debouncedUpdateQuietHours('quietHoursEnd', e.target.value)}
            />
         </div>
      </div>
    </div>
  );
};
