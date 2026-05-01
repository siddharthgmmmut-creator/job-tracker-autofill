import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { applicationsApi, jobsApi } from '../api';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';

// ── Column definitions ────────────────────────────────────────────
const COLUMNS = [
  { value: 'pending',     label: 'Pending',     dot: 'bg-amber-400',   colBg: 'bg-amber-50/60   dark:bg-amber-500/5'   },
  { value: 'got_call',    label: 'Got Call',    dot: 'bg-blue-500',    colBg: 'bg-blue-50/60    dark:bg-blue-500/5'    },
  { value: 'in_progress', label: 'In Progress', dot: 'bg-violet-500',  colBg: 'bg-violet-50/60  dark:bg-violet-500/5'  },
  { value: 'rejected',    label: 'Rejected',    dot: 'bg-rose-400',    colBg: 'bg-rose-50/40    dark:bg-rose-500/5'    },
  { value: 'converted',   label: 'Offer',       dot: 'bg-emerald-500', colBg: 'bg-emerald-50/60 dark:bg-emerald-500/5' },
  { value: 'withdrawn',   label: 'Withdrawn',   dot: 'bg-zinc-400',    colBg: 'bg-surface-sunken'                      },
];

const STATUS_OPTIONS = COLUMNS; // alias — same shape, same order

// ── Company avatar (deterministic initials) ───────────────────────
function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

function CompanyAvatar({ company, size = 36 }) {
  const isBlank = !company || company === 'Not Disclosed' || company === 'Company Not Mentioned';
  if (isBlank) {
    return (
      <div style={{ width: size, height: size, minWidth: size }}
           className="flex items-center justify-center rounded-lg bg-surface-sunken border border-line flex-shrink-0">
        <svg className="w-4 h-4 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1" />
        </svg>
      </div>
    );
  }
  const initials = company.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{ width: size, height: size, minWidth: size, background: hashColor(company) }}
         className="flex items-center justify-center rounded-lg flex-shrink-0 text-white font-semibold"
         title={company}>
      <span style={{ fontSize: Math.round(size * 0.38) }}>{initials}</span>
    </div>
  );
}

// ── Detail modal — full editing surface ───────────────────────────
function DetailModal({ app, open, onClose, onUpdate }) {
  const [updating, setUpdating] = useState(false);
  const [notes, setNotes]       = useState(app?.notes || '');

  // Sync notes when app changes
  useEffect(() => { setNotes(app?.notes || ''); }, [app]);

  if (!app) return null;

  const appliedDate   = app.applied_date       ? format(parseISO(app.applied_date),       'dd MMM yyyy') : '—';
  const responsDate   = app.first_response_date ? format(parseISO(app.first_response_date), 'dd MMM')     : '—';
  const followUpDate  = app.follow_up_date      ? format(parseISO(app.follow_up_date),      'dd MMM')     : null;
  const isFollowUpDue = app.follow_up_date && new Date(app.follow_up_date) <= new Date()
    && !['rejected', 'converted', 'withdrawn'].includes(app.application_status);

  const handleStatusChange = async (newStatus) => {
    setUpdating(true);
    try {
      await applicationsApi.update(app.id, { application_status: newStatus });
      toast.success(`Moved to ${newStatus.replace('_', ' ')}`);
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

  return (
    <Modal open={open} onClose={onClose} title={`${app.company} — ${app.job_title}`} size="lg">
      <div className="space-y-5">
        {/* Links */}
        <div className="flex gap-2 flex-wrap">
          {app.job_url && (
            <a href={app.job_url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-2xs">
              View Job ↗
            </a>
          )}
          <Link to={`/referrals?job_id=${app.job_id}`} className="btn-secondary text-2xs">
            Find Referrals
          </Link>
        </div>

        {/* Stage picker */}
        <div>
          <label className="label">Stage</label>
          <div className="flex gap-2 flex-wrap">
            {STATUS_OPTIONS.map(s => {
              const active = app.application_status === s.value;
              return (
                <button
                  key={s.value}
                  disabled={updating}
                  onClick={() => handleStatusChange(s.value)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    active
                      ? 'bg-ink text-surface border-ink dark:bg-white dark:text-zinc-900 dark:border-white'
                      : 'bg-surface text-ink-muted border-line hover:border-line-strong hover:text-ink'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-current opacity-60' : s.dot}`} />
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Applied',   value: appliedDate  },
            { label: 'Response',  value: responsDate  },
            { label: 'Follow-up', value: followUpDate || '—',
              highlight: isFollowUpDue },
          ].map(({ label, value, highlight }) => (
            <div key={label} className="bg-surface-sunken border border-line rounded-lg p-3">
              <p className="h-eyebrow mb-1">{label}</p>
              <p className={`text-sm font-medium tabular ${highlight ? 'text-amber-600 dark:text-amber-400' : 'text-ink'}`}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* Follow-up date input */}
        <div>
          <label className="label">Set Follow-up Date</label>
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

        {/* Notes */}
        <div>
          <label className="label">Notes</label>
          <textarea
            className="input"
            rows={4}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Interview notes, contacts reached, follow-up tasks…"
          />
          <button onClick={handleSaveNotes} className="btn-accent text-2xs mt-2">Save Notes</button>
        </div>

        {/* Archive */}
        <div className="pt-3 border-t border-line">
          <button
            onClick={async () => {
              if (!confirm('Archive this application?')) return;
              await applicationsApi.delete(app.id);
              toast.success('Application archived');
              onClose();
              onUpdate?.();
            }}
            className="btn-danger text-2xs"
          >
            Archive Application
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Compact Kanban card ───────────────────────────────────────────
function KanbanCard({ app, onOpen }) {
  const appliedDate = app.applied_date ? format(parseISO(app.applied_date), 'dd MMM') : null;
  const isFollowUpDue = app.follow_up_date && new Date(app.follow_up_date) <= new Date()
    && !['rejected', 'converted', 'withdrawn'].includes(app.application_status);
  const isOffer = app.application_status === 'converted';

  return (
    <button
      onClick={() => onOpen(app)}
      className={`w-full text-left card-hover p-3 flex items-start gap-2.5 group ${
        isOffer ? 'ring-1 ring-inset ring-emerald-600/20' : ''
      }`}
    >
      {/* Avatar */}
      <CompanyAvatar company={app.company} size={36} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-ink leading-tight truncate">
          {app.company || 'Unknown Company'}
        </p>
        <p className="text-2xs text-ink-muted mt-0.5 line-clamp-1 leading-snug">
          {app.job_title}
        </p>

        {/* Meta row */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Badge type={app.platform} />
          {appliedDate && (
            <span className="text-2xs text-ink-faint tabular">{appliedDate}</span>
          )}
          {isFollowUpDue && (
            <span className="inline-flex items-center gap-1 text-2xs font-medium
                             text-amber-700 dark:text-amber-400">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Follow-up
            </span>
          )}
        </div>
      </div>

      {/* Chevron — visible on hover */}
      <svg className="w-4 h-4 text-ink-faint opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
           fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

// ── Kanban column ─────────────────────────────────────────────────
function KanbanColumn({ col, cards, onOpen, onAdd, totalApps }) {
  return (
    <div className="w-[272px] flex-shrink-0 flex flex-col">
      {/* Column header */}
      <div className="flex items-center gap-2 px-1 pb-2 flex-shrink-0">
        <span className={`w-2 h-2 rounded-full ${col.dot} flex-shrink-0`} />
        <span className="text-[13px] font-semibold text-ink">{col.label}</span>
        <span className="ml-auto text-2xs text-ink-faint tabular font-medium">
          {cards.length > 0 ? cards.length : '—'}
        </span>
      </div>

      {/* Cards area */}
      <div
        className={`flex-1 rounded-xl border border-line p-2 space-y-2 overflow-y-auto ${col.colBg}`}
        style={{ maxHeight: 'calc(100vh - 200px)' }}
      >
        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <span className={`w-3 h-3 rounded-full ${col.dot} opacity-30`} />
            <p className="text-2xs text-ink-faint text-center">
              {totalApps === 0 ? 'No applications yet' : 'None here'}
            </p>
          </div>
        ) : (
          cards.map(app => (
            <KanbanCard key={app.id} app={app} onOpen={onOpen} />
          ))
        )}

        {/* Add to column shortcut */}
        {col.value === 'pending' && (
          <button
            onClick={onAdd}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-2xs text-ink-faint
                       hover:text-ink hover:bg-surface transition-colors border border-dashed border-line"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add application
          </button>
        )}
      </div>
    </div>
  );
}

// ── Add application modal ─────────────────────────────────────────
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
          <select required className="input" value={form.job_id}
                  onChange={e => setForm(f => ({...f, job_id: e.target.value}))}>
            <option value="">— Select job —</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.company}: {j.title}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input" rows={3} value={form.notes}
                    onChange={e => setForm(f => ({...f, notes: e.target.value}))}
                    placeholder="Referral contacted, platform used…" />
        </div>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-accent">
            {saving ? 'Saving…' : 'Track Application'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Main ──────────────────────────────────────────────────────────
export default function ApplicationTracker() {
  // eslint-disable-next-line no-unused-vars
  const [searchParams] = useSearchParams();
  const [apps,          setApps]          = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [detailApp,     setDetailApp]     = useState(null); // app currently open in detail modal

  // Fetch ALL applications at once — grouped client-side for Kanban
  const fetchApps = useCallback(async () => {
    setLoading(true);
    try {
      const res = await applicationsApi.list({ limit: 500 });
      setApps(res.data || []);
    } catch (err) { toast.error(err.message); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  // Group by status
  const grouped = useMemo(() => {
    const map = {};
    COLUMNS.forEach(col => { map[col.value] = []; });
    apps.forEach(app => {
      const key = app.application_status;
      if (map[key]) map[key].push(app);
      // unknown statuses go to pending
      else if (map['pending']) map['pending'].push(app);
    });
    return map;
  }, [apps]);

  const total = apps.length;

  // When an app is updated via the detail modal, refresh and keep modal open on the
  // updated app so status button changes feel instant.
  const handleUpdate = useCallback(async () => {
    await fetchApps();
    // re-sync the open detail app from the fresh data
    setDetailApp(prev => prev ? apps.find(a => a.id === prev.id) ?? null : null);
  }, [fetchApps, apps]);

  const openDetail = (app) => setDetailApp(app);
  const closeDetail = () => setDetailApp(null);

  if (loading) return <LoadingSpinner text="Loading applications…" />;

  return (
    <div className="flex flex-col animate-fade-in -mx-6 -mt-6" style={{ minHeight: '100vh' }}>

      {/* ── Header bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-4
                      border-b border-line bg-surface flex-shrink-0">
        <div>
          <p className="h-eyebrow">Pipeline</p>
          <h1 className="h-page mt-1">Application Tracker</h1>
          <p className="text-2xs text-ink-faint mt-1 tabular">{total} total</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { applicationsApi.exportExcel(); toast.success('Downloading Excel…'); }}
            className="btn-secondary text-sm"
          >
            Export Excel
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn-accent">
            Track Application
          </button>
        </div>
      </div>

      {/* ── Kanban board ───────────────────────────────────────── */}
      {total === 0 ? (
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <EmptyState
            icon="📋"
            title="No applications yet"
            description="Start applying to jobs and track your progress here."
            action={
              <button onClick={() => setShowAddModal(true)} className="btn-accent">
                Track First Application
              </button>
            }
          />
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto px-6 py-5">
          <div className="flex gap-4 items-start" style={{ minWidth: 'max-content' }}>
            {COLUMNS.map(col => (
              <KanbanColumn
                key={col.value}
                col={col}
                cards={grouped[col.value] || []}
                onOpen={openDetail}
                onAdd={() => setShowAddModal(true)}
                totalApps={total}
              />
            ))}
          </div>
        </div>
      )}

      {/* Detail modal */}
      <DetailModal
        app={detailApp}
        open={!!detailApp}
        onClose={closeDetail}
        onUpdate={handleUpdate}
      />

      {/* Add modal */}
      <AddApplicationModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdded={fetchApps}
      />
    </div>
  );
}
