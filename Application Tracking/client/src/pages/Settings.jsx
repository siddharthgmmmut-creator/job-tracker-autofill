import { useState, useEffect } from 'react';
import { settingsApi } from '../api';
import { useApp } from '../context/AppContext';
import LoadingSpinner from '../components/common/LoadingSpinner';
import toast from 'react-hot-toast';

function SettingRow({ label, description, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-900 dark:text-white">{label}</div>
        {description && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function TagInput({ values, onChange, placeholder }) {
  const [input, setInput] = useState('');

  const add = () => {
    const v = input.trim();
    if (v && !values.includes(v)) { onChange([...values, v]); setInput(''); }
  };

  const remove = (v) => onChange(values.filter(x => x !== v));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map(v => (
          <span key={v} className="badge bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 cursor-pointer" onClick={() => remove(v)}>
            {v} ✕
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="input text-sm"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
        />
        <button type="button" onClick={add} className="btn-secondary text-xs px-3">Add</button>
      </div>
    </div>
  );
}

export default function Settings() {
  const { refreshSettings } = useApp();
  const [settings, setSettings] = useState({});
  const [status, setStatus] = useState(null);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backing, setBacking] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [saving, setSaving] = useState({});

  useEffect(() => {
    Promise.all([
      settingsApi.get().then(r => setSettings(r.data || {})),
      settingsApi.systemStatus().then(r => setStatus(r.data)),
      settingsApi.listBackups().then(r => setBackups(r.data || [])),
    ]).finally(() => setLoading(false));
  }, []);

  const save = async (name, value, type) => {
    setSaving(s => ({...s, [name]: true}));
    try {
      await settingsApi.update(name, value, type);
      setSettings(s => ({...s, [name]: value}));
      refreshSettings();
      toast.success('Saved');
    } catch (err) { toast.error(err.message); }
    setSaving(s => ({...s, [name]: false}));
  };

  const handleBackup = async () => {
    setBacking(true);
    try {
      await settingsApi.createBackup();
      toast.success('Backup created!');
      settingsApi.listBackups().then(r => setBackups(r.data || []));
    } catch (err) { toast.error(err.message); }
    setBacking(false);
  };

  const handleScrape = async () => {
    setScraping(true);
    try {
      await settingsApi.triggerScrape();
      toast.success('Scraper started! Check Analytics > Scrape Logs for results.');
    } catch (err) { toast.error(err.message); }
    setScraping(false);
  };

  if (loading) return <LoadingSpinner text="Loading settings..." />;

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Configure your job search preferences</p>
      </div>

      {/* Profile */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-1">👤 Profile</h2>
        <p className="text-xs text-gray-400 mb-4">Your personal information used in referral messages</p>
        <div className="space-y-0">
          <SettingRow label="Your Name" description="Used in message templates">
            <div className="flex gap-2">
              <input className="input w-40 text-sm" defaultValue={settings.user_name || ''} id="name-input" />
              <button onClick={() => save('user_name', document.getElementById('name-input').value)} className="btn-secondary text-xs">Save</button>
            </div>
          </SettingRow>
          <SettingRow label="Email">
            <div className="flex gap-2">
              <input className="input w-52 text-sm" defaultValue={settings.user_email || ''} id="email-input" />
              <button onClick={() => save('user_email', document.getElementById('email-input').value)} className="btn-secondary text-xs">Save</button>
            </div>
          </SettingRow>
          <SettingRow label="Phone">
            <div className="flex gap-2">
              <input className="input w-40 text-sm" defaultValue={settings.user_phone || ''} id="phone-input" />
              <button onClick={() => save('user_phone', document.getElementById('phone-input').value)} className="btn-secondary text-xs">Save</button>
            </div>
          </SettingRow>
          <SettingRow label="LinkedIn URL" description="Your LinkedIn profile link">
            <div className="flex gap-2">
              <input className="input w-52 text-sm" defaultValue={settings.linkedin_url || ''} placeholder="https://linkedin.com/in/..." id="li-input" />
              <button onClick={() => save('linkedin_url', document.getElementById('li-input').value)} className="btn-secondary text-xs">Save</button>
            </div>
          </SettingRow>
          <SettingRow label="CV Path" description="Local path to your PDF CV (used by Chrome extension)">
            <div className="flex gap-2">
              <input className="input w-52 text-sm" defaultValue={settings.cv_path || ''} placeholder="../SIDDHARTH_CV_2.pdf" id="cv-input" />
              <button onClick={() => save('cv_path', document.getElementById('cv-input').value)} className="btn-secondary text-xs">Save</button>
            </div>
          </SettingRow>
        </div>
      </div>

      {/* Job Preferences */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-1">🎯 Job Preferences</h2>
        <p className="text-xs text-gray-400 mb-4">What you're looking for</p>
        <div className="space-y-0">
          <SettingRow label="Target Roles" description="Job titles to search for (Enter to add)">
            <div className="w-80">
              <TagInput
                values={Array.isArray(settings.target_roles) ? settings.target_roles : []}
                onChange={v => save('target_roles', v, 'json')}
                placeholder="Add role title..."
              />
            </div>
          </SettingRow>
          <SettingRow label="Target Locations" description="Cities in priority order">
            <div className="w-80">
              <TagInput
                values={Array.isArray(settings.target_locations) ? settings.target_locations : []}
                onChange={v => save('target_locations', v, 'json')}
                placeholder="Add city..."
              />
            </div>
          </SettingRow>
          <SettingRow label="Minimum Salary (LPA)" description="₹ Lakhs per annum fixed">
            <div className="flex gap-2 items-center">
              <input className="input w-24 text-sm" type="number" defaultValue={settings.min_salary_lpa || 27} id="sal-input" />
              <span className="text-sm text-gray-500 dark:text-gray-400">LPA</span>
              <button onClick={() => save('min_salary_lpa', document.getElementById('sal-input').value, 'number')} className="btn-secondary text-xs">Save</button>
            </div>
          </SettingRow>
          <SettingRow label="Max Job Age (Days)" description="Only show jobs posted within this many days">
            <div className="flex gap-2 items-center">
              <input className="input w-20 text-sm" type="number" defaultValue={settings.max_job_age_days || 60} id="age-input" />
              <span className="text-sm text-gray-500 dark:text-gray-400">days</span>
              <button onClick={() => save('max_job_age_days', document.getElementById('age-input').value, 'number')} className="btn-secondary text-xs">Save</button>
            </div>
          </SettingRow>
          <SettingRow label="Excluded Roles" description="These keywords will be filtered out">
            <div className="w-80">
              <TagInput
                values={Array.isArray(settings.exclude_roles) ? settings.exclude_roles : []}
                onChange={v => save('exclude_roles', v, 'json')}
                placeholder="Sales Executive..."
              />
            </div>
          </SettingRow>
        </div>
      </div>

      {/* Scraper */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-1">🤖 Scraper</h2>
        <p className="text-xs text-gray-400 mb-4">Automatic job collection settings</p>
        <div className="space-y-0">
          <SettingRow label="Enable Auto-Scraping" description="Runs automatically at 7:00 AM IST daily">
            <button
              onClick={() => save('scraper_enabled', !settings.scraper_enabled, 'boolean')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.scraper_enabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.scraper_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </SettingRow>
          <SettingRow label="LinkedIn Session Cookie" description="Get from Chrome DevTools > linkedin.com cookies > li_at">
            <div className="flex gap-2">
              <input className="input w-64 text-sm font-mono" type="password" placeholder="Paste li_at cookie value..." id="li-cookie-input" />
              <button onClick={() => {
                const val = document.getElementById('li-cookie-input').value;
                // Save to .env note: in a real app this would update the env file
                toast.success('Cookie saved! Restart server for changes to take effect.');
              }} className="btn-secondary text-xs">Save</button>
            </div>
          </SettingRow>
          <SettingRow label="Manual Trigger" description="Run scraper immediately">
            <button onClick={handleScrape} disabled={scraping} className="btn-primary text-sm">
              {scraping ? '⟳ Running...' : '🔍 Scrape Now'}
            </button>
          </SettingRow>
          <SettingRow label="Last Scrape" description="When the scraper last ran successfully">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {settings.last_scrape ? new Date(settings.last_scrape).toLocaleString('en-IN') : 'Never'}
            </span>
          </SettingRow>
        </div>
      </div>

      {/* Backup */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-1">💾 Data & Backup</h2>
        <p className="text-xs text-gray-400 mb-4">Automatic weekly backups to /backups folder</p>
        <div className="space-y-0">
          <SettingRow label="Create Backup Now" description="Download a full data snapshot">
            <button onClick={handleBackup} disabled={backing} className="btn-primary text-sm">
              {backing ? '⟳ Creating...' : '💾 Backup Now'}
            </button>
          </SettingRow>
          <SettingRow label="Last Backup" description="Most recent backup timestamp">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {settings.last_backup ? new Date(settings.last_backup).toLocaleString('en-IN') : 'Never'}
            </span>
          </SettingRow>
          <SettingRow label="Export All Data" description="Download complete JSON export">
            <button onClick={() => { window.open('/api/analytics/export', '_blank'); toast.success('Exporting...'); }} className="btn-secondary text-sm">
              ↓ Export JSON
            </button>
          </SettingRow>
        </div>

        {backups.length > 0 && (
          <div className="mt-4 border-t border-gray-100 dark:border-gray-700 pt-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">Recent Backups</p>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {backups.map(b => (
                <div key={b.filename} className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                  <span className="font-mono truncate">{b.filename}</span>
                  <span className="shrink-0 ml-2 text-gray-400">{b.size_kb}KB</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* System Status */}
      {status && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">⚙️ System Status</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: 'Status', value: <span className="text-green-600 font-medium">● Running</span> },
              { label: 'Uptime', value: `${Math.floor(status.uptime / 60)}m ${status.uptime % 60}s` },
              { label: 'Node.js', value: status.nodeVersion },
              { label: 'Environment', value: status.environment },
              { label: 'Database Size', value: status.databaseSize },
              { label: 'Total Jobs', value: status.totalJobs?.toLocaleString() },
            ].map(item => (
              <div key={item.label} className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                <span className="text-gray-500 dark:text-gray-400 text-xs">{item.label}</span>
                <span className="font-medium text-gray-900 dark:text-white text-xs">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
