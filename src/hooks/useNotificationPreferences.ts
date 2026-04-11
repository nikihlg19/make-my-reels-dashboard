import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { NotificationPreferences, NotificationPreferencesSchema } from '../schemas';
import { toast } from 'sonner';

/**
 * Hook to manage notification preferences for the current user.
 */
export function useNotificationPreferences(userId?: string) {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [telegramChatId, setTelegramChatId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadPrefs() {
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
        
      if (error && error.code !== 'PGRST116') { // PGRST116 is "No rows found", which is fine for first load
        console.error('Error loading preferences:', error);
        toast.error('Failed to load notification settings');
      }
      
      if (data) {
        setTelegramChatId(data.telegram_chat_id || null);

        // Map DB snake_case to schema camelCase where necessary
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
          timezone: data.timezone
        };
        try {
          const validated = NotificationPreferencesSchema.parse(mapped);
          setPreferences(validated);
        } catch (e) {
          console.error("Schema config error:", e);
        }
      } else {
        // Defaults if none exist
        setPreferences(NotificationPreferencesSchema.parse({ userId }));
      }
      
      setIsLoading(false);
    }
    
    loadPrefs();
  }, [userId]);

  const updatePreferences = async (newPrefs: Partial<NotificationPreferences>) => {
    if (!preferences || !supabase) return false;

    const previous = preferences;
    const updated = { ...preferences, ...newPrefs };
    // Optimistic UI update
    setPreferences(updated as NotificationPreferences);
    
    // Reverse map camelCase to snake_case for DB
    const dbPayload = {
      user_id: updated.userId,
      shoot_reminder_1h: updated.shoot_reminder_1h,
      shoot_reminder_24h: updated.shoot_reminder_24h,
      deadline_reminder: updated.deadline_reminder,
      status_change: updated.status_change,
      project_assigned: updated.project_assigned,
      overdue_alert: updated.overdue_alert,
      payment_received: updated.payment_received,
      quiet_hours_start: updated.quietHoursStart,
      quiet_hours_end: updated.quietHoursEnd,
      timezone: updated.timezone,
      updated_at: new Date().toISOString()
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
    
    toast.success('Notification settings updated');
    return true;
  };

  const disconnectTelegram = async () => {
    if (!supabase || !userId) return false;
    const { error } = await supabase
      .from('notification_preferences')
      .update({ telegram_chat_id: null })
      .eq('user_id', userId);
    if (error) {
      toast.error('Failed to disconnect Telegram');
      return false;
    }
    setTelegramChatId(null);
    toast.success('Telegram disconnected');
    return true;
  };

  return {
    preferences,
    isLoading,
    updatePreferences,
    telegramChatId,
    disconnectTelegram,
  };
}
