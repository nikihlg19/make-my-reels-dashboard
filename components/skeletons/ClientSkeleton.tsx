import React from 'react';

const ClientCard = () => (
  <div className="bg-white rounded-xl p-4 shadow-sm animate-pulse space-y-3">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 bg-slate-200 rounded-full" />
      <div className="space-y-1.5 flex-1">
        <div className="h-3 bg-slate-200 rounded w-28" />
        <div className="h-2 bg-slate-100 rounded w-20" />
      </div>
    </div>
    <div className="h-2 bg-slate-100 rounded w-full" />
    <div className="flex justify-between">
      <div className="h-2 bg-slate-100 rounded w-16" />
      <div className="h-2 bg-slate-100 rounded w-12" />
    </div>
  </div>
);

const ClientSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 p-4">
    {Array.from({ length: 10 }).map((_, i) => (
      <ClientCard key={i} />
    ))}
  </div>
);

export default ClientSkeleton;
