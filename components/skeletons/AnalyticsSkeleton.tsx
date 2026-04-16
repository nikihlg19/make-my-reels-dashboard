import React from 'react';

const StatCard = () => (
  <div className="bg-white rounded-xl p-5 shadow-sm animate-pulse">
    <div className="h-2 bg-slate-100 rounded w-20 mb-3" />
    <div className="h-6 bg-slate-200 rounded w-24" />
  </div>
);

const ChartBlock = () => (
  <div className="bg-white rounded-xl p-5 shadow-sm animate-pulse">
    <div className="h-3 bg-slate-200 rounded w-32 mb-4" />
    <div className="h-48 bg-slate-100 rounded-lg" />
  </div>
);

const AnalyticsSkeleton: React.FC = () => (
  <div className="p-4 space-y-4">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard />
      <StatCard />
      <StatCard />
      <StatCard />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartBlock />
      <ChartBlock />
    </div>
  </div>
);

export default AnalyticsSkeleton;
