import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { jobsApi, applicationsApi, settingsApi, rolesApi } from '../api';
import Badge from '../components/common/Badge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import Modal from '../components/common/Modal';
import toast from 'react-hot-toast';
import { formatDistanceToNow, parseISO } from 'date-fns';

// ─────────────────────────────────────────────────────────────────
// SCORING CONSTANTS  (read-only — do not edit)
// ─────────────────────────────────────────────────────────────────
const USER_EXP = 5;
const PRIMARY_LOC = 'mumbai';
const SECONDARY_LOCS = ['pune', 'delhi', 'gurgaon', 'noida'];

const TARGET_KEYWORDS = [
  'program manager', 'program management', 'technical program manager',
  'tpm', 'pgm', 'delivery manager',
  'growth manager', 'growth lead', 'growth ops', 'growth operations',
  'growth hacker', 'growth marketing', 'growth strategy',
  'gtm', 'go-to-market', 'ai gtm',
  'strategy',
  'chief of staff',
  "founder's office", 'founders office', 'founder office',
  'revenue operations', 'revenue ops',
  'business planning',
  'biz ops', 'bizops',
  'general management',
];

const SALES_TITLE_KEYWORDS = [
  'sales manager', 'account manager', 'business development',
  'channel sales', 'inside sales', 'field sales',
];

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

function parseSalaryLPA(text) {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (
    t === '' ||
    t.includes('not disclose') || t.includes('not mention') ||
    t.includes('as per') || t.includes('negotiable') || t.includes('confidential')
  ) return null;
  const nums = [];
  const re = /(\d+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const n = parseFloat(m[1]);
    if (n >= 1 && n <= 500) nums.push(n);
  }
  if (nums.length === 0) return null;
  const min = Math.min(...nums);
  const max = t.includes('+') ? 999 : Math.max(...nums);
  return { min, max };
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

  if (SALES_TITLE_KEYWORDS.some(k => title.includes(k))) score = Math.min(score, 35);

  return Math.min(100, Math.max(0, score));
}

function getMatchLabel(score) {
  if (score >= 75) return 'high';
  if (score >= 55) return 'moderate';
  if (score >= 40) return 'low';
  return null;
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

function extractTitleForDisplay(fullTitle, extractedCompany) {
  if (!fullTitle || !extractedCompany || extractedCompany === 'Company Not Mentioned' || extractedCompany === 'Not Disclosed') {
    return fullTitle;
  }
  const title = fullTitle.trim();
  const companyLower = extractedCompany.toLowerCase();
  const dashMatch = title.match(/^(.+?)\s*[-–]\s*(.+)$/);
  if (dashMatch) {
    const beforeDash = dashMatch[1].trim().toLowerCase();
    if (beforeDash.includes(companyLower) || companyLower.includes(beforeDash)) return dashMatch[2].trim();
  }
  const atMatch = title.match(/^(.+?)\s+at\s+(.+)$/i);
  if (atMatch) {
    const afterAt = atMatch[2].trim().toLowerCase();
    if (afterAt.includes(companyLower) || companyLower.includes(afterAt)) return atMatch[1].trim();
  }
  return title;
}

const RECRUITER_KEYWORDS = ['consulting', 'recruitment', 'staffing', 'talent', 'hr', 'solutions', 'search'];
function hasRecruiterKeyword(text) {
  const t = (text || '').toLowerCase();
  return RECRUITER_KEYWORDS.some(kw => t.includes(kw));
}

function extractCompanyInfo(job) {
  const UNKNOWN    = { company: 'Company Not Mentioned', isConsultantPost: false };
  const CONSULTANT = { company: 'Not Disclosed',         isConsultantPost: true  };
  const rawCompany = (job.company || '').trim();
  if (rawCompany && !rawCompany.toLowerCase().startsWith('see ')) {
    return hasRecruiterKeyword(rawCompany) ? CONSULTANT : { company: rawCompany, isConsultantPost: false };
  }
  const title = (job.title || '').trim();
  const dashMatch = title.match(/^(.+?)\s*[-–]\s*(.+)$/);
  if (dashMatch) {
    const c = dashMatch[1].trim();
    return hasRecruiterKeyword(c) ? CONSULTANT : { company: c, isConsultantPost: false };
  }
  const atMatch = title.match(/\bat\s+(.+)$/i);
  if (atMatch) {
    const c = atMatch[1].trim();
    return hasRecruiterKeyword(c) ? CONSULTANT : { company: c, isConsultantPost: false };
  }
  return UNKNOWN;
}

// ── CompanyLogo — deterministic initials avatar ───────────────────
const PLACEHOLDER_COMPANIES = new Set(['Not Disclosed', 'Company Not Mentioned']);

function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 60%, 45%)`;
}

function CompanyLogo({ company, size = 44 }) {
  const isPlaceholder = PLACEHOLDER_COMPANIES.has(company);
  if (isPlaceholder) {
    return (
      <div style={{ width: size, height: size, minWidth: size }}
           className="flex items-center justify-center rounded-xl shrink-0 bg-surface-sunken border border-line">
        <svg className="w-5 h-5 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5
                   M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      </div>
    );
  }
  const initials = company.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{ width: size, height: size, minWidth: size, background: hashColor(company) }}
         className="flex items-center justify-center rounded-xl shrink-0 text-white font-semibold tracking-tight"
         title={company}>
      <span style={{ fontSize: Math.round(size * 0.36) }}>{initials}</span>
    </div>
  );
}

// ── MatchBadge ────────────────────────────────────────────────────
function MatchBadge({ score }) {
  const level = getMatchLabel(score);
  if (!level) return null;
  if (level === 'high')     return <span className="match-high">✦ High Match</span>;
  if (level === 'moderate') return <span className="match-moderate">◈ Moderate</span>;
  return <span className="match-low">· Low Match</span>;
}

// ── Role tag badge ────────────────────────────────────────────────
const ROLE_TAG_COLORS = {
  blue:    'bg-blue-50   text-blue-700   ring-blue-600/20   dark:bg-blue-500/10   dark:text-blue-400   dark:ring-blue-500/20',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20',
  purple:  'bg-purple-50  text-purple-700  ring-purple-600/20  dark:bg-purple-500/10  dark:text-purple-400  dark:ring-purple-500/20',
  amber:   'bg-amber-50   text-amber-700   ring-amber-600/20   dark:bg-amber-500/10   dark:text-amber-400   dark:ring-amber-500/20',
  cyan:    'bg-cyan-50    text-cyan-700    ring-cyan-600/20    dark:bg-cyan-500/10    dark:text-cyan-400    dark:ring-cyan-500/20',
  rose:    'bg-rose-50    text-rose-700    ring-rose-600/20    dark:bg-rose-500/10    dark:text-rose-400    dark:ring-rose-500/20',
};

function RoleTagBadge({ tag }) {
  const cls = ROLE_TAG_COLORS[tag.color] || ROLE_TAG_COLORS.blue;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium ring-1 ring-inset ${cls}`}>
      {tag.name}
    </span>
  );
}

// ── Filter primitives ─────────────────────────────────────────────
function FilterPill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-2xs font-medium transition-colors whitespace-nowrap ${
        active
          ? 'bg-ink text-surface dark:bg-white dark:text-zinc-900'
          : 'text-ink-muted hover:text-ink hover:bg-surface-sunken'
      }`}
    >
      {children}
    </button>
  );
}

function FilterGroup({ label, children }) {
  return (
    <div>
      <p className="h-eyebrow mb-2">{label}</p>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

// ── Company searchable dropdown ───────────────────────────────────
function CompanySearchDropdown({ companies, value, onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const allOptions = useMemo(() => {
    const base = ['Company Not Mentioned', ...companies];
    if (!query) return base;
    return base.filter(c => c.toLowerCase().includes(query.toLowerCase()));
  }, [companies, query]);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(o => !o)}
           className="input cursor-pointer flex items-center justify-between text-sm select-none">
        <span className={`truncate text-sm ${value ? 'text-ink' : 'text-ink-faint'}`}>
          {value || 'All Companies'}
        </span>
        <span className="text-ink-faint ml-1 shrink-0 text-xs">{open ? '▴' : '▾'}</span>
      </div>
      {open && (
        <div className="absolute z-50 left-0 top-full mt-1.5 w-72 bg-surface
                        border border-line rounded-xl shadow-lg overflow-hidden animate-slide-down">
          <div className="p-2 border-b border-line">
            <input autoFocus className="input text-sm" placeholder="Search company…"
                   value={query} onChange={e => setQuery(e.target.value)}
                   onClick={e => e.stopPropagation()} />
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
            <button className="w-full text-left px-4 py-2 text-sm text-ink-muted hover:bg-surface-sunken hover:text-ink transition-colors"
                    onClick={() => { onChange(''); setOpen(false); setQuery(''); }}>
              All Companies
            </button>
            {allOptions.map(c => (
              <button key={c}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                        value === c ? 'bg-surface-sunken text-ink font-medium' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
                      }`}
                      onClick={() => { onChange(c); setOpen(false); setQuery(''); }}>
                {c}
              </button>
            ))}
            {allOptions.length === 0 && (
              <div className="px-4 py-3 text-sm text-ink-faint text-center">No match</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── JobCard — avatar | content | signals ──────────────────────────
function JobCard({ job, onApply, onNotFit }) {
  const [applying, setApplying]     = useState(false);
  const [notFitting, setNotFitting] = useState(false);

  // Parse role intelligence tags (stored as JSON string in DB)
  const roleTags = useMemo(() => {
    try { return JSON.parse(job.role_tags || '[]'); } catch { return []; }
  }, [job.role_tags]);

  const fitScore = computeFitScore(job);
  const { company, isConsultantPost } = extractCompanyInfo(job);
  const isUnknown = company === 'Company Not Mentioned' || company === 'Not Disclosed';
  const displayTitle = extractTitleForDisplay(job.title, company);

  const referralCount = job.referral_count || 0;
  const canShowReferral = !isUnknown && referralCount > 0;
  const referralLabel   = referralCount >= 2 ? 'Strong Referral' : 'Referral';

  const handleApply = async (e) => {
    e.preventDefault();
    setApplying(true);
    try {
      await applicationsApi.create({ job_id: job.id });
      toast.success('Application tracked!');
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
      toast(job.is_not_fit ? 'Restored to list' : 'Hidden from list', { duration: 2000 });
    } catch (err) {
      toast.error(err.message);
    } finally { setNotFitting(false); }
  };

  const postedAgo = job.posted_date ? formatDistanceToNow(parseISO(job.posted_date), { addSuffix: true }) : null;
  const applyUrl  = job.job_url || `https://www.google.com/search?q=${encodeURIComponent(`${job.title} ${job.company} apply`)}`;
  const isDirectUrl = !!job.job_url;

  return (
    <div className="card-hover px-4 py-3.5 flex items-start gap-3">

      {/* ── LEFT: Avatar zone ──────────────────────────────────── */}
      <div className="flex flex-col items-center gap-2 flex-shrink-0 pt-0.5" style={{ width: 48 }}>
        <CompanyLogo company={company} size={44} />
        <Badge type={job.platform} />
      </div>

      {/* ── CENTER: Content zone ───────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {/* Company — muted, above title */}
        <p className={`text-2xs font-medium leading-none mb-1 ${isUnknown ? 'text-ink-faint italic' : 'text-ink-muted'}`}>
          {company}
        </p>

        {/* Title */}
        <a href={applyUrl} target="_blank" rel="noopener noreferrer"
           className="block text-[13px] font-semibold text-ink leading-snug
                      hover:text-accent-600 dark:hover:text-accent-400 transition-colors line-clamp-2">
          {displayTitle}
        </a>

        {/* Meta row: location · posted */}
        <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
          {job.location && (
            <span className="flex items-center gap-1 text-2xs text-ink-faint">
              <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="truncate max-w-[120px]">{job.location}</span>
            </span>
          )}
          {postedAgo && <span className="text-2xs text-ink-faint tabular">{postedAgo}</span>}
        </div>

        {/* Salary chip */}
        {job.salary_range && (
          <p className="mt-1 text-2xs font-medium text-emerald-700 dark:text-emerald-400 tabular">
            {job.salary_range}
          </p>
        )}

        {/* Role Intelligence tags */}
        {roleTags.length > 0 && (
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {roleTags.slice(0, 2).map(tag => (
              <RoleTagBadge key={tag.id} tag={tag} />
            ))}
          </div>
        )}

        {/* Tag row: consultant / referral / application status */}
        {(isConsultantPost || canShowReferral || job.application_status) && (
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {isConsultantPost && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium
                               bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20
                               dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20">
                via Consultant
              </span>
            )}
            {canShowReferral && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-semibold
                               bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20
                               dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20">
                {referralLabel}
              </span>
            )}
            {job.application_status && <Badge type={job.application_status} />}
          </div>
        )}
      </div>

      {/* ── RIGHT: Signal zone ─────────────────────────────────── */}
      <div className="flex flex-col items-end justify-between self-stretch flex-shrink-0 gap-3 pt-0.5">

        {/* Top: match badge */}
        <div>
          <MatchBadge score={fitScore} />
        </div>

        {/* Bottom: action stack */}
        <div className="flex flex-col items-end gap-1.5">
          <a href={applyUrl} target="_blank" rel="noopener noreferrer"
             className="btn-accent py-1 px-3 text-2xs whitespace-nowrap"
             title={isDirectUrl ? 'Open job posting' : 'Search online'}>
            {isDirectUrl ? 'Apply ↗' : 'Find'}
          </a>

          <div className="flex items-center gap-0.5">
            <Link to={`/referrals?job_id=${job.id}`}
                  className="btn-ghost py-1 px-2 text-2xs whitespace-nowrap">
              Refer
            </Link>

            {!job.application_id ? (
              <button onClick={handleApply} disabled={applying}
                      className="btn-ghost py-1 px-2 text-2xs whitespace-nowrap">
                {applying ? '…' : 'Applied'}
              </button>
            ) : (
              <Link to={`/applications/${job.application_id}`}
                    className="inline-flex items-center gap-0.5 py-1 px-2 text-2xs font-medium
                               text-emerald-700 dark:text-emerald-400 hover:bg-surface-sunken rounded-lg transition-colors">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Applied
              </Link>
            )}

            <button onClick={handleNotFit} disabled={notFitting}
                    title={job.is_not_fit ? 'Restore' : 'Hide'}
                    className="btn-ghost py-1 px-1.5 text-2xs">
              {notFitting ? <span>…</span> : job.is_not_fit ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M3 10h10a4 4 0 014 4v0a4 4 0 01-4 4h-3m-7-8l4-4m-4 4l4 4" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AddJobModal ───────────────────────────────────────────────────
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
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
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
          <button type="submit" disabled={saving} className="btn-accent">{saving ? 'Adding…' : 'Add Job'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main — two-panel layout
// ─────────────────────────────────────────────────────────────────
const PAGE_SIZE = 20;

export default function JobListings() {
  const [allJobs,   setAllJobs]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [stats,     setStats]     = useState(null);
  const [companies, setCompanies] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [seeding,      setSeeding]      = useState(false);
  const [page,         setPage]         = useState(1);

  // Server-side filters (need explicit Apply)
  const emptyServer = { location: '', platform: '' };
  const [serverFilters, setServerFilters] = useState(emptyServer);
  const [draftServer,   setDraftServer]   = useState(emptyServer);

  // Status filter (server-side: drives hidden + applied params)
  const [statusFilter, setStatusFilter] = useState('');

  // Client-side filters (instant)
  const [searchInput,     setSearchInput]     = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeCompany,   setActiveCompany]   = useState('');
  const [activeExpRange,  setActiveExpRange]  = useState('');
  const [activeRoleTag,   setActiveRoleTag]   = useState('');  // replaces keyword activeCategory
  const [activeSalaryFilter, setActiveSalaryFilter] = useState('27');
  const [toggles, setToggles] = useState({ topCompanies: false });
  const [activeDays, setActiveDays] = useState('');

  // Role definitions (loaded once from API, used for filter pills)
  const [roleDefinitions, setRoleDefinitions] = useState([]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Derive server params from statusFilter
  const showHidden   = statusFilter === 'not-fit';
  const appliedParam = statusFilter === 'applied' ? 'yes' : statusFilter === 'not-applied' ? 'no' : '';

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        limit: 500,
        ...Object.fromEntries(Object.entries(serverFilters).filter(([, v]) => v)),
        ...(showHidden   ? { hidden: '1' }           : {}),
        ...(appliedParam ? { applied: appliedParam } : {}),
      };
      const res = await jobsApi.list(params);
      setAllJobs(res.data || []);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [serverFilters, showHidden, appliedParam]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);
  useEffect(() => { jobsApi.stats().then(r => setStats(r.data)).catch(() => {}); }, []);
  useEffect(() => { jobsApi.companies().then(r => setCompanies(r.data || [])).catch(() => {}); }, []);
  useEffect(() => {
    rolesApi.list()
      .then(r => setRoleDefinitions((r.data || []).filter(d => d.is_active)))
      .catch(() => {});
  }, []);

  // Client-side filtering
  const filteredJobs = useMemo(() => {
    let jobs = allJobs;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      jobs = jobs.filter(j =>
        (j.title    || '').toLowerCase().includes(q) ||
        (j.company  || '').toLowerCase().includes(q) ||
        (j.location || '').toLowerCase().includes(q)
      );
    }
    if (activeCompany) {
      if (activeCompany === 'Company Not Mentioned')
        jobs = jobs.filter(j => !j.company || j.company.trim() === '' || j.company.toLowerCase().startsWith('see '));
      else
        jobs = jobs.filter(j => j.company === activeCompany);
    }
    if (activeExpRange) {
      const [rawMin, rawMax] = activeExpRange === '8+' ? [8, 99] : activeExpRange.split('-').map(Number);
      jobs = jobs.filter(job => {
        const text  = `${job.requirements || ''} ${job.description || ''}`;
        const range = parseJobExpRange(text);
        if (!range) return true;
        return rawMax >= range.min && rawMin <= range.max;
      });
    }
    if (activeSalaryFilter) {
      const floor = parseInt(activeSalaryFilter, 10);
      jobs = jobs.filter(job => {
        const parsed = parseSalaryLPA(job.salary_range);
        if (!parsed) return true;
        return parsed.max >= floor;
      });
    }
    if (activeRoleTag) {
      jobs = jobs.filter(j => {
        // Check fit_category (primary/fastest) first, then full tags array
        if (j.fit_category === activeRoleTag) return true;
        try {
          const tags = JSON.parse(j.role_tags || '[]');
          return tags.some(t => t.id === activeRoleTag);
        } catch { return false; }
      });
    }
    if (toggles.topCompanies) jobs = jobs.filter(j => isTopCompany(j.company));
    if (activeDays) {
      const cutoff = new Date(Date.now() - parseInt(activeDays, 10) * 86400000).toISOString();
      jobs = jobs.filter(j => j.posted_date && j.posted_date >= cutoff);
    }
    return jobs;
  }, [allJobs, debouncedSearch, activeCompany, activeExpRange, activeSalaryFilter, activeRoleTag, toggles, activeDays]);

  const pagedJobs  = useMemo(() => filteredJobs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filteredJobs, page]);
  const totalPages = Math.ceil(filteredJobs.length / PAGE_SIZE);

  const resetPage = () => setPage(1);

  const applyServerFilters = () => { setServerFilters({ ...draftServer }); resetPage(); };

  const clearAll = () => {
    setDraftServer(emptyServer); setServerFilters(emptyServer);
    setStatusFilter(''); setSearchInput(''); setDebouncedSearch('');
    setActiveCompany(''); setActiveExpRange(''); setActiveSalaryFilter('27');
    setActiveRoleTag(''); setToggles({ topCompanies: false });
    setActiveDays('');
    resetPage();
  };

  const hasAnyFilter =
    Object.values(serverFilters).some(v => v) || statusFilter ||
    debouncedSearch || activeCompany || activeExpRange || activeRoleTag ||
    activeSalaryFilter !== '27' || Object.values(toggles).some(v => v) || activeDays;

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

  const pageTitle = statusFilter === 'not-fit' ? 'Hidden Jobs' : 'Job Listings';

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="flex items-start gap-0 -mx-6 -mt-6 min-h-screen animate-fade-in">

      {/* ════════════════════════════════════════════════════════
          LEFT PANEL — 380px sticky filter column
          ════════════════════════════════════════════════════════ */}
      <aside className="w-[380px] flex-shrink-0 sticky top-0 max-h-screen overflow-y-auto
                        border-r border-line bg-surface flex flex-col">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-line flex-shrink-0">
          <p className="h-eyebrow">{statusFilter === 'not-fit' ? 'Hidden' : 'Discover'}</p>
          <h1 className="h-page mt-1">{pageTitle}</h1>
          <p className="text-2xs text-ink-faint tabular mt-1">
            {filteredJobs.length !== allJobs.length
              ? `${filteredJobs.length} of ${allJobs.length} jobs`
              : `${allJobs.length} jobs`}
          </p>
          <div className="flex gap-2 mt-3">
            <button onClick={() => setShowAddModal(true)} className="btn-accent text-2xs py-1.5 px-3">
              Add Job
            </button>
            <button onClick={handleSeedDemo} disabled={seeding} className="btn-secondary text-2xs py-1.5 px-3">
              {seeding ? 'Loading…' : 'Demo Jobs'}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-line flex-shrink-0">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
              </svg>
            </span>
            <input
              className="input pl-9 text-sm"
              placeholder="Search jobs, company, city…"
              value={searchInput}
              onChange={e => { setSearchInput(e.target.value); resetPage(); }}
            />
          </div>
        </div>

        {/* Filter groups — scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

          {/* Status */}
          <FilterGroup label="Status">
            {[
              { v: '',            label: 'All Jobs'    },
              { v: 'not-applied', label: 'Not Applied' },
              { v: 'applied',     label: 'Applied'     },
              { v: 'not-fit',     label: 'Hidden'      },
            ].map(({ v, label }) => (
              <FilterPill key={v} active={statusFilter === v}
                          onClick={() => { setStatusFilter(v); resetPage(); }}>
                {label}
              </FilterPill>
            ))}
          </FilterGroup>

          {/* Platform (server-side — needs Apply) */}
          <FilterGroup label="Platform">
            {[
              { v: '',               label: 'All'      },
              { v: 'naukri',         label: 'Naukri'   },
              { v: 'iimjobs',        label: 'IIMjobs'  },
              { v: 'company_portal', label: 'Portal'   },
              { v: 'linkedin',       label: 'LinkedIn' },
              { v: 'manual',         label: 'Manual'   },
            ].map(({ v, label }) => (
              <FilterPill key={v} active={draftServer.platform === v}
                          onClick={() => setDraftServer(f => ({ ...f, platform: v }))}>
                {label}
              </FilterPill>
            ))}
          </FilterGroup>

          {/* Location (server-side) */}
          <FilterGroup label="Location">
            {[
              { v: '',           label: 'All'       },
              { v: 'Mumbai',     label: 'Mumbai'    },
              { v: 'Pune',       label: 'Pune'      },
              { v: 'Delhi',      label: 'Delhi'     },
              { v: 'Noida',      label: 'Noida'     },
              { v: 'Gurgaon',    label: 'Gurgaon'   },
              { v: 'Lucknow',    label: 'Lucknow'   },
              { v: 'Bangalore',  label: 'Bangalore' },
              { v: 'Hyderabad',  label: 'Hyderabad' },
            ].map(({ v, label }) => (
              <FilterPill key={v} active={draftServer.location === v}
                          onClick={() => setDraftServer(f => ({ ...f, location: v }))}>
                {label}
              </FilterPill>
            ))}
          </FilterGroup>

          {/* Posted (client-side — instant, no Apply needed) */}
          <FilterGroup label="Posted">
            {[
              { v: '',   label: 'Any'       },
              { v: '1',  label: 'Last 24h'  },
              { v: '3',  label: 'Last 3d'   },
              { v: '7',  label: 'Last 7d'   },
              { v: '14', label: 'Last 14d'  },
            ].map(({ v, label }) => (
              <FilterPill key={v} active={activeDays === v}
                          onClick={() => { setActiveDays(v); resetPage(); }}>
                {label}
              </FilterPill>
            ))}
          </FilterGroup>

          {/* Apply server filters button — only when drafts differ */}
          {(draftServer.platform !== serverFilters.platform ||
            draftServer.location !== serverFilters.location) && (
            <button onClick={applyServerFilters} className="btn-accent w-full text-sm">
              Apply Filters
            </button>
          )}

          <div className="divider" />

          {/* Salary floor (client-side) */}
          <FilterGroup label="Min Salary">
            {[
              { v: '',   label: 'Any'    },
              { v: '20', label: '20+ LPA' },
              { v: '27', label: '27+ LPA' },
              { v: '30', label: '30+ LPA' },
              { v: '40', label: '40+ LPA' },
              { v: '50', label: '50+ LPA' },
            ].map(({ v, label }) => (
              <FilterPill key={v} active={activeSalaryFilter === v}
                          onClick={() => { setActiveSalaryFilter(v); resetPage(); }}>
                {label}
              </FilterPill>
            ))}
          </FilterGroup>

          {/* Experience (client-side) */}
          <FilterGroup label="Experience">
            {[
              { v: '',    label: 'Any'   },
              { v: '0-2', label: '0–2y'  },
              { v: '2-4', label: '2–4y'  },
              { v: '4-6', label: '4–6y'  },
              { v: '6-8', label: '6–8y'  },
              { v: '8+',  label: '8y+'   },
            ].map(({ v, label }) => (
              <FilterPill key={v} active={activeExpRange === v}
                          onClick={() => { setActiveExpRange(v); resetPage(); }}>
                {label}
              </FilterPill>
            ))}
          </FilterGroup>

          {/* Role Intelligence filter (semantic, client-side) */}
          {roleDefinitions.length > 0 && (
            <FilterGroup label="Role Type">
              <FilterPill active={activeRoleTag === ''} onClick={() => { setActiveRoleTag(''); resetPage(); }}>
                All
              </FilterPill>
              {roleDefinitions.map(role => (
                <FilterPill
                  key={role.id}
                  active={activeRoleTag === role.id}
                  onClick={() => { setActiveRoleTag(role.id); resetPage(); }}
                >
                  {role.name}
                </FilterPill>
              ))}
            </FilterGroup>
          )}

          {/* Top Companies toggle */}
          <div>
            <button
              onClick={() => { setToggles(t => ({ ...t, topCompanies: !t.topCompanies })); resetPage(); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all text-sm font-medium ${
                toggles.topCompanies
                  ? 'bg-ink text-surface border-ink dark:bg-white dark:text-zinc-900 dark:border-white'
                  : 'bg-surface text-ink border-line hover:border-line-strong hover:bg-surface-sunken'
              }`}
            >
              <span>Top Companies Only</span>
              <span className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                toggles.topCompanies ? 'text-surface' : 'text-ink-faint'
              }`}>
                {toggles.topCompanies ? (
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                )}
              </span>
            </button>
          </div>

          {/* Company picker */}
          <FilterGroup label="Company">
            <div className="w-full">
              <CompanySearchDropdown
                companies={companies}
                value={activeCompany}
                onChange={v => { setActiveCompany(v); resetPage(); }}
              />
            </div>
          </FilterGroup>

          {/* Clear all */}
          {hasAnyFilter && (
            <button onClick={clearAll}
                    className="w-full btn-ghost text-sm hover:text-rose-600 py-2">
              Clear All Filters
            </button>
          )}
        </div>
      </aside>

      {/* ════════════════════════════════════════════════════════
          RIGHT PANEL — scrollable job list
          ════════════════════════════════════════════════════════ */}
      <div className="flex-1 min-w-0 px-6 pt-6 pb-12">

        {/* Stats bar */}
        {stats && (
          <div className="flex gap-2 flex-wrap mb-5">
            {stats.byPlatform?.map(p => (
              <div key={p.platform}
                   className="flex items-center gap-1.5 px-3 py-1.5 bg-surface rounded-lg border border-line text-sm">
                <Badge type={p.platform} />
                <span className="text-ink-muted font-medium tabular">{p.count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Job list */}
        {loading ? (
          <LoadingSpinner text="Loading jobs…" />
        ) : pagedJobs.length === 0 ? (
          <EmptyState
            icon="💼"
            title={hasAnyFilter ? 'No jobs match your filters' : 'No jobs yet'}
            description={
              hasAnyFilter
                ? 'Try adjusting your filters or clear all to see everything.'
                : 'Click "Demo Jobs" to load sample data or add a job manually.'
            }
            action={
              hasAnyFilter
                ? <button onClick={clearAll} className="btn-secondary">Clear All Filters</button>
                : <div className="flex gap-3 justify-center flex-wrap">
                    <button onClick={handleSeedDemo} disabled={seeding} className="btn-accent">
                      {seeding ? 'Loading…' : 'Load Demo Jobs'}
                    </button>
                    <button onClick={() => setShowAddModal(true)} className="btn-secondary">Add Manually</button>
                  </div>
            }
          />
        ) : (
          <>
            <div className="space-y-2">
              {pagedJobs.map(job => (
                <JobCard key={job.id} job={job} onApply={fetchJobs} onNotFit={fetchJobs} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-6">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                        className="btn-secondary disabled:opacity-40 text-sm">← Prev</button>
                <span className="text-2xs text-ink-faint tabular">Page {page} of {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                        className="btn-secondary disabled:opacity-40 text-sm">Next →</button>
              </div>
            )}
          </>
        )}
      </div>

      <AddJobModal open={showAddModal} onClose={() => setShowAddModal(false)} onAdded={fetchJobs} />
    </div>
  );
}
