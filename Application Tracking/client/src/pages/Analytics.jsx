import { useState, useEffect } from 'react';
import { analyticsApi } from '../api';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, LineChart, Line } from 'recharts';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

// Refined chart palette aligned with the design system
const CHART_COLORS = {
  primary:  '#6366F1', // accent-500
  success:  '#10B981', // emerald-500
  info:     '#3B82F6', // blue-500
  warning:  '#F59E0B', // amber-500
  danger:   '#EF4444', // red-500
  violet:   '#8B5CF6', // violet-500
};

// Styled tooltip aligned with surface tokens
function ChartTooltip({ active, payload, label, labelFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-line rounded-lg shadow-lg px-3 py-2 text-2xs">
      {label != null && (
        <div className="text-ink-faint mb-1 tabular">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
          <span className="text-ink-muted">{p.name}</span>
          <span className="text-ink font-medium tabular ml-auto">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

const axisTickStyle = { fill: 'rgb(113 113 122)', fontSize: 11 };
const gridStroke = 'rgb(228 228 231 / 0.6)';

function Section({ eyebrow, title, children, action }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-4 gap-2">
        <div>
          {eyebrow && <p className="h-eyebrow">{eyebrow}</p>}
          <h3 className="h-section mt-1">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export default function Analytics() {
  const [daily, setDaily] = useState([]);
  const [byCompany, setByCompany] = useState([]);
  const [byRole, setByRole] = useState([]);
  const [byLocation, setByLocation] = useState([]);
  const [referralEff, setReferralEff] = useState(null);
  const [scrapeLogs, setScrapeLogs] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      analyticsApi.daily(30).then(r => setDaily(r.data || [])),
      analyticsApi.byCompany().then(r => setByCompany(r.data || [])),
      analyticsApi.byRole().then(r => setByRole(r.data || [])),
      analyticsApi.byLocation().then(r => setByLocation(r.data || [])),
      analyticsApi.referralEffectiveness().then(r => setReferralEff(r.data)),
      analyticsApi.scrapeLogs().then(r => setScrapeLogs(r.data)),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner text="Loading analytics…" />;

  const topCompanies = byCompany.filter(c => c.applications > 0).slice(0, 10);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="h-eyebrow">Insights</p>
          <h1 className="h-page mt-1">Analytics</h1>
          <p className="text-2xs text-ink-faint mt-1">Track your job search performance.</p>
        </div>
        <button
          onClick={() => { analyticsApi.export(); toast.success('Downloading export…'); }}
          className="btn-secondary"
        >
          Export JSON
        </button>
      </div>

      {/* Daily activity */}
      <Section eyebrow="Activity" title="Applications & Jobs Scraped (Last 30 Days)">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="1 1" stroke={gridStroke} vertical={false} />
            <XAxis dataKey="date"
                   tickFormatter={d => format(parseISO(d), 'dd/MM')}
                   tick={axisTickStyle}
                   axisLine={false}
                   tickLine={false} />
            <YAxis allowDecimals={false}
                   tick={axisTickStyle}
                   axisLine={false}
                   tickLine={false} />
            <Tooltip content={<ChartTooltip labelFormatter={d => format(parseISO(d), 'dd MMM yyyy')} />} />
            <Line type="monotone" dataKey="applications" stroke={CHART_COLORS.primary} strokeWidth={2} name="Applied" dot={false} />
            <Line type="monotone" dataKey="jobs_scraped" stroke={CHART_COLORS.success} strokeWidth={2} name="Scraped" dot={false} strokeDasharray="3 3" />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
          </LineChart>
        </ResponsiveContainer>
      </Section>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* By Company */}
        <Section eyebrow="Companies" title="Top Companies Applied">
          {topCompanies.length === 0 ? (
            <p className="text-sm text-ink-faint text-center py-6">No applications yet</p>
          ) : (
            <div className="space-y-3">
              {topCompanies.map((c, i) => (
                <div key={c.company} className="flex items-center gap-3">
                  <span className="text-2xs text-ink-faint w-5 shrink-0 tabular">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-ink truncate">{c.company}</span>
                      <span className="text-2xs text-ink-faint shrink-0 ml-2 tabular">{c.applications} applied</span>
                    </div>
                    <div className="w-full bg-surface-sunken rounded-full h-1">
                      <div
                        className="h-1 rounded-full"
                        style={{
                          width: `${(c.applications / topCompanies[0].applications) * 100}%`,
                          background: CHART_COLORS.primary,
                        }}
                      />
                    </div>
                  </div>
                  {c.calls > 0 && (
                    <span className="badge bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20
                                     dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20 shrink-0">
                      {c.calls} calls
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* By Role */}
        <Section eyebrow="Role Type" title="Applications by Role Type">
          {byRole.length === 0 ? (
            <p className="text-sm text-ink-faint text-center py-6">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byRole.filter(r => r.applications > 0)} layout="vertical"
                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="1 1" stroke={gridStroke} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={axisTickStyle} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="role_category" width={120} tick={axisTickStyle} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgb(228 228 231 / 0.3)' }} />
                <Bar dataKey="applications" fill={CHART_COLORS.primary} name="Applied" radius={[0, 4, 4, 0]} />
                <Bar dataKey="calls"        fill={CHART_COLORS.success} name="Calls"   radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>

        {/* By Location */}
        <Section eyebrow="Location" title="Applications by Location">
          {byLocation.filter(l => l.applications > 0).length === 0 ? (
            <p className="text-sm text-ink-faint text-center py-6">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byLocation.filter(l => l.applications > 0).slice(0, 8)}
                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="1 1" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="location" tick={axisTickStyle} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={axisTickStyle} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgb(228 228 231 / 0.3)' }} />
                <Bar dataKey="applications" fill={CHART_COLORS.violet}  name="Applied" radius={[4, 4, 0, 0]} />
                <Bar dataKey="calls"        fill={CHART_COLORS.success} name="Calls"   radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>

        {/* Referral Effectiveness */}
        {referralEff && (
          <Section eyebrow="Referrals" title="Referral Effectiveness">
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-accent-500/5 ring-1 ring-inset ring-accent-500/20 rounded-lg p-4 text-center">
                <div className="text-2xl font-semibold tabular tracking-tighter text-accent-600 dark:text-accent-400">
                  {referralEff.callRateWithRef}%
                </div>
                <div className="h-eyebrow mt-2">Call rate WITH referral</div>
                <div className="text-2xs text-ink-faint tabular">{referralEff.withReferral?.total || 0} apps</div>
              </div>
              <div className="bg-surface-sunken border border-line rounded-lg p-4 text-center">
                <div className="text-2xl font-semibold tabular tracking-tighter text-ink-muted">
                  {referralEff.callRateWithoutRef}%
                </div>
                <div className="h-eyebrow mt-2">Call rate WITHOUT referral</div>
                <div className="text-2xs text-ink-faint tabular">{referralEff.withoutReferral?.total || 0} apps</div>
              </div>
            </div>
            {referralEff.byConnectionType?.length > 0 && (
              <div className="space-y-2">
                <p className="h-eyebrow">Response by connection type</p>
                {referralEff.byConnectionType.filter(c => c.total > 0).map(c => (
                  <div key={c.connection_type} className="flex items-center justify-between text-sm">
                    <span className="text-ink-muted capitalize">{c.connection_type.replace('_', ' ')}</span>
                    <span className="text-ink-faint tabular">
                      {c.responses}/{c.total} responded
                      <span className="ml-2 font-medium text-accent-600 dark:text-accent-400">
                        ({c.total > 0 ? Math.round((c.responses / c.total) * 100) : 0}%)
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}
      </div>

      {/* Scrape Logs */}
      {scrapeLogs && (
        <Section eyebrow="System" title="Scraper Performance">
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            {scrapeLogs.summary?.map(s => (
              <div key={s.platform} className="bg-surface-sunken border border-line rounded-lg p-3 text-center">
                <div className="h-eyebrow mb-1">{s.platform}</div>
                <div className="text-xl font-semibold text-ink tabular">{s.total_new}</div>
                <div className="text-2xs text-ink-faint tabular">new jobs ({s.runs} runs)</div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-2xs">
              <thead>
                <tr className="text-ink-faint text-left">
                  <th className="h-eyebrow pb-2 font-semibold">Platform</th>
                  <th className="h-eyebrow pb-2 font-semibold">Found</th>
                  <th className="h-eyebrow pb-2 font-semibold">New</th>
                  <th className="h-eyebrow pb-2 font-semibold">Status</th>
                  <th className="h-eyebrow pb-2 font-semibold">When</th>
                </tr>
              </thead>
              <tbody>
                {scrapeLogs.logs?.slice(0, 10).map(log => (
                  <tr key={log.id} className="border-t border-line">
                    <td className="py-2 font-medium text-ink">{log.platform}</td>
                    <td className="py-2 text-ink-muted tabular">{log.jobs_found}</td>
                    <td className="py-2 text-emerald-600 dark:text-emerald-400 tabular">{log.jobs_new}</td>
                    <td className="py-2">
                      <span className={`badge ${
                        log.status === 'success'
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20'
                          : 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="py-2 text-ink-faint tabular">{log.ran_at ? format(parseISO(log.ran_at), 'dd MMM HH:mm') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
