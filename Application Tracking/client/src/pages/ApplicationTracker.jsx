import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { applicationsApi, jobsApi } from '../api';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import toast from 'react-hot-toast';
import { format, parseISO, formatDistanceToNow } from 'date-fns';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', emoji: '⏳' },
  { value: 'got_call', label: 'Got Call', emoji: '📞' },
  { value: 'in_progress', label: 'In Progress', emoji: '🔄' },
  { value: 'rejected', label: 'Rejected', emoji: '❌' },
  { value: 'converted', label: 'Offer!', emoji: '🎉' },
  { value: 'withdrawn', label: 'Withdrawn', emoji: '↩️' },
];

function ApplicationCard({ app, onUpdate }) {
  const [updating, setUpdating] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [notes, setNotes] = useState(app.notes || '');

  const handleStatusChange = async (newStatus) => {
    setUpdating(true);
    try {
      await applicationsApi.update(app.id, { application_status: newStatus });
      toast.success(`Status → ${newStatus}`);
      onUpdate?.();
    } catch (err) { toast.error(err.message); }
    setUpdating(false);
  };

  const handleSaveNotes = async () => {
    try {
      await applicationsApi.update(app.id, { notes });
      toast.success('Notes saved');
    } catch (err) { toast.error(err.message); }
  };

  const appliedDate = app.applied_date ? format(parseISO(app.applied_date), 'dd MMM yyyy') : '-';
  const followUpDate = app.follow_up_date ? format(parseISO(app.follow_up_date), 'dd MMM') : null;
  const isFollowUpDue = app.follow_up_date && new Date(app.follow_up_date) <= new Date()
    && !['rejected', 'converted', 'withdrawn'].includes(app.application_status);

  return (
    <>
      <div className={`card p-4 hover:shadow-md transition-shadow ${app.application_status === 'converted' ? 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/10' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge type={app.application_status} />
              <Badge type={app.platform} size="xs" />
              {isFollowUpDue && (
                <span className="badge bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 text-xs">⏰ Follow-up due</span>
              )}
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">{app.company}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{app.job_title}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Applied {appliedDate}
              {followUpDate && ` · Follow-up ${followUpDate}`}
            </p>
          </div>
          <button onClick={() => setShowDetail(true)} className="text-gray-400 hover:text-indigo-600 transition-colors shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Quick status change */}
        <div className="mt-3 flex gap-1.5 flex-wrap">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s.value}
              disabled={updating || app.application_status === s.value}
              onClick={() => handleStatusChange(s.value)}
              className={`text-xs px-2 py-1 rounded-md transition-colors ${
                app.application_status === s.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {s.emoji} {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Detail Modal */}
      <Modal open={showDetail} onClose={() => setShowDetail(false)} title={`${app.company} - ${app.job_title}`} size="lg">
        <div className="space-y-5">
          {/* Links */}
          <div className="flex gap-2">
            {app.job_url && (
              <a href={app.job_url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs">View Job ↗</a>
            )}
            <Link to={`/referrals?job_id=${app.job_id}`} className="btn-secondary text-xs">🤝 Referrals</Link>
          </div>

          {/* Status */}
          <div>
            <label className="label">Status</label>
            <div className="flex gap-2 flex-wrap">
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s.value}
                  disabled={updating}
                  onClick={() => { handleStatusChange(s.value); }}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    app.application_status === s.value
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-indigo-400'
                  }`}
                >
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Applied</div>
              <div className="font-medium text-gray-900 dark:text-white">{appliedDate}</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Response</div>
              <div className="font-medium text-gray-900 dark:text-white">
                {app.first_response_date ? format(parseISO(app.first_response_date), 'dd MMM') : '-'}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Follow-up</div>
              <div className={`font-medium ${isFollowUpDue ? 'text-orange-500' : 'text-gray-900 dark:text-white'}`}>
                {followUpDate || '-'}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="label">Notes</label>
            <textarea
              className="input"
              rows={4}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Interview notes, follow-up tasks, contacts reached..."
            />
            <button onClick={handleSaveNotes} className="btn-primary text-xs mt-2">Save Notes</button>
          </div>

          {/* Follow-up date */}
          <div>
            <label className="label">Follow-up Date</label>
            <input
              type="date"
              className="input max-w-xs"
              defaultValue={app.follow_up_date ? app.follow_up_date.split('T')[0] : ''}
              onChange={async (e) => {
                try {
                  await applicationsApi.update(app.id, { follow_up_date: e.target.value });
                  toast.success('Follow-up date updated');
                  onUpdate?.();
                } catch {}
              }}
            />
          </div>

          {/* Delete */}
          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={async () => {
                if (!confirm('Archive this application?')) return;
                await applicationsApi.delete(app.id);
                toast.success('Application archived');
                setShowDetail(false);
                onUpdate?.();
              }}
              className="btn-danger text-xs"
            >
              Archive Application
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function AddApplicationModal({ open, onClose, onAdded }) {
  const [jobs, setJobs] = useState([]);
  const [form, setForm] = useState({ job_id: '', notes: '', follow_up_date: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) jobsApi.list({ limit: 100 }).then(r => setJobs(r.data || [])).catch(() => {});
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await applicationsApi.create(form);
      toast.success('Application tracked!');
      onAdded?.();
      onClose();
      setForm({ job_id: '', notes: '', follow_up_date: '' });
    } catch (err) { toast.error(err.message); }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Track New Application">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Select Job *</label>
          <select required className="input" value={form.job_id} onChange={e => setForm(f => ({...f, job_id: e.target.value}))}>
            <option value="">— Select job —</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.company}: {j.title}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input" rows={3} value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Referral contacted, platform used..." />
        </div>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Track Application'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function ApplicationTracker() {
  const [searchParams] = useSearchParams();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchApps = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20, ...(statusFilter ? { status: statusFilter } : {}) };
      const res = await applicationsApi.list(params);
      setApps(res.data || []);
      setTotal(res.pagination?.total || 0);
    } catch (err) { toast.error(err.message); }
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  const statusCounts = apps.reduce((acc, a) => { acc[a.application_status] = (acc[a.application_status] || 0) + 1; return acc; }, {});

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Application Tracker</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{total} total applications</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { applicationsApi.exportExcel(); toast.success('Downloading Excel...'); }}
            className="btn-secondary text-sm"
          >
            📥 Export Excel
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn-primary">+ Track Application</button>
        </div>
      </div>

      {/* Status filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { value: '', label: 'All', count: total },
          ...STATUS_OPTIONS.map(s => ({ value: s.value, label: `${s.emoji} ${s.label}`, count: statusCounts[s.value] || 0 }))
        ].map(f => (
          <button
            key={f.value}
            onClick={() => { setStatusFilter(f.value); setPage(1); }}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
              statusFilter === f.value
                ? 'bg-indigo-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:border-indigo-400'
            }`}
          >
            {f.label} {f.count > 0 && <span className="ml-1 opacity-75">({f.count})</span>}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner text="Loading applications..." /> :
        apps.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No applications yet"
            description="Start applying to jobs and track your progress here."
            action={<button onClick={() => setShowAddModal(true)} className="btn-primary">+ Track First Application</button>}
          />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {apps.map(app => (
                <ApplicationCard key={app.id} app={app} onUpdate={fetchApps} />
              ))}
            </div>
            {total > 20 && (
              <div className="flex items-center justify-center gap-3">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary disabled:opacity-40">← Prev</button>
                <span className="text-sm text-gray-600 dark:text-gray-400">Page {page} of {Math.ceil(total / 20)}</span>
                <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)} className="btn-secondary disabled:opacity-40">Next →</button>
              </div>
            )}
          </>
        )
      }

      <AddApplicationModal open={showAddModal} onClose={() => setShowAddModal(false)} onAdded={fetchApps} />
    </div>
  );
}
