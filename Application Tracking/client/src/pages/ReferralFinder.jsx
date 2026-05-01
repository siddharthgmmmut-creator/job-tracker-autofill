import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { referralsApi, jobsApi } from '../api';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import toast from 'react-hot-toast';

// Priority colour tokens (used as a 5-dot row in each card header)
const PRIORITY_DOT = {
  5: 'bg-emerald-500',
  4: 'bg-blue-500',
  3: 'bg-amber-400',
  2: 'bg-zinc-400',
  1: 'bg-zinc-400',
};

function PriorityDots({ score = 0 }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`Priority ${score}/5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i <= score ? (PRIORITY_DOT[score] || 'bg-zinc-400') : 'bg-line'}`}
        />
      ))}
    </span>
  );
}

function ReferralCard({ referral, onUpdate, onDelete }) {
  const [showMsg, setShowMsg] = useState(false);
  const [message, setMessage] = useState('');
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [contacting, setContacting] = useState(false);

  const isSearchUrl = referral.person_name?.startsWith('[Search:');

  const loadMessage = async () => {
    setLoadingMsg(true);
    try {
      const res = await referralsApi.getMessageTemplate(referral.id);
      setMessage(res.data.template);
      setShowMsg(true);
    } catch {}
    setLoadingMsg(false);
  };

  const handleContact = async () => {
    setContacting(true);
    try {
      await referralsApi.contact(referral.id);
      toast.success('Marked as contacted!');
      onUpdate?.();
    } catch (err) { toast.error(err.message); }
    setContacting(false);
  };

  return (
    <div className="card-hover p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <Badge type={referral.connection_type} />
            <PriorityDots score={referral.priority_score || 0} />
            {referral.contacted && (
              <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20
                               dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20">
                Contacted
              </span>
            )}
            {referral.response_received && (
              <span className="badge bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20
                               dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20">
                Replied
              </span>
            )}
          </div>

          {isSearchUrl ? (
            <div>
              <p className="text-[13px] font-semibold text-accent-700 dark:text-accent-400 leading-tight">
                {referral.person_name.replace('[Search: ', '').replace(']', '')}
              </p>
              {referral.notes && <p className="text-2xs text-ink-faint mt-1">{referral.notes}</p>}
            </div>
          ) : (
            <div>
              <p className="text-[13px] font-semibold text-ink leading-tight">{referral.person_name}</p>
              {referral.current_role && <p className="text-2xs text-ink-muted mt-0.5">{referral.current_role}</p>}
              {referral.current_company && <p className="text-2xs text-ink-faint">{referral.current_company}</p>}
              {referral.notes && <p className="text-2xs text-ink-faint mt-1.5 italic">{referral.notes}</p>}
            </div>
          )}
        </div>

        <button
          onClick={() => onDelete?.(referral.id)}
          className="text-ink-faint hover:text-rose-500 transition-colors shrink-0"
          title="Delete"
          aria-label="Delete referral"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      <div className="flex gap-2 mt-3 flex-wrap">
        {referral.linkedin_url && (
          <a href={referral.linkedin_url} target="_blank" rel="noopener noreferrer"
             className="btn-accent text-2xs py-1.5 px-3 inline-flex items-center gap-1.5">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 11.01-4.13 2.06 2.06 0 010 4.13zM7.12 20.45H3.56V9h3.56v11.45z"/>
            </svg>
            {isSearchUrl ? 'Search LinkedIn' : 'View Profile'}
          </a>
        )}
        {!isSearchUrl && !referral.contacted && (
          <>
            <button onClick={loadMessage} disabled={loadingMsg} className="btn-secondary text-2xs py-1.5 px-3">
              {loadingMsg ? '…' : 'Message Template'}
            </button>
            <button onClick={handleContact} disabled={contacting}
                    className="btn-ghost text-2xs py-1.5 px-3 inline-flex items-center gap-1">
              {contacting ? '…' : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Mark Contacted
                </>
              )}
            </button>
          </>
        )}
      </div>

      <Modal open={showMsg} onClose={() => setShowMsg(false)} title="LinkedIn Message Template" size="lg">
        <div className="space-y-4">
          <textarea
            className="input font-mono text-sm"
            rows={12}
            value={message}
            onChange={e => setMessage(e.target.value)}
          />
          <div className="flex gap-3">
            <button
              onClick={() => { navigator.clipboard.writeText(message); toast.success('Copied!'); }}
              className="btn-accent flex-1"
            >
              Copy Message
            </button>
            {referral.linkedin_url && (
              <a href={referral.linkedin_url} target="_blank" rel="noopener noreferrer" className="btn-secondary flex-1 text-center">
                Open LinkedIn →
              </a>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function AddReferralModal({ open, onClose, jobId, onAdded }) {
  const [form, setForm] = useState({ person_name: '', linkedin_url: '', current_role: '', current_company: '', connection_type: 'general', notes: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await referralsApi.create({ ...form, job_id: jobId });
      toast.success('Referral added!');
      onAdded?.();
      onClose();
      setForm({ person_name: '', linkedin_url: '', current_role: '', current_company: '', connection_type: 'general', notes: '' });
    } catch (err) { toast.error(err.message); }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Referral">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Person Name *</label>
            <input required className="input" value={form.person_name} onChange={e => setForm(f => ({...f, person_name: e.target.value}))} placeholder="Rahul Sharma" />
          </div>
          <div>
            <label className="label">Connection Type</label>
            <select className="input" value={form.connection_type} onChange={e => setForm(f => ({...f, connection_type: e.target.value}))}>
              <option value="alumni_iim">IIM Lucknow Alumni</option>
              <option value="alumni_mmmut">MMMUT Alumni</option>
              <option value="alumni_sjc">St Joseph's Alumni</option>
              <option value="darwinbox">Darwinbox Colleague</option>
              <option value="prime_focus">Prime Focus Colleague</option>
              <option value="gsk">GSK Colleague</option>
              <option value="role_relevant">Role Relevant</option>
              <option value="general">General</option>
            </select>
          </div>
          <div>
            <label className="label">Current Role</label>
            <input className="input" value={form.current_role} onChange={e => setForm(f => ({...f, current_role: e.target.value}))} placeholder="GTM Manager" />
          </div>
          <div>
            <label className="label">Current Company</label>
            <input className="input" value={form.current_company} onChange={e => setForm(f => ({...f, current_company: e.target.value}))} placeholder="Acme Corp" />
          </div>
          <div className="col-span-2">
            <label className="label">LinkedIn URL</label>
            <input className="input" value={form.linkedin_url} onChange={e => setForm(f => ({...f, linkedin_url: e.target.value}))} placeholder="https://linkedin.com/in/..." />
          </div>
          <div className="col-span-2">
            <label className="label">Notes</label>
            <input className="input" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Any additional notes…" />
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-accent">{saving ? 'Adding…' : 'Add Referral'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function ReferralFinder() {
  const [searchParams] = useSearchParams();
  const jobIdParam = searchParams.get('job_id');

  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(jobIdParam || '');
  const [referrals, setReferrals] = useState([]);
  const [searchUrls, setSearchUrls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);

  useEffect(() => {
    jobsApi.list({ limit: 100, sort: 'scraped_date', order: 'desc' }).then(r => setJobs(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedJobId) {
      loadReferrals(selectedJobId);
      const job = jobs.find(j => j.id === parseInt(selectedJobId));
      setSelectedJob(job);
      referralsApi.getLinkedInSearchUrls(selectedJobId).then(r => setSearchUrls(r.data?.searchUrls || [])).catch(() => {});
    }
  }, [selectedJobId, jobs]);

  const loadReferrals = async (jobId) => {
    setLoading(true);
    try {
      const res = await referralsApi.list({ job_id: jobId });
      setReferrals(res.data || []);
    } catch (err) { toast.error(err.message); }
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this referral?')) return;
    try {
      await referralsApi.delete(id);
      toast.success('Deleted');
      loadReferrals(selectedJobId);
    } catch (err) { toast.error(err.message); }
  };

  const priorityOrder = { alumni_iim: 0, darwinbox: 0, alumni_mmmut: 1, prime_focus: 1, alumni_sjc: 2, gsk: 2, role_relevant: 3, general: 4 };
  const sortedReferrals = [...referrals].sort((a, b) => {
    if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
    return (priorityOrder[a.connection_type] || 9) - (priorityOrder[b.connection_type] || 9);
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <p className="h-eyebrow">Network</p>
        <h1 className="h-page mt-1">Referral Finder</h1>
        <p className="text-2xs text-ink-faint mt-1">
          Find the right person to refer you — prioritized by alumni &amp; past company connections.
        </p>
      </div>

      {/* Job selector */}
      <div className="card p-4">
        <label className="label">Select Job to Find Referrals</label>
        <select
          className="input max-w-lg"
          value={selectedJobId}
          onChange={e => setSelectedJobId(e.target.value)}
        >
          <option value="">— Choose a job —</option>
          {jobs.map(j => (
            <option key={j.id} value={j.id}>{j.company}: {j.title} ({j.location})</option>
          ))}
        </select>
      </div>

      {selectedJobId && selectedJob && (
        <>
          {/* Job context */}
          <div className="card p-4 ring-1 ring-inset ring-accent-500/15 bg-accent-500/5">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <p className="h-eyebrow">Targeting</p>
                <h2 className="h-section mt-0.5">{selectedJob.title}</h2>
                <p className="text-2xs text-ink-muted mt-0.5">{selectedJob.company} · {selectedJob.location}</p>
              </div>
              <div className="flex gap-2">
                {selectedJob.job_url && (
                  <a href={selectedJob.job_url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-2xs">View Job ↗</a>
                )}
                <button onClick={() => setShowAddModal(true)} className="btn-accent text-2xs">Add Referral</button>
              </div>
            </div>
          </div>

          {/* Priority guide */}
          <div className="card p-4">
            <p className="h-eyebrow mb-3">Search Priority for {selectedJob.company}</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {searchUrls.slice(0, 6).map((url, i) => {
                const dot = url.priority >= 5 ? 'bg-emerald-500'
                          : url.priority >= 4 ? 'bg-blue-500'
                          : url.priority >= 3 ? 'bg-amber-400'
                          : 'bg-zinc-400';
                return (
                  <a
                    key={i}
                    href={url.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 bg-surface-sunken border border-line rounded-lg hover:border-line-strong transition-colors group"
                  >
                    <span className={`w-2 h-2 rounded-full ${dot} flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink group-hover:text-accent-600 dark:group-hover:text-accent-400 truncate">{url.label}</div>
                      <div className="text-2xs text-ink-faint">{url.instruction}</div>
                    </div>
                    <span className="text-ink-faint shrink-0">↗</span>
                  </a>
                );
              })}
            </div>
          </div>

          {/* Referrals list */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="h-section">Referrals <span className="tabular text-ink-muted">({referrals.length})</span></h3>
                <p className="text-2xs text-ink-faint mt-0.5 tabular">
                  {referrals.filter(r => r.contacted).length} contacted · {referrals.filter(r => r.response_received).length} responded
                </p>
              </div>
              <button onClick={() => setShowAddModal(true)} className="btn-secondary text-2xs">Add Manually</button>
            </div>

            {loading ? <LoadingSpinner text="Loading referrals…" /> :
              sortedReferrals.length === 0 ? (
                <EmptyState
                  icon="🤝"
                  title="No referrals yet"
                  description="Use the search links above to find potential referrals on LinkedIn, then add them here."
                  action={<button onClick={() => setShowAddModal(true)} className="btn-accent">Add Referral</button>}
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {sortedReferrals.map(ref => (
                    <ReferralCard
                      key={ref.id}
                      referral={ref}
                      onUpdate={() => loadReferrals(selectedJobId)}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )
            }
          </div>
        </>
      )}

      {!selectedJobId && (
        <EmptyState
          icon="🤝"
          title="Select a job to find referrals"
          description="Choose a job from the dropdown above to see referral opportunities and LinkedIn search links."
        />
      )}

      <AddReferralModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        jobId={parseInt(selectedJobId)}
        onAdded={() => loadReferrals(selectedJobId)}
      />
    </div>
  );
}
