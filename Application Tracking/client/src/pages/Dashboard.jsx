import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { analyticsApi, applicationsApi } from '../api';
import { useApp } from '../context/AppContext';
import Badge from '../components/common/Badge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';

// ── Icons ─────────────────────────────────────────────────────
const ChevronRight = (p) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"
       strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M6 4l4 4-4 4"/>
  </svg>
);
const BellIcon = (p) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"
       strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M3.5 12 3 11.5c1-.7 1-3 1-4a4 4 0 1 1 8 0c0 1 0 3.3 1 4l-.5.5h-9Z"/>
    <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0"/>
  </svg>
);
const CheckIcon = (p) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M5 10.5l3.5 3.5L15 7"/>
  </svg>
);

// ── Stat cell — lives inside the single stats-bar card ────────
function StatCell({ label, value, sub, dot }) {
  return (
    <div className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
        <span className="h-eyebrow">{label}</span>
      </div>
      <div className="tabular text-[30px] font-semibold text-ink leading-none tracking-tighter">
        {value}
      </div>
      {sub && <p className="text-2xs text-ink-faint mt-2 leading-relaxed">{sub}</p>}
    </div>
  );
}

// ── Pipeline stages ────────────────────────────────────────────
const STAGES = [
  { key: 'pending',     label: 'Pending',     bar: 'bg-amber-400',  dot: 'bg-amber-400'  },
  { key: 'got_call',    label: 'Got Call',    bar: 'bg-blue-500',   dot: 'bg-blue-500'   },
  { key: 'in_progress', label: 'In Progress', bar: 'bg-violet-500', dot: 'bg-violet-500' },
  { key: 'rejected',    label: 'Rejected',    bar: 'bg-rose-400',   dot: 'bg-rose-400'   },
  { key: 'converted',   label: 'Offer',       bar: 'bg-emerald-500',dot: 'bg-emerald-500'},
];

function PipelineBar({ pipeline, total }) {
  if (!total) {
    return <p className="text-2xs text-ink-faint py-2">No applications yet.</p>;
  }
  return (
    <div className="space-y-4">
      {/* Segmented bar */}
      <div className="flex h-1.5 rounded-full overflow-hidden gap-px bg-line/40">
        {STAGES.map(s => {
          const pct = ((pipeline[s.key] || 0) / total) * 100;
          return pct > 0 ? (
            <div key={s.key} className={s.bar} style={{ width: pct + '%' }}
                 title={`${s.label}: ${pipeline[s.key]}`} />
          ) : null;
        })}
      </div>
      {/* Legend */}
      <div className="space-y-2.5">
        {STAGES.map(s => (
          <div key={s.key} className="flex items-center gap-2.5">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
            <span className="text-2xs text-ink-muted flex-1">{s.label}</span>
            <span className="tabular text-2xs font-semibold text-ink">
              {pipeline[s.key] || 0}
            </span>
            <span className="tabular text-2xs text-ink-faint w-8 text-right">
              {Math.round(((pipeline[s.key] || 0) / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Custom chart tooltip ───────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-line rounded-lg shadow-lg px-3 py-2 text-2xs">
      <div className="text-ink-faint mb-1.5 tabular">
        {label ? format(parseISO(label), 'EEE, d MMM') : ''}
      </div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-ink-muted">{p.name}</span>
          <span className="tabular font-semibold text-ink ml-auto pl-4">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────
export default function Dashboard() {
  const { overview, refreshOverview } = useApp();
  const [daily,       setDaily]       = useState([]);
  const [followups,   setFollowups]   = useState([]);
  const [loadingChart,setLoadingChart]= useState(true);

  useEffect(() => {
    refreshOverview();
    analyticsApi.daily(14)
      .then(r => setDaily(r.data || []))
      .catch(() => {})
      .finally(() => setLoadingChart(false));
    applicationsApi.pendingFollowups()
      .then(r => setFollowups(r.data || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!overview) return <LoadingSpinner text="Loading dashboard…" />;

  const { applications, jobs, pipeline, referrals, followups: fu, conversionRates } = overview;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const callsTotal = (pipeline.got_call || 0) + (pipeline.in_progress || 0) + (pipeline.converted || 0);
  const responseRate = referrals.contacted > 0
    ? Math.round((referrals.responded / referrals.contacted) * 100)
    : 0;

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="h-eyebrow">Overview</p>
          <h1 className="h-page mt-1">{greeting}, Siddharth.</h1>
          <p className="text-2xs text-ink-faint mt-1">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
            })}
          </p>
        </div>
        {fu?.due > 0 && (
          <Link
            to="/applications"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg
                       bg-amber-50 ring-1 ring-inset ring-amber-600/20 text-amber-700
                       dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30
                       text-[13px] font-medium hover:bg-amber-100 dark:hover:bg-amber-500/20
                       transition-colors"
          >
            <BellIcon className="w-3.5 h-3.5" />
            <span className="tabular">{fu.due}</span> follow-up{fu.due > 1 ? 's' : ''} due
          </Link>
        )}
      </div>

      {/* ── Stats bar — one card, four divided cells ──────────── */}
      <div className="card grid grid-cols-2 lg:grid-cols-4
                      divide-x divide-y lg:divide-y-0 divide-line overflow-hidden">
        <StatCell
          label="Applied"   dot="bg-accent-500"
          value={applications.total}
          sub={`${applications.today} today · ${applications.thisWeek} this week`}
        />
        <StatCell
          label="Got Calls" dot="bg-blue-500"
          value={callsTotal}
          sub={`${conversionRates.callRate}% call rate`}
        />
        <StatCell
          label="New Jobs"  dot="bg-emerald-500"
          value={jobs.notApplied}
          sub={`${jobs.today} scraped today`}
        />
        <StatCell
          label="Offers"    dot="bg-amber-500"
          value={pipeline.converted || 0}
          sub={`${pipeline.rejected || 0} rejected`}
        />
      </div>

      {/* ── Two-column body ───────────────────────────────────── */}
      <div className="grid lg:grid-cols-5 gap-5">

        {/* ─── Left (3/5) ─────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-5">

          {/* Activity chart */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="h-eyebrow">Activity</p>
                <h2 className="h-section mt-1">Applications · last 14 days</h2>
              </div>
              <div className="flex items-center gap-3.5 text-2xs text-ink-faint">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-500" />Applied
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-5 border-t-[1.5px] border-dashed border-emerald-500" />Scraped
                </span>
              </div>
            </div>
            {loadingChart ? (
              <div className="h-[200px] flex items-center justify-center">
                <LoadingSpinner size="sm" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={daily} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradApp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#6366F1" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradScrape" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#10B981" stopOpacity={0.12} />
                      <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tickFormatter={d => format(parseISO(d), 'd MMM')}
                    tick={{ fontSize: 11, fill: 'rgb(113 113 122)' }}
                    axisLine={false} tickLine={false} dy={6}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'rgb(113 113 122)' }}
                    axisLine={false} tickLine={false} width={24}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ stroke: 'rgb(212 212 216)', strokeWidth: 1, strokeDasharray: '3 3' }}
                  />
                  <Area
                    type="monotone" dataKey="jobs_scraped" name="Scraped"
                    stroke="#10B981" strokeWidth={1.5} strokeDasharray="4 3"
                    fill="url(#gradScrape)" dot={false}
                  />
                  <Area
                    type="monotone" dataKey="applications" name="Applied"
                    stroke="#6366F1" strokeWidth={2}
                    fill="url(#gradApp)" dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Follow-ups */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="h-eyebrow">Action items</p>
                <h2 className="h-section mt-1">Pending follow-ups</h2>
              </div>
              <Link
                to="/applications"
                className="inline-flex items-center gap-1 text-2xs text-ink-faint
                           hover:text-ink transition-colors"
              >
                View all <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {followups.length === 0 ? (
              <div className="flex flex-col items-center py-8 rounded-xl
                              bg-surface-sunken border border-line text-center">
                <div className="w-9 h-9 rounded-full mb-3
                                bg-emerald-50 dark:bg-emerald-500/10
                                flex items-center justify-center">
                  <CheckIcon className="w-[18px] h-[18px] text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-[13px] font-medium text-ink">All caught up</p>
                <p className="text-2xs text-ink-faint mt-0.5">No follow-ups due right now</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {followups.slice(0, 6).map(app => (
                  <Link
                    key={app.id}
                    to="/applications"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg
                               border border-transparent
                               hover:border-line hover:bg-surface-sunken
                               transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-ink leading-snug truncate">
                        {app.company}
                      </div>
                      <div className="text-2xs text-ink-faint truncate mt-0.5">
                        {app.job_title}
                      </div>
                    </div>
                    <Badge type={app.application_status} />
                    <ChevronRight className="w-3.5 h-3.5 text-ink-faint flex-shrink-0
                                             opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ))}
                {followups.length > 6 && (
                  <p className="text-2xs text-center text-ink-faint pt-2">
                    +{followups.length - 6} more
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ─── Right (2/5) ────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Pipeline */}
          <div className="card p-5">
            <div className="mb-5">
              <p className="h-eyebrow">Funnel</p>
              <h2 className="h-section mt-1">Application pipeline</h2>
            </div>
            <PipelineBar pipeline={pipeline} total={applications.total} />
            {applications.total > 0 && (
              <div className="mt-5 pt-4 border-t border-line space-y-2.5">
                {[
                  { label: 'Call rate',  value: `${conversionRates.callRate}%` },
                  { label: 'Offer rate', value: `${conversionRates.offerRate}%` },
                  { label: 'This week',  value: `${applications.thisWeek} applied` },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between">
                    <span className="text-2xs text-ink-muted">{row.label}</span>
                    <span className="tabular text-[13px] font-semibold text-ink">{row.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Referral network */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="h-eyebrow">Network</p>
                <h2 className="h-section mt-1">Referral pipeline</h2>
              </div>
              <Link
                to="/referrals"
                className="inline-flex items-center gap-1 text-2xs text-ink-faint
                           hover:text-ink transition-colors"
              >
                View all <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { v: referrals.total,     l: 'Found',     dot: 'bg-zinc-400'    },
                { v: referrals.contacted, l: 'Contacted', dot: 'bg-blue-500'    },
                { v: referrals.responded, l: 'Responded', dot: 'bg-emerald-500' },
              ].map(item => (
                <div key={item.l}
                     className="bg-surface-sunken border border-line rounded-xl p-3.5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.dot}`} />
                    <span className="text-2xs text-ink-faint">{item.l}</span>
                  </div>
                  <div className="tabular text-xl font-semibold text-ink tracking-tighter">
                    {item.v}
                  </div>
                </div>
              ))}
            </div>

            {referrals.contacted > 0 && (
              <div className="mt-3.5 pt-3.5 border-t border-line">
                <div className="flex items-center justify-between">
                  <span className="text-2xs text-ink-muted">Response rate</span>
                  <span className="tabular text-[13px] font-semibold text-ink">
                    {responseRate}%
                  </span>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
