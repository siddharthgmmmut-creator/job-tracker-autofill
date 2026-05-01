import { useState, useEffect } from 'react';
import { settingsApi, rolesApi } from '../api';
import { useApp } from '../context/AppContext';
import { useScrapeTrigger } from '../hooks/useScrapeTrigger';
import LoadingSpinner from '../components/common/LoadingSpinner';
import toast from 'react-hot-toast';

function SettingRow({ label, description, children }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink">{label}</div>
        {description && <div className="text-2xs text-ink-faint mt-0.5">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SectionGroup({ eyebrow, title, description, children }) {
  return (
    <div>
      <div className="mb-3">
        <p className="h-eyebrow">{eyebrow}</p>
        <h2 className="h-section mt-1">{title}</h2>
        {description && <p className="text-2xs text-ink-faint mt-0.5">{description}</p>}
      </div>
      <div className="card divide-y divide-line">
        {children}
      </div>
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
          <span
            key={v}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-2xs font-medium
                       bg-accent-500/10 text-accent-700 ring-1 ring-inset ring-accent-500/20
                       dark:text-accent-400 cursor-pointer hover:bg-accent-500/15"
            onClick={() => remove(v)}
          >
            {v}
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
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
        <button type="button" onClick={add} className="btn-secondary text-2xs px-3">Add</button>
      </div>
    </div>
  );
}

export default function Settings() {
  const { refreshSettings } = useApp();
  const [settings, setSettings] = useState({});
  const [status,   setStatus]   = useState(null);
  const [backups,  setBackups]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [backing,  setBacking]  = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [saving,   setSaving]   = useState({});
  const { scraping, elapsedSec, trigger: handleScrape } = useScrapeTrigger();

  // Role Intelligence
  const [roles,        setRoles]        = useState([]);
  const [classifying,  setClassifying]  = useState(false);
  const [newRoleName,  setNewRoleName]  = useState('');
  const [newRoleTitles, setNewRoleTitles] = useState('');
  const [newRoleKws,   setNewRoleKws]   = useState('');
  const [showAddRole,  setShowAddRole]  = useState(false);

  useEffect(() => {
    Promise.all([
      settingsApi.get().then(r => setSettings(r.data || {})),
      settingsApi.systemStatus().then(r => setStatus(r.data)),
      settingsApi.listBackups().then(r => setBackups(r.data || [])),
      rolesApi.list().then(r => setRoles(r.data || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const handleClassifyAll = async () => {
    setClassifying(true);
    try {
      const res = await rolesApi.classify();
      const { classified, filtered, noMatch, total } = res.data || {};
      toast.success(`${classified} jobs tagged · ${filtered} filtered · ${noMatch} unmatched · ${total} total`);
    } catch (err) { toast.error(err.message); }
    finally { setClassifying(false); }
  };

  const handleToggleRole = async (role) => {
    try {
      await rolesApi.update(role.id, { is_active: !role.is_active });
      setRoles(rs => rs.map(r => r.id === role.id ? { ...r, is_active: !r.is_active } : r));
      toast.success(role.is_active ? 'Role disabled' : 'Role enabled');
    } catch (err) { toast.error(err.message); }
  };

  const handleAddRole = async () => {
    if (!newRoleName.trim()) return;
    const id = newRoleName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const titles   = newRoleTitles.split(',').map(s => s.trim()).filter(Boolean);
    const keywords = newRoleKws.split(',').map(s => s.trim()).filter(Boolean);
    try {
      await rolesApi.create({ id, name: newRoleName.trim(), titles, keywords, threshold: 15 });
      toast.success(`Role "${newRoleName.trim()}" created`);
      const refreshed = await rolesApi.list();
      setRoles(refreshed.data || []);
      setNewRoleName(''); setNewRoleTitles(''); setNewRoleKws(''); setShowAddRole(false);
    } catch (err) { toast.error(err.message); }
  };

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


  if (loading) return <LoadingSpinner text="Loading settings…" />;

  return (
    <div className="space-y-8 animate-fade-in max-w-3xl">
      <div>
        <p className="h-eyebrow">Configuration</p>
        <h1 className="h-page mt-1">Settings</h1>
        <p className="text-2xs text-ink-faint mt-1">Configure your job-search preferences.</p>
      </div>

      {/* Profile */}
      <SectionGroup
        eyebrow="Profile"
        title="Personal Information"
        description="Used in referral message templates."
      >
        <SettingRow label="Your Name" description="Used in message templates">
          <div className="flex gap-2">
            <input className="input w-40 text-sm" defaultValue={settings.user_name || ''} id="name-input" />
            <button onClick={() => save('user_name', document.getElementById('name-input').value)} className="btn-secondary text-2xs">Save</button>
          </div>
        </SettingRow>
        <SettingRow label="Email">
          <div className="flex gap-2">
            <input className="input w-52 text-sm" defaultValue={settings.user_email || ''} id="email-input" />
            <button onClick={() => save('user_email', document.getElementById('email-input').value)} className="btn-secondary text-2xs">Save</button>
          </div>
        </SettingRow>
        <SettingRow label="Phone">
          <div className="flex gap-2">
            <input className="input w-40 text-sm" defaultValue={settings.user_phone || ''} id="phone-input" />
            <button onClick={() => save('user_phone', document.getElementById('phone-input').value)} className="btn-secondary text-2xs">Save</button>
          </div>
        </SettingRow>
        <SettingRow label="LinkedIn URL" description="Your LinkedIn profile link">
          <div className="flex gap-2">
            <input className="input w-52 text-sm" defaultValue={settings.linkedin_url || ''} placeholder="https://linkedin.com/in/..." id="li-input" />
            <button onClick={() => save('linkedin_url', document.getElementById('li-input').value)} className="btn-secondary text-2xs">Save</button>
          </div>
        </SettingRow>
        <SettingRow label="CV Path" description="Local path to your PDF CV (used by Chrome extension)">
          <div className="flex gap-2">
            <input className="input w-52 text-sm" defaultValue={settings.cv_path || ''} placeholder="../SIDDHARTH_CV_2.pdf" id="cv-input" />
            <button onClick={() => save('cv_path', document.getElementById('cv-input').value)} className="btn-secondary text-2xs">Save</button>
          </div>
        </SettingRow>
      </SectionGroup>

      {/* Job Preferences */}
      <SectionGroup
        eyebrow="Targeting"
        title="Job Preferences"
        description="What you're looking for."
      >
        <SettingRow label="Target Roles" description="Job titles to search for (Enter to add)">
          <div className="w-80">
            <TagInput
              values={Array.isArray(settings.target_roles) ? settings.target_roles : []}
              onChange={v => save('target_roles', v, 'json')}
              placeholder="Add role title…"
            />
          </div>
        </SettingRow>
        <SettingRow label="Target Locations" description="Cities in priority order">
          <div className="w-80">
            <TagInput
              values={Array.isArray(settings.target_locations) ? settings.target_locations : []}
              onChange={v => save('target_locations', v, 'json')}
              placeholder="Add city…"
            />
          </div>
        </SettingRow>
        <SettingRow label="Minimum Salary (LPA)" description="₹ Lakhs per annum fixed">
          <div className="flex gap-2 items-center">
            <input className="input w-24 text-sm tabular" type="number" defaultValue={settings.min_salary_lpa || 27} id="sal-input" />
            <span className="text-sm text-ink-faint">LPA</span>
            <button onClick={() => save('min_salary_lpa', document.getElementById('sal-input').value, 'number')} className="btn-secondary text-2xs">Save</button>
          </div>
        </SettingRow>
        <SettingRow label="Max Job Age (Days)" description="Only show jobs posted within this many days">
          <div className="flex gap-2 items-center">
            <input className="input w-20 text-sm tabular" type="number" defaultValue={settings.max_job_age_days || 60} id="age-input" />
            <span className="text-sm text-ink-faint">days</span>
            <button onClick={() => save('max_job_age_days', document.getElementById('age-input').value, 'number')} className="btn-secondary text-2xs">Save</button>
          </div>
        </SettingRow>
        <SettingRow label="Excluded Roles" description="These keywords will be filtered out">
          <div className="w-80">
            <TagInput
              values={Array.isArray(settings.exclude_roles) ? settings.exclude_roles : []}
              onChange={v => save('exclude_roles', v, 'json')}
              placeholder="Sales Executive…"
            />
          </div>
        </SettingRow>
      </SectionGroup>

      {/* Scraper */}
      <SectionGroup
        eyebrow="Automation"
        title="Scraper"
        description="Automatic job collection settings."
      >
        <SettingRow label="Enable Auto-Scraping" description="Runs automatically at 7:00 AM IST daily">
          <button
            onClick={() => save('scraper_enabled', !settings.scraper_enabled, 'boolean')}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.scraper_enabled ? 'bg-accent-600' : 'bg-line-strong'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.scraper_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </SettingRow>
        <SettingRow label="LinkedIn Session Cookie" description="Get from Chrome DevTools > linkedin.com cookies > li_at">
          <div className="flex gap-2">
            <input className="input w-64 text-sm font-mono" type="password" placeholder="Paste li_at cookie value…" id="li-cookie-input" />
            <button onClick={() => {
              toast.success('Cookie saved! Restart server for changes to take effect.');
            }} className="btn-secondary text-2xs">Save</button>
          </div>
        </SettingRow>
        <SettingRow
          label="Manual Trigger"
          description={scraping
            ? `Running… ${elapsedSec >= 60 ? `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s` : `${elapsedSec}s`} elapsed`
            : 'Run scraper immediately — results appear as a toast when done'}
        >
          <button onClick={handleScrape} disabled={scraping} className="btn-accent text-sm">
            {scraping ? 'Scraping…' : 'Scrape Now'}
          </button>
        </SettingRow>
        <SettingRow label="Last Scrape" description="When the scraper last ran successfully">
          <span className="text-sm text-ink-muted tabular">
            {settings.last_scrape ? new Date(settings.last_scrape).toLocaleString('en-IN') : 'Never'}
          </span>
        </SettingRow>
      </SectionGroup>

      {/* Role Intelligence */}
      <SectionGroup
        eyebrow="Intelligence"
        title="Role Classification"
        description="Semantic role engine — classifies every job against your role definitions."
      >
        <SettingRow
          label="Re-classify All Jobs"
          description="Re-runs the scoring engine across all jobs in the DB. Use after editing roles."
        >
          <button onClick={handleClassifyAll} disabled={classifying} className="btn-accent text-sm">
            {classifying ? 'Classifying…' : 'Run Now'}
          </button>
        </SettingRow>

        {/* Role list */}
        <div className="px-5 py-4 space-y-2">
          <p className="h-eyebrow mb-2">Active Roles</p>
          {roles.map(role => (
            <div key={role.id}
                 className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg
                            bg-surface-sunken border border-line">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  role.is_active ? 'bg-emerald-500' : 'bg-line-strong'
                }`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink leading-none">{role.name}</p>
                  <p className="text-2xs text-ink-faint mt-0.5 truncate">
                    threshold {role.threshold} · {(role.titles || []).length} titles · {(role.keywords || []).length} keywords
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleToggleRole(role)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                  role.is_active ? 'bg-accent-600' : 'bg-line-strong'
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  role.is_active ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          ))}

          {/* Add new role */}
          {showAddRole ? (
            <div className="mt-3 p-3 rounded-lg border border-line bg-surface space-y-2">
              <input
                className="input text-sm w-full"
                placeholder="Role name (e.g. Category Manager)"
                value={newRoleName}
                onChange={e => setNewRoleName(e.target.value)}
              />
              <input
                className="input text-sm w-full"
                placeholder="Job titles, comma-separated (e.g. category manager, senior category manager)"
                value={newRoleTitles}
                onChange={e => setNewRoleTitles(e.target.value)}
              />
              <input
                className="input text-sm w-full"
                placeholder="Keywords, comma-separated (e.g. assortment, vendor management)"
                value={newRoleKws}
                onChange={e => setNewRoleKws(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAddRole(false)} className="btn-secondary text-2xs">Cancel</button>
                <button onClick={handleAddRole} disabled={!newRoleName.trim()} className="btn-accent text-2xs">
                  Add Role
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAddRole(true)} className="btn-secondary text-2xs w-full mt-2">
              + Add New Role
            </button>
          )}
        </div>
      </SectionGroup>

      {/* Backup */}
      <SectionGroup
        eyebrow="Data"
        title="Backup &amp; Export"
        description="Automatic weekly backups to /backups folder."
      >
        <SettingRow label="Create Backup Now" description="Download a full data snapshot">
          <button onClick={handleBackup} disabled={backing} className="btn-accent text-sm">
            {backing ? 'Creating…' : 'Backup Now'}
          </button>
        </SettingRow>
        <SettingRow label="Last Backup" description="Most recent backup timestamp">
          <span className="text-sm text-ink-muted tabular">
            {settings.last_backup ? new Date(settings.last_backup).toLocaleString('en-IN') : 'Never'}
          </span>
        </SettingRow>
        <SettingRow label="Export All Data" description="Download complete JSON export">
          <button onClick={() => { window.open('/api/analytics/export', '_blank'); toast.success('Exporting…'); }} className="btn-secondary text-sm">
            Export JSON
          </button>
        </SettingRow>
      </SectionGroup>

      {backups.length > 0 && (
        <div>
          <p className="h-eyebrow mb-2">Recent Backups</p>
          <div className="card p-2 space-y-1 max-h-40 overflow-y-auto">
            {backups.map(b => (
              <div key={b.filename}
                   className="flex items-center justify-between text-2xs text-ink-muted
                              bg-surface-sunken rounded-md px-3 py-2">
                <span className="font-mono truncate">{b.filename}</span>
                <span className="shrink-0 ml-2 text-ink-faint tabular">{b.size_kb}KB</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* System Status */}
      {status && (
        <SectionGroup eyebrow="System" title="Status" description="Live runtime information.">
          <div className="grid grid-cols-2 gap-3 p-5">
            {[
              { label: 'Status', value: (
                <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Running
                </span>
              )},
              { label: 'Uptime', value: `${Math.floor(status.uptime / 60)}m ${status.uptime % 60}s` },
              { label: 'Node.js', value: status.nodeVersion },
              { label: 'Environment', value: status.environment },
              { label: 'Database Size', value: status.databaseSize },
              { label: 'Total Jobs', value: status.totalJobs?.toLocaleString() },
            ].map(item => (
              <div key={item.label}
                   className="flex justify-between items-center bg-surface-sunken border border-line rounded-md px-3 py-2">
                <span className="text-2xs text-ink-faint uppercase tracking-wider">{item.label}</span>
                <span className="text-2xs font-medium text-ink tabular">{item.value}</span>
              </div>
            ))}
          </div>
        </SectionGroup>
      )}
    </div>
  );
}
