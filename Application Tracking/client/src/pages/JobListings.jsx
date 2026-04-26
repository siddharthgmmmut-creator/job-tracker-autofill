import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { jobsApi, applicationsApi, settingsApi } from '../api';
import Badge from '../components/common/Badge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import Modal from '../components/common/Modal';
import toast from 'react-hot-toast';
import { formatDistanceToNow, parseISO } from 'date-fns';

function JobCard({ job, onApply, onNotFit }) {
  const [applying, setApplying] = useState(false);
  const [notFitting, setNotFitting] = useState(false);

  const handleNotFit = async (e) => {
    e.preventDefault();
    setNotFitting(true);
    try {
      await jobsApi.markNotFit(job.id);
      onNotFit?.(job.id);
      toast(job.is_not_fit ? '↩️ Job restored to list!' : '👎 Hidden from list', { duration: 2000 });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setNotFitting(false);
    }
  };

  const handleApply = async (e) => {
    e.preventDefault();
    setApplying(true);
    try {
      await applicationsApi.create({ job_id: job.id });
      toast.success('Application tracked! ✅');
      onApply?.(job.id);
    } catch (err) {
      if (err.message.includes('already exists')) toast('Already tracked for this job!', { icon: 'ℹ️' });
      else toast.error(err.message);
    } finally {
      setApplying(false);
    }
  };

  const postedAgo = job.posted_date
    ? formatDistanceToNow(parseISO(job.posted_date), { addSuffix: true })
    : 'Unknown date';

  // Build a fallback "smart search" URL when we don't have a direct job link
  // — opens a Google search for "<title> <company> careers apply"
  const smartSearchUrl = job.job_url
    || `https://www.google.com/search?q=${encodeURIComponent(`${job.title} ${job.company} careers apply ${job.location || ''}`)}`;

  const isDirectJobUrl = !!job.job_url;

  const TitleEl = (
    <a href={smartSearchUrl} target="_blank" rel="noopener noreferrer"
       className="font-semibold text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
      {job.title} ↗
    </a>
  );

  return (
    <div className="card p-5 hover:shadow-md transition-shadow group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge type={job.platform} />
            {job.application_status && <Badge type={job.application_status} />}
            {job.location_priority <= 1 && (
              <span className="badge bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">📍 Mumbai</span>
            )}
          </div>
          {TitleEl}
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
            <span className="font-medium">{job.company}</span>
            {job.location && <> · <span>{job.location}</span></>}
          </p>
          {job.salary_range && (
            <p className="text-xs text-green-700 dark:text-green-400 mt-1">💰 {job.salary_range}</p>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{postedAgo}</p>
        </div>
        {job.referral_count > 0 && (
          <span className="badge bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 shrink-0">
            🤝 {job.referral_count}
          </span>
        )}
      </div>

      {job.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 line-clamp-2">{job.description}</p>
      )}

      <div className="flex gap-2 mt-4 flex-wrap">
        <a href={smartSearchUrl} target="_blank" rel="noopener noreferrer"
           className="btn-primary text-xs py-1.5 px-3"
           title={isDirectJobUrl ? 'Opens the actual job posting' : 'Direct link unavailable — opens a Google search for this role'}>
          {isDirectJobUrl ? 'Apply on Site ↗' : '🔎 Search Online'}
        </a>
        <Link to={`/referrals?job_id=${job.id}`} className="btn-secondary text-xs py-1.5 px-3">
          🤝 Find Referral
        </Link>
        {!job.application_id ? (
          <button onClick={handleApply} disabled={applying} className="btn-secondary text-xs py-1.5 px-3 border-green-300 text-green-700 dark:text-green-400">
            {applying ? 'Tracking...' : '✓ Mark Applied'}
          </button>
        ) : (
          <Link to={`/applications/${job.application_id}`} className="text-xs px-3 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 transition-colors">
            ✅ Applied
          </Link>
        )}
        <button
          onClick={handleNotFit}
          disabled={notFitting}
          title={job.is_not_fit ? 'Restore this job to the main list' : 'Hide — not a fit for me'}
          className="btn-secondary text-xs py-1.5 px-3 border-red-200 text-red-500 dark:border-red-800 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 ml-auto">
          {notFitting ? '…' : job.is_not_fit ? '↩️ Restore' : '👎 Not Fit'}
        </button>
      </div>
    </div>
  );
}

function AddJobModal({ open, onClose, onAdded }) {
  const [form, setForm] = useState({ title: '', company: '', location: '', job_url: '', platform: 'manual', description: '', salary_range: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await jobsApi.create(form);
      toast.success('Job added!');
      onAdded?.();
      onClose();
      setForm({ title: '', company: '', location: '', job_url: '', platform: 'manual', description: '', salary_range: '' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Job Manually">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Job Title *</label>
            <input required className="input" value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} placeholder="Growth Manager" />
          </div>
          <div>
            <label className="label">Company *</label>
            <input required className="input" value={form.company} onChange={e => setForm(f => ({...f, company: e.target.value}))} placeholder="Acme Corp" />
          </div>
          <div>
            <label className="label">Location</label>
            <input className="input" value={form.location} onChange={e => setForm(f => ({...f, location: e.target.value}))} placeholder="Mumbai" />
          </div>
          <div>
            <label className="label">Platform</label>
            <select className="input" value={form.platform} onChange={e => setForm(f => ({...f, platform: e.target.value}))}>
              <option value="manual">Manual</option>
              <option value="naukri">Naukri</option>
              <option value="linkedin">LinkedIn</option>
              <option value="iimjobs">IIMjobs</option>
              <option value="company_portal">Company Portal</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Job URL</label>
            <input className="input" value={form.job_url} onChange={e => setForm(f => ({...f, job_url: e.target.value}))} placeholder="https://..." />
          </div>
          <div className="col-span-2">
            <label className="label">Salary Range</label>
            <input className="input" value={form.salary_range} onChange={e => setForm(f => ({...f, salary_range: e.target.value}))} placeholder="e.g. 25-35 LPA" />
          </div>
          <div className="col-span-2">
            <label className="label">Description</label>
            <textarea className="input" rows={3} value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Paste job description..." />
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Adding...' : 'Add Job'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function JobListings() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  // draft = what user is typing; applied = what's actually fetched
  const [draftFilters, setDraftFilters] = useState({ search: '', location: '', platform: '', applied: '', days: '', user_exp: '' });
  const [filters, setFilters] = useState({ search: '', location: '', platform: '', applied: '', days: '', user_exp: '' });
  const [stats, setStats] = useState(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 20,
        ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v)),
        ...(showHidden ? { hidden: '1' } : {}),
      };
      const res = await jobsApi.list(params);
      setJobs(res.data || []);
      setTotal(res.pagination?.total || 0);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filters, showHidden]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);
  useEffect(() => { jobsApi.stats().then(r => setStats(r.data)).catch(() => {}); }, []);

  const handleDraftChange = (key, value) => {
    setDraftFilters(f => ({ ...f, [key]: value }));
  };

  const applyFilters = () => {
    setFilters({ ...draftFilters });
    setPage(1);
  };

  const clearFilters = () => {
    const empty = { search: '', location: '', platform: '', applied: '', days: '', user_exp: '' };
    setDraftFilters(empty);
    setFilters(empty);
    setShowHidden(false);
    setPage(1);
  };

  const hasActiveFilters = Object.values(filters).some(v => v);

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      const res = await settingsApi.seedDemo();
      toast.success(res.message);
      fetchJobs();
      jobsApi.stats().then(r => setStats(r.data)).catch(() => {});
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {showHidden ? '👁 Hidden Jobs' : 'Job Listings'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {showHidden ? `${total} hidden job${total !== 1 ? 's' : ''}` : `${total} jobs found`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSeedDemo} disabled={seeding}
            className="btn-secondary text-sm">
            {seeding ? '⏳ Loading...' : '🌱 Load Demo Jobs'}
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn-primary">+ Add Job</button>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="flex gap-4 flex-wrap text-sm">
          {stats.byPlatform?.map(p => (
            <div key={p.platform} className="flex items-center gap-1.5">
              <Badge type={p.platform} size="xs" />
              <span className="text-gray-600 dark:text-gray-400">{p.count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <input
            className="input col-span-2 md:col-span-1"
            placeholder="🔍 Search jobs..."
            value={draftFilters.search}
            onChange={e => handleDraftChange('search', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyFilters()}
          />
          <select className="input" value={draftFilters.location} onChange={e => handleDraftChange('location', e.target.value)}>
            <option value="">All Locations</option>
            <option value="Mumbai">Mumbai</option>
            <option value="Pune">Pune</option>
            <option value="Delhi">Delhi</option>
            <option value="Noida">Noida</option>
            <option value="Gurgaon">Gurgaon</option>
            <option value="Lucknow">Lucknow</option>
            <option value="Bangalore">Bangalore</option>
            <option value="Hyderabad">Hyderabad</option>
          </select>
          <select className="input" value={draftFilters.platform} onChange={e => handleDraftChange('platform', e.target.value)}>
            <option value="">All Platforms</option>
            <option value="naukri">Naukri</option>
            <option value="iimjobs">IIMjobs</option>
            <option value="company_portal">Company Portal</option>
            <option value="linkedin">LinkedIn</option>
            <option value="manual">Manual</option>
          </select>
          <select className="input" value={draftFilters.applied} onChange={e => handleDraftChange('applied', e.target.value)}>
            <option value="">All Status</option>
            <option value="no">Not Applied</option>
            <option value="yes">Applied</option>
          </select>
          <select className="input" value={draftFilters.days} onChange={e => handleDraftChange('days', e.target.value)}>
            <option value="">Any Date</option>
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
            <option value="60">Last 60 days</option>
          </select>
          <select className="input" value={draftFilters.user_exp} onChange={e => handleDraftChange('user_exp', e.target.value)}
            title="Filter jobs where your experience falls within the stated range. Jobs with no range listed are always shown.">
            <option value="">Any Experience</option>
            <option value="2">2 yrs</option>
            <option value="3">3 yrs</option>
            <option value="4">4 yrs</option>
            <option value="5">5 yrs</option>
            <option value="6">6 yrs</option>
            <option value="7">7 yrs</option>
            <option value="8">8 yrs</option>
            <option value="10">10 yrs</option>
          </select>
        </div>
        <div className="flex gap-2 mt-3 flex-wrap items-center">
          <button onClick={applyFilters} className="btn-primary text-sm px-5">
            Search
          </button>
          {(hasActiveFilters || showHidden) && (
            <button onClick={clearFilters} className="btn-secondary text-sm px-4">
              Clear Filters
            </button>
          )}
          <button
            onClick={() => { setShowHidden(h => !h); setPage(1); }}
            className={`text-sm px-4 py-1.5 rounded-lg border transition-all ${
              showHidden
                ? 'bg-red-50 border-red-300 text-red-600 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400'
                : 'btn-secondary'
            }`}
            title={showHidden ? 'Back to normal view' : 'Show jobs you marked as Not Fit'}>
            {showHidden ? '🙈 Hide Hidden Jobs' : '👁 Show Hidden Jobs'}
          </button>
        </div>
      </div>

      {/* Job list */}
      {loading ? (
        <LoadingSpinner text="Loading jobs..." />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon="💼"
          title="No jobs yet"
          description="Load 30 demo jobs from Razorpay, PhonePe, CRED, Darwinbox and more — or click 'Scrape Now' in the sidebar."
          action={
            <div className="flex gap-3 justify-center flex-wrap">
              <button onClick={handleSeedDemo} disabled={seeding} className="btn-primary">
                {seeding ? '⏳ Loading...' : '🌱 Load 30 Demo Jobs'}
              </button>
              <button onClick={() => setShowAddModal(true)} className="btn-secondary">+ Add Manually</button>
            </div>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {jobs.map(job => (
              <JobCard key={job.id} job={job} onApply={fetchJobs} onNotFit={fetchJobs} />
            ))}
          </div>
          {/* Pagination */}
          {total > 20 && (
            <div className="flex items-center justify-center gap-3">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary disabled:opacity-40">← Prev</button>
              <span className="text-sm text-gray-600 dark:text-gray-400">Page {page} of {Math.ceil(total / 20)}</span>
              <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)} className="btn-secondary disabled:opacity-40">Next →</button>
            </div>
          )}
        </>
      )}

      <AddJobModal open={showAddModal} onClose={() => setShowAddModal(false)} onAdded={fetchJobs} />
    </div>
  );
}
