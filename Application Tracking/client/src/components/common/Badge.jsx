const STATUS_STYLES = {
  // Application pipeline
  pending:     'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30',
  got_call:    'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/30',
  in_progress: 'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-500/30',
  rejected:    'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/30',
  converted:   'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30',
  withdrawn:   'bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-500/30',
  // Connection types
  alumni_iim:  'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-500/30',
  alumni_mmmut:'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-400 dark:ring-indigo-500/30',
  alumni_sjc:  'bg-teal-50 text-teal-700 ring-teal-600/20 dark:bg-teal-500/10 dark:text-teal-400 dark:ring-teal-500/30',
  darwinbox:   'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/30',
  prime_focus: 'bg-cyan-50 text-cyan-700 ring-cyan-600/20 dark:bg-cyan-500/10 dark:text-cyan-400 dark:ring-cyan-500/30',
  gsk:         'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30',
  role_relevant:'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30',
  general:     'bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-500/30',
  // Platforms
  naukri:      'bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-500/30',
  linkedin:    'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-500/30',
  iimjobs:     'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-500/30',
  manual:      'bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-500/30',
  company_portal: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30',
};

const STATUS_LABELS = {
  pending: 'Pending', got_call: 'Got Call', in_progress: 'In Progress',
  rejected: 'Rejected', converted: 'Offer', withdrawn: 'Withdrawn',
  alumni_iim: 'IIM Alumni', alumni_mmmut: 'MMMUT Alumni', alumni_sjc: 'SJC Alumni',
  darwinbox: 'Darwinbox', prime_focus: 'Prime Focus', gsk: 'GSK',
  role_relevant: 'Role Match', general: 'Senior Emp.',
  naukri: 'Naukri', linkedin: 'LinkedIn', iimjobs: 'IIMjobs',
  manual: 'Manual', company_portal: 'Company',
};

export default function Badge({ type, label, size = 'sm' }) {
  const style = STATUS_STYLES[type] || STATUS_STYLES.general;
  const text  = label || STATUS_LABELS[type] || type;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-2xs font-medium
                      ring-1 ring-inset ${style}
                      ${size === 'xs' ? 'text-[10px] px-1.5 py-0' : ''}`}>
      {text}
    </span>
  );
}
