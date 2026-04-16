import React from 'react';

const SkeletonCard = () => (
  <div className="bg-white rounded-xl p-4 shadow-sm space-y-3 animate-pulse">
    <div className="h-3 bg-slate-200 rounded w-3/4" />
    <div className="h-2 bg-slate-100 rounded w-1/2" />
    <div className="flex gap-2 mt-2">
      <div className="w-6 h-6 bg-slate-200 rounded-full" />
      <div className="w-6 h-6 bg-slate-200 rounded-full" />
    </div>
    <div className="flex justify-between items-center mt-2">
      <div className="h-2 bg-slate-100 rounded w-16" />
      <div className="h-5 bg-slate-200 rounded-full w-14" />
    </div>
  </div>
);

const BoardSkeleton: React.FC = () => (
  <div className="flex gap-4 p-4 h-full overflow-hidden">
    {['Expired', 'Quote Sent', 'To Do', 'In Progress'].map((col) => (
      <div key={col} className="flex-1 min-w-[260px] flex flex-col gap-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-4 bg-slate-200 rounded w-20 animate-pulse" />
          <div className="h-5 w-5 bg-slate-100 rounded-full animate-pulse" />
        </div>
        <SkeletonCard />
        <SkeletonCard />
        {col === 'To Do' && <SkeletonCard />}
      </div>
    ))}
  </div>
);

export default BoardSkeleton;
