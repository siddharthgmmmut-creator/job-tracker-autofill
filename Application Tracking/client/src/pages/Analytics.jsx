import { useState, useEffect } from 'react';
import { analyticsApi } from '../api';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

function SectionCard({ title, children }) {
  return (
    <div className="card p-5">
      <h3 className="font-semibold text-gray-900 dark:text-white mb-4">{title}</h3>
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

  if (loading) return <LoadingSpinner text="Loading analytics..." />;

  const topCompanies = byCompany.filter(c => c.applications > 0).slice(0, 10);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Track your job search performance</p>
        </div>
        <button
          onClick={() => { analyticsApi.export(); toast.success('Downloading export...'); }}
          className="btn-secondary"
        >
          ↓ Export JSON
        </button>
      </div>

      {/* Daily activity */}
      <SectionCard title="📅 Applications & Jobs Scraped (Last 30 Days)">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={daily}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="date" tickFormatter={d => format(parseISO(d), 'dd/MM')} tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip labelFormatter={d => format(parseISO(d), 'dd MMM yyyy')} />
            <Line type="monotone" dataKey="applications" stroke="#6366f1" strokeWidth={2} name="Applied" dot={false} />
            <Line type="monotone" dataKey="jobs_scraped" stroke="#22c55e" strokeWidth={2} name="Scraped" dot={false} strokeDasharray="4 4" />
            <Legend />
          </LineChart>
        </ResponsiveContainer>
      </SectionCard>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* By Company */}
        <SectionCard title="🏢 Top Companies Applied">
          {topCompanies.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No applications yet</p>
          ) : (
            <div className="space-y-2">
              {topCompanies.map((c, i) => (
                <div key={c.company} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-5 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.company}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 ml-2">{c.applications} applied</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                      <div
                        className="bg-indigo-500 h-1.5 rounded-full"
                        style={{ width: `${(c.applications / topCompanies[0].applications) * 100}%` }}
                      />
                    </div>
                  </div>
                  {c.calls > 0 && (
                    <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 shrink-0">{c.calls} calls</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* By Role */}
        <SectionCard title="💼 Applications by Role Type">
          {byRole.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byRole.filter(r => r.applications > 0)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="role_category" width={120} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="applications" fill="#6366f1" name="Applied" radius={[0, 4, 4, 0]} />
                <Bar dataKey="calls" fill="#22c55e" name="Calls" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        {/* By Location */}
        <SectionCard title="📍 Applications by Location">
          {byLocation.filter(l => l.applications > 0).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byLocation.filter(l => l.applications > 0).slice(0, 8)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="location" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="applications" fill="#8b5cf6" name="Applied" radius={[4, 4, 0, 0]} />
                <Bar dataKey="calls" fill="#22c55e" name="Calls" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        {/* Referral Effectiveness */}
        {referralEff && (
          <SectionCard title="🤝 Referral Effectiveness">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{referralEff.callRateWithRef}%</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Call rate WITH referral</div>
                <div className="text-xs text-gray-400">{referralEff.withReferral?.total || 0} apps</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">{referralEff.callRateWithoutRef}%</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Call rate WITHOUT referral</div>
                <div className="text-xs text-gray-400">{referralEff.withoutReferral?.total || 0} apps</div>
              </div>
            </div>
            {referralEff.byConnectionType?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Response by connection type</p>
                {referralEff.byConnectionType.filter(c => c.total > 0).map(c => (
                  <div key={c.connection_type} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 dark:text-gray-300">{c.connection_type.replace('_', ' ')}</span>
                    <span className="text-gray-500">
                      {c.responses}/{c.total} responded
                      <span className="ml-2 font-medium text-indigo-600">
                        ({c.total > 0 ? Math.round((c.responses / c.total) * 100) : 0}%)
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )}
      </div>

      {/* Scrape Logs */}
      {scrapeLogs && (
        <SectionCard title="🤖 Scraper Performance">
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            {scrapeLogs.summary?.map(s => (
              <div key={s.platform} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-500 uppercase mb-1">{s.platform}</div>
                <div className="text-xl font-bold text-gray-900 dark:text-white">{s.total_new}</div>
                <div className="text-xs text-gray-400">new jobs ({s.runs} runs)</div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 uppercase text-left">
                  <th className="pb-2">Platform</th>
                  <th className="pb-2">Found</th>
                  <th className="pb-2">New</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">When</th>
                </tr>
              </thead>
              <tbody className="space-y-1">
                {scrapeLogs.logs?.slice(0, 10).map(log => (
                  <tr key={log.id} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="py-1.5 font-medium text-gray-700 dark:text-gray-300">{log.platform}</td>
                    <td className="py-1.5 text-gray-600 dark:text-gray-400">{log.jobs_found}</td>
                    <td className="py-1.5 text-green-600 dark:text-green-400">{log.jobs_new}</td>
                    <td className="py-1.5">
                      <span className={`badge ${log.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="py-1.5 text-gray-400">{log.ran_at ? format(parseISO(log.ran_at), 'dd MMM HH:mm') : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
