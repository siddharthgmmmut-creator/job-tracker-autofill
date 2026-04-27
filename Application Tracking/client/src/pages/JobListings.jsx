import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { jobsApi, applicationsApi, settingsApi } from '../api';
import Badge from '../components/common/Badge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import Modal from '../components/common/Modal';
import toast from 'react-hot-toast';
import { formatDistanceToNow, parseISO } from 'date-fns';

// ─────────────────────────────────────────────────────────────────
// SCORING CONSTANTS  (Siddharth's profile — read-only)
// ─────────────────────────────────────────────────────────────────
const USER_EXP = 5;
const PRIMARY_LOC = 'mumbai';
const SECONDARY_LOCS = ['pune', 'delhi', 'gurgaon', 'noida'];

// Role keywords — expanded to include Program Management (Part 6)
const TARGET_KEYWORDS = [
  // Program Management (new — Part 6)
  'program manager', 'program management', 'technical program manager',
  'tpm', 'pgm', 'delivery manager',
  // Strategy / BizOps / GTM (existing)
  'growth', 'gtm', 'go-to-market', 'strategy', 'chief of staff',
  'revenue', 'operations', 'product', 'commercial', 'founder',
  'business planning', 'market expansion', 'scale', 'general management',
  'biz ops', 'bizops',
];

// Role categories for grouping filter (Part 7)
const ROLE_CATEGORIES = {
  'Program Management': [
    'program manager', 'program management', 'technical program manager',
    'tpm', 'pgm', 'delivery manager',
  ],
  'Strategy / BizOps': [
    'growth', 'gtm', 'go-to-market', 'strategy', 'chief of staff',
    'revenue', 'operations', 'commercial', 'founder', 'business planning',
    'market expansion', 'scale', 'biz ops', 'bizops', 'general management',
  ],
  'Analyst': [
    'analyst', 'analytics', 'data analyst', 'research analyst', 'business analyst',
  ],
};

const TOP_COMPANIES = [
  'razorpay','phonepe','cred','groww','zepto','blinkit','meesho',
  'swiggy','zomato','flipkart','amazon','google','microsoft','meta','apple',
  'deloitte','mckinsey','bcg','bain','kpmg','pwc','ey',
  'darwinbox','freshworks','zoho','leadsquared','browserstack','postman',
  'hdfc','icici','axis','kotak','paytm','mobikwik',
  'lenskart','myntra','nykaa','mamaearth','mmt','goibibo','ixigo',
  'optum','cognizant','accenture','ibm','tcs','infosys','wipro','hcl',
  'slice','jupiter','niyo','navi',
  'dream11','mpl','sharechat','dailyhunt',
  'byju','unacademy','upgrad','vedantu','physics wallah',
  'oyo','urban company','dunzo','porter','rivigo','delhivery',
  'springworks','cleartax','zerodha','angelone','smallcase',
];

// ── Helpers ───────────────────────────────────────────────────────
function parseJobExpRange(text) {
  if (!text) return null;
  const r = text.match(/(\d+)\s*[-–to]+\s*(\d+)\s*(?:yrs?|years?)/i);
  if (r) return { min: +r[1], max: +r[2] };
  const m = text.match(/(\d+)\+?\s*(?:yrs?|years?)/i);
  if (m) { const n = +m[1]; return { min: n, max: n + 5 }; }
  return null;
}

function computeFitScore(job) {
  let score = 50;
  const title = (job.title || '').toLowerCase();
  const loc   = (job.location || '').toLowerCase();
  const text  = `${job.requirements || ''} ${job.description || ''}`.toLowerCase();

  if (TARGET_KEYWORDS.some(k => title.includes(k))) score += 20;

  const range = parseJobExpRange(text);
  if (range) {
    if (USER_EXP >= range.min && USER_EXP <= range.max) score += 15;
    else if (USER_EXP < range.min) score -= 10;
    else score -= 5;
  }

  if (loc.includes(PRIMARY_LOC)) score += 15;
  else if (SECONDARY_LOCS.some(l => loc.includes(l))) score += 5;

  return Math.min(100, Math.max(0, score));
}

// Match label: only show if score is meaningful
function getMatchLabel(score) {
  if (score >= 75) return 'high';
  if (score >= 55) return 'moderate';
  return null; // hide entirely — don't mislead
}

function getRoleCategory(title) {
  const t = (title || '').toLowerCase();
  for (const [cat, kws] of Object.entries(ROLE_CATEGORIES)) {
    if (kws.some(k => t.includes(k))) return cat;
  }
  return 'Others';
}

function isTopCompany(company) {
  const n = (company || '').toLowerCase();
  return TOP_COMPANIES.some(top => n.includes(top));
}

function getCompanyLogoUrl(company) {
  if (!company) return null;
  const n = company.toLowerCase();
  if (n.startsWith('see ') || n === 'unknown') return null;
  const slug = n
    .replace(/\b(pvt|ltd|inc|corp|limited|private|technologies|tech|solutions|services|india|group|co|ventures)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '');
  if (slug.length < 2) return null;
  return `https://logo.clearbit.com/${slug}.com`;
}

// Part 3: clean company display
function displayCompanyName(company) {
  if (!company || company.trim() === '' || company.toLowerCase().startsWith('see '))
    return 'Company Not Mentioned';
  return company;
}

// ── CompanyLogo ───────────────────────────────────────────────────
function CompanyLogo({ company, size = 40 }) {
  const [src, setSrc] = useState(() => getCompanyLogoUrl(company));
  const name = displayCompanyName(company);
  const isUnknown = name === 'Company Not Mentioned';
  const initials = isUnknown
    ? '?'
    : name.split(/\s+/).map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase();

  if (!src) {
    return (
      <div
        style={{ width: size, height: size, minWidth: size }}
        className={`flex items-center justify-center rounded-xl font-bold text-xs shrink-0 ${
          isUnknown
            ? 'bg-slate-100 dark:bg-gray-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-gray-700'
            : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-800'
        }`}>
        {initials}
      </div>
    );
  }
  return (
    <img
      src={src} alt={name} width={size} height={size}
      style={{ minWidth: size }}
      className="rounded-xl object-contain bg-white border border-slate-200 dark:border-gray-700 shrink-0 p-0.5"
      onError={() => setSrc(null)}
    />
  );
}

// ── MatchBadge (Part 5 — semantic, not numeric) ───────────────────
function MatchBadge({ score }) {
  const level = getMatchLabel(score);
  if (!level) return null;
  return level === 'high'
    ? <span className="match-high">✦ High Match</span>
    : <span className="match-moderate">◈ Moderate</span>;
}

// ── CompanySearchDropdown (Part 9 fix — no cut-off) ───────────────
function CompanySearchDropdown({ companies, value, onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Full list — no artificial slice limit (Part 9 fix)
  const allOptions = useMemo(() => {
    const base = ['Company Not Mentioned', ...companies];
    if (!query) return base;
    return base.filter(c => c.toLowerCase().includes(query.toLowerCase()));
  }, [companies, query]);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(o => !o)}
           className="input cursor-pointer flex items-center justify-between text-sm select-none min-w-0">
        <span className={`truncate ${value ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
          {value || 'All Companies'}
        </span>
        <span className="text-slate-400 ml-1 shrink-0 text-xs">{open ? '▴' : '▾'}</span>
      </div>
      {open && (
        <div className="absolute z-50 left-0 top-full mt-1.5 w-72 bg-white dark:bg-gray-900
                        border border-slate-200 dark:border-gray-700 rounded-2xl shadow-xl overflow-hidden
                        animate-slide-down">
          <div className="p-2.5 border-b border-slate-100 dark:border-gray-800">
            <input autoFocus
              className="w-full px-3 py-1.5 text-sm rounded-xl border border-slate-200 dark:border-gray-700
                         bg-slate-50 dark:bg-gray-800 focus:outline-none focus:border-blue-400"
              placeholder="Search company…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
          </div>
          {/* Scrollable list — all companies, no cut-off */}
          <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
            <button
              className="w-full text-left px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-gray-800"
              onClick={() => { onChange(''); setOpen(false); setQuery(''); }}>
              All Companies
            </button>
            {allOptions.map(c => (
              <button key={c}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  value === c
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-800'
                }`}
                onClick={() => { onChange(c); setOpen(false); setQuery(''); }}>
                {c}
              </button>
            ))}
            {allOptions.length === 0 && (
              <div className="px-4 py-3 text-sm text-slate-400 text-center">No match</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── JobCard (Parts 2, 3, 4, 5 — clean premium design) ────────────
function JobCard({ job, onApply, onNotFit }) {
  const [applying, setApplying]     = useState(false);
  const [notFitting, setNotFitting] = useState(false);

  const fitScore   = computeFitScore(job);
  const company    = displayCompanyName(job.company);
  const isUnknown  = company === 'Company Not Mentioned';

  // Part 4: referral ONLY when actual connection data exists
  const hasRealReferral = (job.referral_count || 0) > 0;

  const handleApply = async (e) => {
    e.preventDefault();
    setApplying(true);
    try {
      await applicationsApi.create({ job_id: job.id });
      toast.success('Application tracked! ✅');
      onApply?.(job.id);
    } catch (err) {
      if (err.message.includes('already exists')) toast('Already tracked!', { icon: 'ℹ️' });
      else toast.error(err.message);
    } finally { setApplying(false); }
  };

  const handleNotFit = async (e) => {
    e.preventDefault();
    setNotFitting(true);
    try {
      await jobsApi.markNotFit(job.id);
      onNotFit?.(job.id);
      toast(job.is_not_fit ? '↩️ Restored to list' : '👎 Hidden from list', { duration: 2000 });
    } catch (err) {
      toast.error(err.message);
    } finally { setNotFitting(false); }
  };

  const postedAgo = job.posted_date
    ? formatDistanceToNow(parseISO(job.posted_date), { addSuffix: true })
    : null;

  const applyUrl    = job.job_url
    || `https://www.google.com/search?q=${encodeURIComponent(`${job.title} ${job.company} apply`)}`;
  const isDirectUrl = !!job.job_url;

  return (
    <div className="card-hover p-5 flex flex-col gap-4">
      {/* ── Top: logo + title + badges ── */}
      <div className="flex items-start gap-3">
        <CompanyLogo company={job.company} size={40} />

        {/* Title block */}
        <div className="flex-1 min-w-0">
          <a href={applyUrl} target="_blank" rel="noopener noreferrer"
             className="block font-semibold text-slate-900 dark:text-white text-[15px] leading-snug
                        hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            {job.title}
          </a>
          <p className={`text-sm mt-0.5 ${isUnknown ? 'text-slate-400 italic' : 'text-slate-600 dark:text-slate-300'}`}>
            {company}
          </p>
          {job.location && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
              <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {job.location}
            </p>
          )}
        </div>

        {/* Right column: match + referral badges */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <MatchBadge score={fitScore} />
          {/* Part 4: referral badge ONLY with real data */}
          {hasRealReferral && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold
                             bg-blue-50 text-blue-700 border border-blue-200
                             dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
              🤝 {job.referral_count} Referral{job.referral_count > 1 ? 's' : ''}
            </span>
          )}
          {/* Top Company tag */}
          {isTopCompany(job.company) && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold
                             bg-amber-50 text-amber-700 border border-amber-200
                             dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
              🏢 Top Co
            </span>
          )}
        </div>
      </div>

      {/* Optional salary / date row */}
      {(job.salary_range || postedAgo) && (
        <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
          {job.salary_range
            ? <span className="text-green-600 dark:text-green-400 font-medium">💰 {job.salary_range}</span>
            : <span />}
          {postedAgo && <span>{postedAgo}</span>}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-slate-100 dark:border-gray-800" />

      {/* ── Actions ── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <a href={applyUrl} target="_blank" rel="noopener noreferrer"
           className="btn-primary text-xs py-1.5 px-3"
           title={isDirectUrl ? 'Open job posting' : 'Search online'}>
          {isDirectUrl ? 'Apply ↗' : '🔎 Find Online'}
        </a>
        <Link to={`/referrals?job_id=${job.id}`} className="btn-secondary text-xs py-1.5 px-3">
          🤝 Find Referral
        </Link>
        {!job.application_id ? (
          <button onClick={handleApply} disabled={applying}
                  className="btn-secondary text-xs py-1.5 px-3 !text-green-700 !border-green-200 hover:!bg-green-50
                             dark:!text-green-400 dark:!border-green-800">
            {applying ? '…' : '✓ Mark Applied'}
          </button>
        ) : (
          <Link to={`/applications/${job.application_id}`}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5
                           bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400
                           border border-green-200 dark:border-green-800 rounded-xl hover:bg-green-100 transition-colors">
            ✅ Applied
          </Link>
        )}
        {/* Not Fit — pushed to right */}
        <button onClick={handleNotFit} disabled={notFitting}
                title={job.is_not_fit ? 'Restore to list' : 'Hide — not a fit'}
                className="btn-secondary text-xs py-1.5 px-2.5 ml-auto
                           !text-red-400 !border-red-100 hover:!bg-red-50
                           dark:!text-red-500 dark:!border-red-900">
          {notFitting ? '…' : job.is_not_fit ? '↩️' : '👎'}
        </button>
      </div>

      {/* Platform badge — subtle, bottom */}
      <div className="flex items-center gap-2 -mt-1">
        <Badge type={job.platform} />
        {job.application_status && <Badge type={job.application_status} />}
      </div>
    </div>
  );
}

// ── AddJobModal (unchanged logic) ─────────────────────────────────
function AddJobModal({ open, onClose, onAdded }) {
  const [form, setForm] = useState({
    title:'', company:'', location:'', job_url:'',
    platform:'manual', description:'', salary_range:'',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await jobsApi.create(form);
      toast.success('Job added!');
      onAdded?.();
      onClose();
      setForm({ title:'', company:'', location:'', job_url:'', platform:'manual', description:'', salary_range:'' });
    } catch (err) {
      toast.error(err.message);
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Job Manually">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Job Title *</label>
            <input required className="input" value={form.title}
                   onChange={e => setForm(f => ({...f, title: e.target.value}))} placeholder="Growth Manager" /></div>
          <div><label className="label">Company *</label>
            <input required className="input" value={form.company}
                   onChange={e => setForm(f => ({...f, company: e.target.value}))} placeholder="Acme Corp" /></div>
          <div><label className="label">Location</label>
            <input className="input" value={form.location}
                   onChange={e => setForm(f => ({...f, location: e.target.value}))} placeholder="Mumbai" /></div>
          <div><label className="label">Platform</label>
            <select className="input" value={form.platform}
                    onChange={e => setForm(f => ({...f, platform: e.target.value}))}>
              <option value="manual">Manual</option>
              <option value="naukri">Naukri</option>
              <option value="linkedin">LinkedIn</option>
              <option value="iimjobs">IIMjobs</option>
              <option value="company_portal">Company Portal</option>
            </select></div>
          <div className="col-span-2"><label className="label">Job URL</label>
            <input className="input" value={form.job_url}
                   onChange={e => setForm(f => ({...f, job_url: e.target.value}))} placeholder="https://..." /></div>
          <div className="col-span-2"><label className="label">Salary Range</label>
            <input className="input" value={form.salary_range}
                   onChange={e => setForm(f => ({...f, salary_range: e.target.value}))} placeholder="e.g. 25–35 LPA" /></div>
          <div className="col-span-2"><label className="label">Description</label>
            <textarea className="input" rows={3} value={form.description}
                      onChange={e => setForm(f => ({...f, description: e.target.value}))}
                      placeholder="Paste job description…" /></div>
        </div>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Adding…' : 'Add Job'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main JobListings
// ─────────────────────────────────────────────────────────────────
const PAGE_SIZE = 20;

export default function JobListings() {
  // Server data
  const [allJobs,   setAllJobs]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [stats,     setStats]     = useState(null);
  const [companies, setCompanies] = useState([]);

  // UI
  const [showAddModal, setShowAddModal] = useState(false);
  const [seeding,      setSeeding]      = useState(false);
  const [page,         setPage]         = useState(1);

  // ── Server-side filters ─────────────────────────────────────
  const emptyServer = { location: '', platform: '', days: '' };
  const [serverFilters, setServerFilters] = useState(emptyServer);
  const [draftServer,   setDraftServer]   = useState(emptyServer);

  // ── Consolidated status filter (Part 8) ────────────────────
  // '' = all | 'not-applied' | 'applied' | 'not-fit'
  const [statusFilter, setStatusFilter] = useState('');

  // ── Client-side filters ─────────────────────────────────────
  const [searchInput,     setSearchInput]     = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeCompany,   setActiveCompany]   = useState('');
  const [activeExpRange,  setActiveExpRange]  = useState('');
  const [activeCategory,  setActiveCategory]  = useState(''); // Part 7

  // Smart toggles
  const [toggles, setToggles] = useState({ topCompanies: false });

  // Debounce search (Part 10)
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Derive actual server params from statusFilter ───────────
  const showHidden = statusFilter === 'not-fit';
  const appliedParam = statusFilter === 'applied' ? 'yes'
    : statusFilter === 'not-applied' ? 'no'
    : '';

  // ── Fetch (server: location, platform, days, hidden, applied) ─
  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        limit: 500,
        ...Object.fromEntries(Object.entries(serverFilters).filter(([, v]) => v)),
        ...(showHidden   ? { hidden: '1' }       : {}),
        ...(appliedParam ? { applied: appliedParam } : {}),
      };
      const res = await jobsApi.list(params);
      setAllJobs(res.data || []);
    } catch (err) {
      toast.error(err.message);
    } finally { setLoading(false); }
  }, [serverFilters, showHidden, appliedParam]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);
  useEffect(() => { jobsApi.stats().then(r => setStats(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    jobsApi.companies().then(r => setCompanies(r.data || [])).catch(() => {});
  }, []);

  // ── Client-side filtering (real-time) ──────────────────────
  const filteredJobs = useMemo(() => {
    let jobs = allJobs;

    // Global search: title + company + location (Part 10)
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      jobs = jobs.filter(j =>
        (j.title    || '').toLowerCase().includes(q) ||
        (j.company  || '').toLowerCase().includes(q) ||
        (j.location || '').toLowerCase().includes(q)
      );
    }

    // Company filter (Part 9 fix — includes "Company Not Mentioned")
    if (activeCompany) {
      if (activeCompany === 'Company Not Mentioned') {
        jobs = jobs.filter(j => !j.company || j.company.trim() === '' || j.company.toLowerCase().startsWith('see '));
      } else {
        jobs = jobs.filter(j => j.company === activeCompany);
      }
    }

    // Experience range — overlap logic (never excludes ambiguous)
    if (activeExpRange) {
      const [rawMin, rawMax] = activeExpRange === '8+'
        ? [8, 99]
        : activeExpRange.split('-').map(Number);
      jobs = jobs.filter(job => {
        const text  = `${job.requirements || ''} ${job.description || ''}`;
        const range = parseJobExpRange(text);
        if (!range) return true;
        return rawMax >= range.min && rawMin <= range.max;
      });
    }

    // Role category filter (Part 7)
    if (activeCategory) {
      jobs = jobs.filter(j => getRoleCategory(j.title) === activeCategory);
    }

    // Toggle: Top Companies only
    if (toggles.topCompanies) jobs = jobs.filter(j => isTopCompany(j.company));

    return jobs;
  }, [allJobs, debouncedSearch, activeCompany, activeExpRange, activeCategory, toggles]);

  const pagedJobs  = useMemo(() =>
    filteredJobs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredJobs, page]
  );
  const totalPages = Math.ceil(filteredJobs.length / PAGE_SIZE);

  // ── Helpers ────────────────────────────────────────────────
  const resetPage = () => setPage(1);

  const applyServerFilters = () => { setServerFilters({ ...draftServer }); resetPage(); };

  const clearAll = () => {
    setDraftServer(emptyServer);
    setServerFilters(emptyServer);
    setStatusFilter('');
    setSearchInput('');
    setDebouncedSearch('');
    setActiveCompany('');
    setActiveExpRange('');
    setActiveCategory('');
    setToggles({ topCompanies: false });
    resetPage();
  };

  const hasAnyFilter =
    Object.values(serverFilters).some(v => v) ||
    statusFilter || debouncedSearch || activeCompany ||
    activeExpRange || activeCategory ||
    Object.values(toggles).some(v => v);

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      const res = await settingsApi.seedDemo();
      toast.success(res.message);
      fetchJobs();
      jobsApi.stats().then(r => setStats(r.data)).catch(() => {});
    } catch (err) { toast.error(err.message); }
    finally { setSeeding(false); }
  };

  // ── Render ─────────────────────────────────────────────────
  const pageTitle = statusFilter === 'not-fit' ? 'Hidden Jobs' : 'Job Listings';

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {statusFilter === 'not-fit' ? '👁 ' : ''}{pageTitle}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {filteredJobs.length !== allJobs.length
              ? `${filteredJobs.length} of ${allJobs.length} jobs`
              : `${allJobs.length} jobs`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSeedDemo} disabled={seeding} className="btn-secondary text-sm">
            {seeding ? '⏳' : '🌱'} Demo Jobs
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn-primary">
            + Add Job
          </button>
        </div>
      </div>

      {/* ── Platform stats bar ── */}
      {stats && (
        <div className="flex gap-3 flex-wrap">
          {stats.byPlatform?.map(p => (
            <div key={p.platform} className="flex items-center gap-1.5 px-3 py-1.5
                                              bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800
                                              text-sm shadow-sm">
              <Badge type={p.platform} />
              <span className="text-slate-600 dark:text-slate-400 font-medium">{p.count}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Filter panel ── */}
      <div className="card p-5 space-y-4">

        {/* Row 1: global search + broad server filters */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
          {/* Real-time global search (Parts 8/10) */}
          <div className="col-span-2 md:col-span-2 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">🔍</span>
            <input
              className="input pl-8"
              placeholder="Search jobs, company, city…"
              value={searchInput}
              onChange={e => { setSearchInput(e.target.value); resetPage(); }}
            />
          </div>

          <select className="input text-sm" value={draftServer.location}
                  onChange={e => setDraftServer(f => ({...f, location: e.target.value}))}>
            <option value="">All Locations</option>
            {['Mumbai','Pune','Delhi','Noida','Gurgaon','Lucknow','Bangalore','Hyderabad'].map(l =>
              <option key={l}>{l}</option>
            )}
          </select>

          <select className="input text-sm" value={draftServer.platform}
                  onChange={e => setDraftServer(f => ({...f, platform: e.target.value}))}>
            <option value="">All Platforms</option>
            <option value="naukri">Naukri</option>
            <option value="iimjobs">IIMjobs</option>
            <option value="company_portal">Portal</option>
            <option value="linkedin">LinkedIn</option>
            <option value="manual">Manual</option>
          </select>

          <select className="input text-sm" value={draftServer.days}
                  onChange={e => setDraftServer(f => ({...f, days: e.target.value}))}>
            <option value="">Any Date</option>
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
            <option value="60">Last 60 days</option>
          </select>
        </div>

        {/* Row 2: smart client filters */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
          {/* Company searchable dropdown (Part 9) */}
          <CompanySearchDropdown
            companies={companies}
            value={activeCompany}
            onChange={v => { setActiveCompany(v); resetPage(); }}
          />

          {/* Experience range (overlap logic) */}
          <select className="input text-sm" value={activeExpRange}
                  onChange={e => { setActiveExpRange(e.target.value); resetPage(); }}>
            <option value="">Any Experience</option>
            <option value="0-2">0–2 yrs</option>
            <option value="2-4">2–4 yrs</option>
            <option value="4-6">4–6 yrs</option>
            <option value="6-8">6–8 yrs</option>
            <option value="8+">8+ yrs</option>
          </select>

          {/* Role category (Part 7) */}
          <select className="input text-sm" value={activeCategory}
                  onChange={e => { setActiveCategory(e.target.value); resetPage(); }}>
            <option value="">All Roles</option>
            <option value="Program Management">Program Management</option>
            <option value="Strategy / BizOps">Strategy / BizOps</option>
            <option value="Analyst">Analyst</option>
            <option value="Others">Others</option>
          </select>

          {/* Consolidated status filter (Part 8) */}
          <select className="input text-sm" value={statusFilter}
                  onChange={e => { setStatusFilter(e.target.value); resetPage(); }}>
            <option value="">All Jobs</option>
            <option value="not-applied">Not Applied</option>
            <option value="applied">Applied</option>
            <option value="not-fit">Hidden (Not Fit)</option>
          </select>

          {/* Top Companies toggle */}
          <button
            onClick={() => { setToggles(t => ({ ...t, topCompanies: !t.topCompanies })); resetPage(); }}
            className={`text-sm px-3 py-1.5 rounded-xl border transition-all font-medium ${
              toggles.topCompanies
                ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                : 'btn-secondary'
            }`}>
            🏢 Top Companies
          </button>
        </div>

        {/* Row 3: action buttons */}
        <div className="flex gap-2.5 items-center flex-wrap">
          <button onClick={applyServerFilters} className="btn-primary text-sm px-6">
            Apply Filters
          </button>
          {hasAnyFilter && (
            <button onClick={clearAll}
                    className="btn-secondary text-sm px-4 !text-red-500 !border-red-200 hover:!bg-red-50">
              ✕ Clear All
            </button>
          )}
          {filteredJobs.length !== allJobs.length && (
            <span className="text-xs text-slate-400 ml-auto">
              Showing {filteredJobs.length} of {allJobs.length}
            </span>
          )}
        </div>
      </div>

      {/* ── Job grid ── */}
      {loading ? (
        <LoadingSpinner text="Loading jobs…" />
      ) : pagedJobs.length === 0 ? (
        <EmptyState
          icon="💼"
          title={hasAnyFilter ? 'No jobs match your filters' : 'No jobs yet'}
          description={
            hasAnyFilter
              ? 'Try adjusting your filters or clear all to see everything.'
              : 'Click "Scrape Now" in the sidebar or add a job manually.'
          }
          action={
            hasAnyFilter
              ? <button onClick={clearAll} className="btn-secondary">Clear All Filters</button>
              : <div className="flex gap-3 justify-center flex-wrap">
                  <button onClick={handleSeedDemo} disabled={seeding} className="btn-primary">
                    {seeding ? '⏳' : '🌱 Load Demo Jobs'}
                  </button>
                  <button onClick={() => setShowAddModal(true)} className="btn-secondary">+ Add Manually</button>
                </div>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pagedJobs.map(job => (
              <JobCard key={job.id} job={job} onApply={fetchJobs} onNotFit={fetchJobs} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                      className="btn-secondary disabled:opacity-40 text-sm">← Prev</button>
              <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                      className="btn-secondary disabled:opacity-40 text-sm">Next →</button>
            </div>
          )}
        </>
      )}

      <AddJobModal open={showAddModal} onClose={() => setShowAddModal(false)} onAdded={fetchJobs} />
    </div>
  );
}
