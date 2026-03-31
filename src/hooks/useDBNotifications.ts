import { useState, useEffect, useCallback } from 'react';
import { useSession, useUser } from '@clerk/react';
import { createClerkSupabaseClient } from '../lib/supabase';

export interface DBNotification {
  id: string;
  userId: string;
  projectId: string | null;
  type: string;
  title: string;
  message: string;
  urgency: 'high' | 'medium' | 'low';
  readAt: string | null;
  createdAt: string;
}

function mapRow(row: any): DBNotification {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id ?? null,
    type: row.type,
    title: row.title,
    message: row.message,
    urgency: row.urgency || 'medium',
    readAt: row.read_at ?? null,
    createdAt: row.created_at,
  };
}

export function useDBNotifications() {
  const { session } = useSession();
  const { user } = useUser();
  const [notifications, setNotifications] = useState<DBNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = session ? createClerkSupabaseClient(session) : null;

  // Auto-register this user into notification_preferences so the API can find them
  useEffect(() => {
    if (!supabase || !user) return;
    supabase
      .from('notification_preferences')
      .upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true })
      .then(({ error }) => {
        if (error) console.warn('[notifications] failed to register user pref:', error.message);
        else console.log('[notifications] registered user_id:', user.id);
      });
  }, [user?.id, !!supabase]);

  const fetchNotifications = useCallback(async () => {
    if (!supabase || !user) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60);
    if (error) console.warn('[notifications] fetch error:', error.message);
    if (!error) setNotifications((data || []).map(mapRow));
    setLoading(false);
  }, [session, user?.id]);

  useEffect(() => {
    fetchNotifications();
    if (!supabase || !user) return;

    const channel = supabase
      .channel(`db_notifications_${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setNotifications(prev => [mapRow(payload.new), ...prev].slice(0, 60));
          } else if (payload.eventType === 'UPDATE') {
            setNotifications(prev => prev.map(n => n.id === payload.new.id ? mapRow(payload.new) : n));
          } else if (payload.eventType === 'DELETE') {
            setNotifications(prev => prev.filter(n => n.id !== (payload.old as any).id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchNotifications]);

  const markRead = useCallback(async (id: string) => {
    if (!supabase) return;
    const now = new Date().toISOString();
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, readAt: now } : n));
    const { error } = await supabase.from('notifications').update({ read_at: now }).eq('id', id);
    if (error) console.error('[notifications] markRead failed:', error.message, error.code);
    else console.log('[notifications] markRead ok:', id);
  }, [supabase]);

  const markAllRead = useCallback(async () => {
    if (!supabase || !user) return;
    const now = new Date().toISOString();
    setNotifications(prev => prev.map(n => ({ ...n, readAt: n.readAt ?? now })));
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: now })
      .eq('user_id', user.id)
      .is('read_at', null);
    if (error) console.error('[notifications] markAllRead failed:', error.message, error.code);
  }, [supabase, user?.id]);

  const unreadCount = notifications.filter(n => !n.readAt).length;

  return { notifications, loading, unreadCount, markRead, markAllRead };
}
