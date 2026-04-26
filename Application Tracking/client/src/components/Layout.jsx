import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import toast from 'react-hot-toast';
import { settingsApi } from '../api';
import { useNavigate } from 'react-router-dom';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '📊', exact: true },
  { to: '/jobs', label: 'Job Listings', icon: '💼' },
  { to: '/referrals', label: 'Referral Finder', icon: '🤝' },
  { to: '/applications', label: 'Applications', icon: '📋' },
  { to: '/analytics', label: 'Analytics', icon: '📈' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const { overview, darkMode, toggleDarkMode, refreshOverview } = useApp();
  const navigate = useNavigate();

  const handleScrape = async () => {
    setScraping(true);
    try {
      await settingsApi.triggerScrape();
      toast.success('Scraper started! New jobs will appear shortly.');
      setTimeout(refreshOverview, 5000);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setScraping(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700
        flex flex-col transform transition-transform duration-200
        lg:static lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-200 dark:border-gray-700">
          <span className="text-2xl">💼</span>
          <div>
            <div className="font-bold text-gray-900 dark:text-white text-sm">Job Tracker</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Siddharth • IIM Lucknow</div>
          </div>
        </div>

        {/* Quick stats */}
        {overview && (
          <div className="px-4 py-3 mx-3 mt-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-xs">
            <div className="grid grid-cols-2 gap-2 text-center">
              <div>
                <div className="font-bold text-indigo-700 dark:text-indigo-300 text-base">{overview.applications?.total || 0}</div>
                <div className="text-gray-500 dark:text-gray-400">Applied</div>
              </div>
              <div>
                <div className="font-bold text-green-600 dark:text-green-400 text-base">{overview.pipeline?.got_call || 0}</div>
                <div className="text-gray-500 dark:text-gray-400">Calls</div>
              </div>
              <div>
                <div className="font-bold text-yellow-600 dark:text-yellow-400 text-base">{overview.followups?.due || 0}</div>
                <div className="text-gray-500 dark:text-gray-400">Follow-ups</div>
              </div>
              <div>
                <div className="font-bold text-purple-600 dark:text-purple-400 text-base">{overview.jobs?.notApplied || 0}</div>
                <div className="text-gray-500 dark:text-gray-400">New Jobs</div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}
              `}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="px-3 pb-4 space-y-2 border-t border-gray-200 dark:border-gray-700 pt-3">
          <button
            onClick={async () => {
              setSeeding(true);
              try {
                const res = await settingsApi.seedDemo();
                toast.success(res.message);
                refreshOverview();
                navigate('/jobs');
              } catch (err) { toast.error(err.message); }
              setSeeding(false);
            }}
            disabled={seeding}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {seeding ? <><span className="animate-spin">⟳</span> Loading...</> : <><span>🌱</span> Load Demo Jobs</>}
          </button>
          <button
            onClick={handleScrape}
            disabled={scraping}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {scraping ? (
              <><span className="animate-spin">⟳</span> Scraping...</>
            ) : (
              <><span>🔍</span> Scrape Now (Live)</>
            )}
          </button>
          <button
            onClick={toggleDarkMode}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm rounded-lg transition-colors"
          >
            {darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
          </button>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-gray-600 dark:text-gray-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-semibold text-gray-900 dark:text-white">💼 Job Tracker</span>
          <button onClick={toggleDarkMode}>{darkMode ? '☀️' : '🌙'}</button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
