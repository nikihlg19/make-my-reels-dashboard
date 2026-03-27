import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { AdminDigest } from '../../types';

export function useAdminDigest() {
  const [digest, setDigest] = useState<AdminDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchLatest() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('admin_digests')
      .select('*')
      .order('generated_at', { ascending: false })
      .limit(1)
      .single();

    if (err && err.code !== 'PGRST116') {
      setError(err.message);
    } else if (data) {
      setDigest({
        id: data.id,
        generatedAt: data.generated_at,
        todaysShoots: data.todays_shoots || [],
        pendingConfirmations: data.pending_confirmations || [],
        quoteFollowUps: data.quote_follow_ups || [],
        overdueProjects: data.overdue_projects || [],
        revenueThisMonth: data.revenue_this_month ?? 0,
        revenuePipeline: data.revenue_pipeline ?? 0,
        revenueOutstanding: data.revenue_outstanding ?? 0,
      });
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchLatest();

    // Refresh whenever a new digest is inserted
    const channel = supabase
      .channel('admin-digest-watch')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_digests' },
        () => fetchLatest()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { digest, loading, error, refresh: fetchLatest };
}
