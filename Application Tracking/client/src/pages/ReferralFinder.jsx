import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { referralsApi, jobsApi } from '../api';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import toast from 'react-hot-toast';

const PRIORITY_COLORS = ['', 'bg-gray-200', 'bg-yellow-200', 'bg-blue-200', 'bg-purple-200', 'bg-green-200'];
const PRIORITY_LABELS = ['', '⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'];

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
    <div className={`card p-4 border-l-4 ${referral.contacted ? 'border-green-400' : referral.priority_score >= 4 ? 'border-indigo-400' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge type={referral.connection_type} />
            <span className="text-xs" title={`Priority: ${referral.priority_score}/5`}>
              {PRIORITY_LABELS[referral.priority_score] || ''}
            </span>
            {referral.contacted && <span className="badge bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">✓ Contacted</span>}
            {referral.response_received && <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">💬 Replied</span>}
          </div>

          {isSearchUrl ? (
            <div>
              <p className="font-medium text-indigo-700 dark:text-indigo-300 text-sm">{referral.person_name.replace('[Search: ', '').replace(']', '')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{referral.notes}</p>
            </div>
          ) : (
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">{referral.person_name}</p>
              {referral.current_role && <p className="text-sm text-gray-600 dark:text-gray-400">{referral.current_role}</p>}
              {referral.current_company && <p className="text-xs text-gray-500 dark:text-gray-500">{referral.current_company}</p>}
              {referral.notes && <p className="text-xs text-gray-400 mt-1 italic">{referral.notes}</p>}
            </div>
          )}
        </div>

        <button
          onClick={() => onDelete?.(referral.id)}
          className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
          title="Delete"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      <div className="flex gap-2 mt-3 flex-wrap">
        {referral.linkedin_url && (
          <a href={referral.linkedin_url} target="_blank" rel="noopener noreferrer"
            className="btn-secondary text-xs py-1.5 px-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700">
            🔗 {isSearchUrl ? 'Search LinkedIn' : 'View Profile'}
          </a>
        )}
        {!isSearchUrl && !referral.contacted && (
          <>
            <button onClick={loadMessage} disabled={loadingMsg} className="btn-secondary text-xs py-1.5 px-3">
              {loadingMsg ? '...' : '💬 Message'}
            </button>
            <button onClick={handleContact} disabled={contacting} className="btn-primary text-xs py-1.5 px-3">
              {contacting ? '...' : '✓ Contacted'}
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
              className="btn-primary flex-1"
            >
              📋 Copy Message
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
            <input className="input" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Any additional notes..." />
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Adding...' : 'Add Referral'}</button>
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
      // Load LinkedIn search URLs
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Referral Finder</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Find the right person to refer you — prioritized by alumni & past company connections</p>
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
          <div className="card p-4 bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">{selectedJob.title}</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">{selectedJob.company} · {selectedJob.location}</p>
              </div>
              <div className="flex gap-2">
                {selectedJob.job_url && (
                  <a href={selectedJob.job_url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs">View Job ↗</a>
                )}
                <button onClick={() => setShowAddModal(true)} className="btn-primary text-xs">+ Add Referral</button>
              </div>
            </div>
          </div>

          {/* Priority guide */}
          <div className="card p-4">
            <h3 className="font-medium text-gray-900 dark:text-white mb-3 text-sm">🎯 Search Priority Guide for {selectedJob.company}</h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {searchUrls.slice(0, 6).map((url, i) => (
                <a
                  key={i}
                  href={url.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
                >
                  <span className="text-lg shrink-0">
                    {url.priority >= 5 ? '🔵' : url.priority >= 4 ? '🟢' : url.priority >= 3 ? '🟡' : '⚪'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-indigo-600 truncate">{url.label}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{url.instruction}</div>
                  </div>
                  <span className="text-indigo-400 shrink-0">↗</span>
                </a>
              ))}
            </div>
          </div>

          {/* Referrals list */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Referrals ({referrals.length})
                <span className="ml-2 text-xs text-gray-400 font-normal">
                  {referrals.filter(r => r.contacted).length} contacted · {referrals.filter(r => r.response_received).length} responded
                </span>
              </h3>
              <button onClick={() => setShowAddModal(true)} className="btn-secondary text-xs">+ Add Manually</button>
            </div>

            {loading ? <LoadingSpinner text="Loading referrals..." /> :
              sortedReferrals.length === 0 ? (
                <EmptyState
                  icon="🤝"
                  title="No referrals yet"
                  description="Use the search links above to find potential referrals on LinkedIn, then add them here."
                  action={<button onClick={() => setShowAddModal(true)} className="btn-primary">+ Add Referral</button>}
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
