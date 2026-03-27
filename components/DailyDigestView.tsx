import React, { useState } from 'react';
import {
  Sun, Camera, Clock, AlertTriangle, MessageSquare,
  TrendingUp, ChevronDown, ChevronUp, RefreshCw, X
} from 'lucide-react';
import { useAdminDigest } from '../src/hooks/useAdminDigest';
import { format, parseISO, formatDistanceToNow } from 'date-fns';

interface DailyDigestViewProps {
  onClose?: () => void;
}

export function DailyDigestView({ onClose }: DailyDigestViewProps) {
  const { digest, loading, error, refresh } = useAdminDigest();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="bg-white rounded-[28px] p-8 shadow-sm flex items-center justify-center gap-3 text-slate-400">
        <RefreshCw size={18} className="animate-spin" />
        <span className="text-sm font-semibold">Loading digest…</span>
      </div>
    );
  }

  if (error || !digest) {
    return (
      <div className="bg-white rounded-[28px] p-8 shadow-sm text-center text-slate-400">
        <p className="text-sm font-semibold">No digest available yet.</p>
        <p className="text-xs mt-1">Generated every morning at 8 AM IST.</p>
      </div>
    );
  }

  const generatedLabel = formatDistanceToNow(parseISO(digest.generatedAt), { addSuffix: true });

  const sections = [
    {
      key: 'shoots',
      icon: <Camera size={16} className="text-indigo-500" />,
      label: "Today's Shoots",
      count: digest.todaysShoots.length,
      accent: 'indigo',
      items: digest.todaysShoots,
      renderItem: (s: any) => (
        <div key={s.id} className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-0">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">{s.title}</p>
            <p className="text-xs text-slate-500">{s.client_name} · {s.event_time || 'Time TBD'} · {s.location || 'Location TBD'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'pending',
      icon: <Clock size={16} className="text-amber-500" />,
      label: 'Pending Confirmations',
      count: digest.pendingConfirmations.length,
      accent: 'amber',
      items: digest.pendingConfirmations,
      renderItem: (p: any) => (
        <div key={p.id} className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-0">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">
              {p.team_members?.name || 'Unknown'} — {p.role_needed}
            </p>
            <p className="text-xs text-slate-500">
              {p.projects?.title || 'Unknown project'} · sent {p.sent_at ? formatDistanceToNow(parseISO(p.sent_at), { addSuffix: true }) : ''}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'overdue',
      icon: <AlertTriangle size={16} className="text-rose-500" />,
      label: 'Overdue Projects',
      count: digest.overdueProjects.length,
      accent: 'rose',
      items: digest.overdueProjects,
      renderItem: (p: any) => (
        <div key={p.id} className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-0">
          <div className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-2 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">{p.title}</p>
            <p className="text-xs text-slate-500">
              {p.client_name} · was {p.event_date ? format(parseISO(p.event_date), 'd MMM') : '?'} · {p.status}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'quotes',
      icon: <MessageSquare size={16} className="text-sky-500" />,
      label: 'Quote Follow-ups',
      count: digest.quoteFollowUps.length,
      accent: 'sky',
      items: digest.quoteFollowUps,
      renderItem: (p: any) => (
        <div key={p.id} className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-0">
          <div className="w-1.5 h-1.5 rounded-full bg-sky-400 mt-2 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">{p.title}</p>
            <p className="text-xs text-slate-500">
              {p.client_name} · sent {p.created_at ? formatDistanceToNow(parseISO(p.created_at), { addSuffix: true }) : ''}
            </p>
          </div>
        </div>
      ),
    },
  ];

  const fmt = (n: number) =>
    n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : `₹${(n / 1000).toFixed(1)}k`;

  return (
    <div className="bg-white rounded-[28px] shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-50 rounded-2xl flex items-center justify-center">
            <Sun size={20} className="text-amber-500" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-800">Daily Briefing</h2>
            <p className="text-xs text-slate-400">Generated {generatedLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className="text-slate-400" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center transition-colors"
            >
              <X size={14} className="text-slate-400" />
            </button>
          )}
        </div>
      </div>

      {/* Revenue strip */}
      <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
        {[
          { label: 'This Month', value: fmt(digest.revenueThisMonth), color: 'text-emerald-600' },
          { label: 'Pipeline', value: fmt(digest.revenuePipeline), color: 'text-indigo-600' },
          { label: 'Outstanding', value: fmt(digest.revenueOutstanding), color: 'text-amber-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="px-4 py-3 text-center">
            <p className={`text-base font-black ${color}`}>{value}</p>
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Sections */}
      <div className="divide-y divide-slate-50">
        {sections.map(({ key, icon, label, count, items, renderItem }) => (
          <div key={key}>
            <button
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
              onClick={() => setExpanded(expanded === key ? null : key)}
            >
              <div className="flex items-center gap-3">
                {icon}
                <span className="text-sm font-bold text-slate-700">{label}</span>
                {count > 0 && (
                  <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
                    key === 'overdue' ? 'bg-rose-100 text-rose-600' :
                    key === 'pending' ? 'bg-amber-100 text-amber-600' :
                    key === 'shoots' ? 'bg-indigo-100 text-indigo-600' :
                    'bg-sky-100 text-sky-600'
                  }`}>
                    {count}
                  </span>
                )}
                {count === 0 && (
                  <span className="text-xs font-bold text-slate-300">All clear</span>
                )}
              </div>
              {count > 0 && (
                expanded === key
                  ? <ChevronUp size={14} className="text-slate-400" />
                  : <ChevronDown size={14} className="text-slate-400" />
              )}
            </button>

            {expanded === key && count > 0 && (
              <div className="px-6 pb-4">
                {items.map((item: any) => renderItem(item))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
