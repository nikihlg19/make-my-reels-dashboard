import React from 'react';
import { AssignmentStatus } from '../types';
import { CheckCircle, XCircle, Clock, Send, Ban } from 'lucide-react';

interface AssignmentStatusBadgeProps {
  status: AssignmentStatus;
  size?: 'sm' | 'md';
}

const CONFIG: Record<AssignmentStatus, { label: string; className: string; Icon: React.FC<any> }> = {
  pending:   { label: 'Pending',   className: 'bg-slate-100 text-slate-500',   Icon: Clock },
  wa_sent:   { label: 'Sent',      className: 'bg-amber-50 text-amber-600',    Icon: Send },
  accepted:  { label: 'Accepted',  className: 'bg-emerald-50 text-emerald-600',Icon: CheckCircle },
  declined:  { label: 'Declined',  className: 'bg-rose-50 text-rose-600',      Icon: XCircle },
  expired:   { label: 'Expired',   className: 'bg-orange-50 text-orange-600',  Icon: Clock },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-400',   Icon: Ban },
};

export const AssignmentStatusBadge: React.FC<AssignmentStatusBadgeProps> = ({ status, size = 'md' }) => {
  const { label, className, Icon } = CONFIG[status] || CONFIG.pending;
  const textClass = size === 'sm' ? 'text-[8px]' : 'text-[9px]';
  const iconSize = size === 'sm' ? 8 : 10;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${textClass} ${className}`}>
      <Icon size={iconSize} className="shrink-0" />
      {label}
    </span>
  );
};

/** Small colored dot only — for use inside avatar stacks */
export const AssignmentStatusDot: React.FC<{ status: AssignmentStatus }> = ({ status }) => {
  const dotColor: Record<AssignmentStatus, string> = {
    pending:   'bg-slate-300',
    wa_sent:   'bg-amber-400',
    accepted:  'bg-emerald-500',
    declined:  'bg-rose-500',
    expired:   'bg-orange-400',
    cancelled: 'bg-slate-200',
  };

  return (
    <span
      className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${dotColor[status] || 'bg-slate-300'}`}
      title={status}
    />
  );
};
