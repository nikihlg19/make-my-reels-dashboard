import React, { useState, useCallback, useRef } from 'react';
import { Settings, Smartphone, Mail, Bell } from 'lucide-react';
import { useUser } from '@clerk/react';
import { useNotificationPreferences } from '../hooks/useNotificationPreferences';
import { usePushSubscription } from '../hooks/usePushSubscription';
import { ChannelPreference, NotificationPreferences } from '../schemas';

const PREFERENCE_CATEGORIES = [
  { key: 'shoot_reminder_1h',  label: '1 Hour Shoot Reminders',  desc: 'Alerts right before a shoot starts' },
  { key: 'shoot_reminder_24h', label: '24 Hour Shoot Reminders', desc: "Daily roundup of tomorrow's shoots" },
  { key: 'deadline_reminder',  label: 'Delivery Deadlines',      desc: 'Approaching project submission deadlines' },
  { key: 'status_change',      label: 'Status Changes',          desc: 'When project statuses shift (e.g., In Progress → Review)' },
  { key: 'project_assigned',   label: 'Project Assignments',     desc: 'When you are assigned to a new project' },
  { key: 'payment_received',   label: 'Payments',                desc: 'Billing updates and payment confirmations' },
] as const;

function Toggle({ on, disabled, onClick }: { on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-10 h-6 rounded-full relative transition-colors shrink-0
        ${on ? 'bg-indigo-500' : 'bg-slate-200'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  );
}

export default function NotificationSettings() {
  const { user } = useUser();
  const userId = user?.id;
  const { preferences, isLoading, updatePreferences } = useNotificationPreferences(userId);
  const { isSupported, isSubscribed, subscribe } = usePushSubscription();

  // Track which (category, channel) pair is currently saving
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const quietHoursTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedUpdateQuietHours = useCallback((field: string, value: string) => {
    if (quietHoursTimer.current) clearTimeout(quietHoursTimer.current);
    quietHoursTimer.current = setTimeout(() => {
      updatePreferences({ [field]: value } as any);
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

    const key = `${category}.${channel}`;
    if (savingKey === key) return; // already saving this one

    // Turning push ON but browser not yet subscribed → trigger permission flow first
    if (channel === 'push' && !currentCatState.push && !isSubscribed) {
      const allowed = await subscribe(userId);
      if (!allowed) return;
    }

    setSavingKey(key);
    await updatePreferences({ [category]: { ...currentCatState, [channel]: !currentCatState[channel] } });
    setSavingKey(null);
  };

  const quietHoursEnabled = !!(preferences.quietHoursStart || preferences.quietHoursEnd);

  const handleQuietHoursToggle = async () => {
    if (quietHoursEnabled) {
      await updatePreferences({ quietHoursStart: undefined, quietHoursEnd: undefined });
    } else {
      await updatePreferences({ quietHoursStart: '22:00', quietHoursEnd: '08:00' });
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden text-slate-800 animate-in fade-in duration-300">

      {/* Header */}
      <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Bell size={20} className="text-indigo-600" /> Notification Preferences
          </h2>
          <p className="text-sm text-slate-500 mt-1">Control how and when you receive alerts.</p>
        </div>
        {isSupported && !isSubscribed && (
          <button
            onClick={() => subscribe(userId)}
            className="shrink-0 px-4 py-2 bg-indigo-50 text-indigo-700 text-sm font-bold rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-2"
          >
            <Smartphone size={16} /> Enable Push Notifications
          </button>
        )}
        {isSupported && isSubscribed && (
          <span className="shrink-0 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg flex items-center gap-1.5">
            <Smartphone size={13} /> Push Active
          </span>
        )}
      </div>

      {/* Preferences table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Notification Type</th>
              <th className="p-4 text-center text-xs font-black text-slate-500 uppercase tracking-widest w-24">
                <div className="flex flex-col items-center gap-1"><Bell size={14} className="text-slate-400" /> In-App</div>
              </th>
              <th className="p-4 text-center text-xs font-black text-slate-500 uppercase tracking-widest w-24">
                <div className="flex flex-col items-center gap-1"><Smartphone size={14} className="text-slate-400" /> Push</div>
              </th>
              <th className="p-4 text-center text-xs font-black text-slate-500 uppercase tracking-widest w-24">
                <div className="flex flex-col items-center gap-1"><Mail size={14} className="text-slate-400" /> Email</div>
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
                  <td className="p-4 text-center align-middle">
                    <Toggle
                      on={pref.in_app}
                      disabled={savingKey === `${key}.in_app`}
                      onClick={() => handleToggle(key as keyof NotificationPreferences, 'in_app')}
                    />
                  </td>
                  <td className="p-4 text-center align-middle">
                    <Toggle
                      on={pref.push}
                      disabled={savingKey === `${key}.push`}
                      onClick={() => handleToggle(key as keyof NotificationPreferences, 'push')}
                    />
                  </td>
                  <td className="p-4 text-center align-middle">
                    <Toggle
                      on={pref.email}
                      disabled={savingKey === `${key}.email`}
                      onClick={() => handleToggle(key as keyof NotificationPreferences, 'email')}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Quiet Hours */}
      <div className="p-6 bg-slate-50 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-bold text-sm">Quiet Hours</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              {quietHoursEnabled
                ? 'Non-critical push notifications are muted during these hours.'
                : 'Quiet hours are off — notifications arrive any time.'}
            </p>
          </div>
          <Toggle on={quietHoursEnabled} onClick={handleQuietHoursToggle} />
        </div>
        {quietHoursEnabled && (
          <div className="flex items-center gap-3 mt-4">
            <input
              type="time"
              key={`start-${preferences.quietHoursStart}`}
              className="px-3 py-1.5 rounded bg-white border border-slate-200 text-sm"
              defaultValue={preferences.quietHoursStart || '22:00'}
              onChange={(e) => debouncedUpdateQuietHours('quietHoursStart', e.target.value)}
            />
            <span className="text-slate-400 text-xs font-bold uppercase">to</span>
            <input
              type="time"
              key={`end-${preferences.quietHoursEnd}`}
              className="px-3 py-1.5 rounded bg-white border border-slate-200 text-sm"
              defaultValue={preferences.quietHoursEnd || '08:00'}
              onChange={(e) => debouncedUpdateQuietHours('quietHoursEnd', e.target.value)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
