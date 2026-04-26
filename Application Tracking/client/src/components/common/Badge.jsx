const STATUS_STYLES = {
  pending:     'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  got_call:    'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  in_progress: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  rejected:    'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  converted:   'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  withdrawn:   'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  // Connection types
  alumni_iim:  'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  alumni_mmmut:'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  alumni_sjc:  'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  darwinbox:   'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  prime_focus: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  gsk:         'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  role_relevant:'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  general:     'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  naukri:      'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  linkedin:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  iimjobs:     'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  manual:      'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  company_portal: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
};

const STATUS_LABELS = {
  pending: 'Pending', got_call: 'Got Call', in_progress: 'In Progress',
  rejected: 'Rejected', converted: 'Offer!', withdrawn: 'Withdrawn',
  alumni_iim: 'IIM Alumni', alumni_mmmut: 'MMMUT Alumni', alumni_sjc: "SJC Alumni",
  darwinbox: 'Darwinbox', prime_focus: 'Prime Focus', gsk: 'GSK',
  role_relevant: 'Role Match', general: 'Senior Emp.',
  naukri: 'Naukri', linkedin: 'LinkedIn', iimjobs: 'IIMjobs',
  manual: 'Manual', company_portal: 'Company',
};

export default function Badge({ type, label, size = 'sm' }) {
  const style = STATUS_STYLES[type] || STATUS_STYLES.general;
  const text = label || STATUS_LABELS[type] || type;
  return (
    <span className={`badge ${style} ${size === 'xs' ? 'text-xs px-1.5 py-0.5' : ''}`}>
      {text}
    </span>
  );
}
