import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@clerk/react';
import { createClerkSupabaseClient } from '../lib/supabase';
import { NotificationPreferences, NotificationPreferencesSchema } from '../schemas';
import { toast } from 'sonner';

/**
 * Hook to manage notification preferences for the current user.
 * Uses the Clerk-authed Supabase client so RLS policies pass correctly.
 */
export function useNotificationPreferences(userId?: string) {
  const { session } = useSession();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getClient = useCallback(() => {
    return session ? createClerkSupabaseClient(session) : null;
  }, [session]);

  useEffect(() => {
    async function loadPrefs() {
      const supabase = getClient();
      if (!supabase || !userId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading preferences:', error);
        toast.error('Failed to load notification settings');
      }

      if (data) {
        const mapped = {
          userId: data.user_id,
          shoot_reminder_1h: data.shoot_reminder_1h,
          shoot_reminder_24h: data.shoot_reminder_24h,
          deadline_reminder: data.deadline_reminder,
          status_change: data.status_change,
          project_assigned: data.project_assigned,
          overdue_alert: data.overdue_alert,
          payment_received: data.payment_received,
          quietHoursStart: data.quiet_hours_start,
          quietHoursEnd: data.quiet_hours_end,
          timezone: data.timezone,
        };
        try {
          setPreferences(NotificationPreferencesSchema.parse(mapped));
        } catch (e) {
          console.error('Schema config error:', e);
        }
      } else {
        // First time — use schema defaults
        setPreferences(NotificationPreferencesSchema.parse({ userId }));
      }

      setIsLoading(false);
    }

    loadPrefs();
  }, [userId, session]);

  const updatePreferences = async (newPrefs: Partial<NotificationPreferences>) => {
    const supabase = getClient();
    if (!preferences || !supabase) return false;

    const previous = preferences;
    const updated = { ...preferences, ...newPrefs };
    setPreferences(updated as NotificationPreferences);

    const dbPayload = {
      user_id: updated.userId,
      shoot_reminder_1h: updated.shoot_reminder_1h,
      shoot_reminder_24h: updated.shoot_reminder_24h,
      deadline_reminder: updated.deadline_reminder,
      status_change: updated.status_change,
      project_assigned: updated.project_assigned,
      overdue_alert: updated.overdue_alert,
      payment_received: updated.payment_received,
      quiet_hours_start: updated.quietHoursStart ?? null,
      quiet_hours_end: updated.quietHoursEnd ?? null,
      timezone: updated.timezone,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('notification_preferences')
      .upsert(dbPayload, { onConflict: 'user_id' });

    if (error) {
      console.error('Error saving preferences:', error);
      toast.error('Failed to save settings');
      setPreferences(previous);
      return false;
    }

    toast.success('Settings saved');
    return true;
  };

  return {
    preferences,
    isLoading,
    updatePreferences,
  };
}
