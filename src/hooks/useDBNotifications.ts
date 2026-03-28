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

  const fetchNotifications = useCallback(async () => {
    if (!supabase || !user) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60);
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
    await supabase.from('notifications').update({ read_at: now }).eq('id', id);
  }, [supabase]);

  const markAllRead = useCallback(async () => {
    if (!supabase || !user) return;
    const now = new Date().toISOString();
    setNotifications(prev => prev.map(n => ({ ...n, readAt: n.readAt ?? now })));
    await supabase
      .from('notifications')
      .update({ read_at: now })
      .eq('user_id', user.id)
      .is('read_at', null);
  }, [supabase, user?.id]);

  const unreadCount = notifications.filter(n => !n.readAt).length;

  return { notifications, loading, unreadCount, markRead, markAllRead };
}
