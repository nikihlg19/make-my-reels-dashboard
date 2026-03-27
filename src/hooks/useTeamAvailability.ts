import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@clerk/react';
import type { TeamAvailability } from '../../types';

function mapRow(r: any): TeamAvailability {
  return {
    id: r.id,
    teamMemberId: r.team_member_id,
    unavailableFrom: r.unavailable_from,
    unavailableTo: r.unavailable_to,
    reason: r.reason,
  };
}

export function useTeamAvailability(memberId?: string) {
  const { session } = useSession();
  const [availability, setAvailability] = useState<TeamAvailability[]>([]);
  const [loading, setLoading] = useState(false);

  const getHeaders = useCallback(async () => {
    const token = await session?.getToken();
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }, [session]);

  const fetch = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const url = memberId ? `/api/team/availability?memberId=${memberId}` : '/api/team/availability';
    const res = await window.fetch(url, { headers: await getHeaders() });
    const data = await res.json();
    setAvailability((data || []).map(mapRow));
    setLoading(false);
  }, [session, memberId]);

  useEffect(() => { fetch(); }, [fetch]);

  const addBlock = useCallback(async (
    teamMemberId: string,
    unavailableFrom: string,
    unavailableTo: string,
    reason?: string
  ) => {
    const res = await window.fetch('/api/team/availability', {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ teamMemberId, unavailableFrom, unavailableTo, reason }),
    });
    const data = await res.json();
    if (res.ok) setAvailability(prev => [...prev, mapRow(data)]);
    return res.ok;
  }, [getHeaders]);

  const removeBlock = useCallback(async (id: string) => {
    const res = await window.fetch(`/api/team/availability?id=${id}`, {
      method: 'DELETE',
      headers: await getHeaders(),
    });
    if (res.ok) setAvailability(prev => prev.filter(a => a.id !== id));
    return res.ok;
  }, [getHeaders]);

  return { availability, loading, addBlock, removeBlock, refresh: fetch };
}
