import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { analyticsApi, applicationsApi } from '../api';
import { useApp } from '../context/AppContext';
import Badge from '../components/common/Badge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

function StatCard({ label, value, sub, color = 'indigo', icon }) {
  const colors = {
    indigo: 'from-indigo-500 to-indigo-600',
    green:  'from-green-500 to-green-600',
    yellow: 'from-yellow-400 to-yellow-500',
    red:    'from-red-500 to-red-600',
    purple: 'from-purple-500 to-purple-600',
    blue:   'from-blue-500 to-blue-600',
  };
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
          <p className={`text-3xl font-bold mt-1 bg-gradient-to-r ${colors[color]} bg-clip-text text-transparent`}>
            {value}
          </p>
          {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>}
        </div>
        {icon && <span className="text-3xl opacity-80">{icon}</span>}
      </div>
    </div>
  );
}

function PipelineBar({ pipeline, total }) {
  if (!total) return <div className="text-sm text-gray-400">No applications yet</div>;
  const stages = [
    { key: 'pending', label: 'Pending', color: 'bg-yellow-400' },
    { key: 'got_call', label: 'Got Call', color: 'bg-blue-500' },
    { key: 'in_progress', label: 'In Progress', color: 'bg-purple-500' },
    { key: 'rejected', label: 'Rejected', color: 'bg-red-500' },
    { key: 'converted', label: 'Offer', color: 'bg-green-500' },
  ];
  return (
    <div className="space-y-3">
      <div className="flex h-4 rounded-full overflow-hidden gap-0.5">
        {stages.map(s => {
          const pct = ((pipeline[s.key] || 0) / total * 100).toFixed(1);
          if (!parseFloat(pct)) return null;
          return <div key={s.key} className={`${s.color} transition-all`} style={{ width: pct + '%' }} title={`${s.label}: ${pipeline[s.key]}`} />;
        })}
      </div>
      <div className="flex flex-wrap gap-3">
        {stages.map(s => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
            {s.label}: <span className="font-semibold text-gray-900 dark:text-white">{pipeline[s.key] || 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { overview, refreshOverview } = useApp();
  const [daily, setDaily] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [loadingDaily, setLoadingDaily] = useState(true);

  useEffect(() => {
    analyticsApi.daily(14).then(res => setDaily(res.data || [])).catch(() => {}).finally(() => setLoadingDaily(false));
    applicationsApi.pendingFollowups().then(res => setFollowups(res.data || [])).catch(() => {});
    refreshOverview();
  }, []);

  if (!overview) return <LoadingSpinner text="Loading dashboard..." />;

  const { applications, jobs, pipeline, referrals, followups: fu, conversionRates } = overview;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Good morning, Siddharth! 👋</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        {fu?.due > 0 && (
          <Link to="/applications?status=pending" className="flex items-center gap-2 px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 text-yellow-700 dark:text-yellow-300 text-sm font-medium rounded-lg hover:bg-yellow-100 transition-colors">
            <span>⏰</span> {fu.due} follow-up{fu.due > 1 ? 's' : ''} due
          </Link>
        )}
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Applied" value={applications.total} sub={`${applications.today} today`} color="indigo" icon="📋" />
        <StatCard label="Got Calls" value={pipeline.got_call + pipeline.in_progress + pipeline.converted} sub={`${conversionRates.callRate}% call rate`} color="blue" icon="📞" />
        <StatCard label="New Jobs" value={jobs.notApplied} sub={`${jobs.today} scraped today`} color="green" icon="💼" />
        <StatCard label="Offers" value={pipeline.converted} sub={pipeline.rejected + ' rejected'} color="purple" icon="🎉" />
      </div>

      {/* Charts + Pipeline */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Daily chart */}
        <div className="card p-5 lg:col-span-2">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Applications (Last 14 Days)</h2>
          {loadingDaily ? <LoadingSpinner size="sm" /> : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={daily}>
                <defs>
                  <linearGradient id="appGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tickFormatter={d => format(parseISO(d), 'dd MMM')} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v, n) => [v, n === 'applications' ? 'Applied' : 'Jobs Scraped']}
                  labelFormatter={d => format(parseISO(d), 'dd MMM yyyy')}
                />
                <Area type="monotone" dataKey="applications" stroke="#6366f1" fill="url(#appGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pipeline */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Application Pipeline</h2>
          <PipelineBar pipeline={pipeline} total={applications.total} />
          <div className="mt-6 space-y-3 border-t border-gray-100 dark:border-gray-700 pt-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Call Rate</span>
              <span className="font-bold text-blue-600">{conversionRates.callRate}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Offer Rate</span>
              <span className="font-bold text-green-600">{conversionRates.offerRate}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">This Week</span>
              <span className="font-bold text-indigo-600">{applications.thisWeek} applied</span>
            </div>
          </div>
        </div>
      </div>

      {/* Referrals + Follow-ups */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Referral stats */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">Referral Network</h2>
            <Link to="/referrals" className="text-xs text-indigo-600 hover:underline">View all →</Link>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { v: referrals.total, l: 'Found', c: 'text-gray-900 dark:text-white' },
              { v: referrals.contacted, l: 'Contacted', c: 'text-blue-600 dark:text-blue-400' },
              { v: referrals.responded, l: 'Responded', c: 'text-green-600 dark:text-green-400' },
            ].map(item => (
              <div key={item.l} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                <div className={`text-2xl font-bold ${item.c}`}>{item.v}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Follow-ups */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">Pending Follow-ups</h2>
            <Link to="/applications" className="text-xs text-indigo-600 hover:underline">View all →</Link>
          </div>
          {followups.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-6">
              <div className="text-3xl mb-2">✅</div>
              All caught up! No follow-ups due.
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {followups.slice(0, 5).map(app => (
                <Link
                  key={app.id}
                  to={`/applications/${app.id}`}
                  className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-100 dark:border-yellow-800/30 rounded-lg hover:bg-yellow-100 transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{app.company}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[180px]">{app.job_title}</div>
                  </div>
                  <Badge type={app.application_status} />
                </Link>
              ))}
              {followups.length > 5 && (
                <p className="text-xs text-gray-400 text-center">+{followups.length - 5} more</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
