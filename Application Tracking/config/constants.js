// ============================================================
// USER PROFILE CONSTANTS - Siddharth's Job Search Config
// ============================================================

const TARGET_ROLES = [
  'Growth Manager',
  'Senior Growth Manager',
  'Growth GTM Manager',
  'Growth Business Planning Manager',
  'Growth Marketing Manager',
  'GTM Manager',
  'GTM Lead',
  'Go-to-Market Manager',
  'AI GTM Engineer',
  'Chief of Staff',
  "CEO's Office",
  "Founder's Office",
  'Operations Manager',
  'Business Planning Manager',
  'Senior Manager Operations',
  'Strategic Operations Manager',
  'Revenue Operations Manager',
];

const SEARCH_KEYWORDS = [
  // Core — highest yield for target profile
  'growth manager',
  'gtm manager',
  'go-to-market manager',
  'chief of staff',
  "founder's office",
  'growth marketing',
  'revenue operations',
  'growth lead',
  // Strategy & Ops
  'program manager',
  'senior program manager',
  'business operations',
  'strategy analyst',
  'strategy operations',
  'product strategy',
  'ceo office',
  'operations manager',
  'business planning manager',
  'senior manager operations',
  // Broader reach
  'product manager',
  'business analyst',
  'performance marketing',
  'digital marketing manager',
  'ai gtm',
];

const LOCATIONS = {
  PRIMARY:    ['Mumbai', 'Navi Mumbai', 'Thane'],
  SECONDARY:  ['Pune'],
  TERTIARY:   ['Delhi', 'Noida', 'Gurgaon', 'Gurugram', 'New Delhi', 'NCR'],
  EXTENDED:   ['Bangalore', 'Bengaluru', 'Hyderabad', 'Chennai'],
  METRO:      ['Kolkata', 'Ahmedabad', 'Jaipur'],
  REMOTE:     ['Remote', 'Remote India'],
  FALLBACK:   ['Lucknow'],
  EXCLUDE:    ['Kochi', 'Cochin', 'Coimbatore', 'Trivandrum', 'Kanpur'],
};

const LOCATION_PRIORITY = {
  // Primary
  Mumbai: 1, 'Navi Mumbai': 1, Thane: 1,
  Pune: 2,
  // NCR
  Delhi: 3, Noida: 3, Gurgaon: 3, Gurugram: 3, 'New Delhi': 3, NCR: 3,
  Remote: 3, 'Remote India': 3,
  // South / Other metros
  Bangalore: 5, Bengaluru: 5, Hyderabad: 5, Chennai: 5,
  Kolkata: 5, Ahmedabad: 5, Jaipur: 5,
  Lucknow: 6,
};

const ALL_SEARCH_LOCATIONS = [
  ...LOCATIONS.PRIMARY,
  ...LOCATIONS.SECONDARY,
  ...LOCATIONS.TERTIARY,
  ...LOCATIONS.EXTENDED,
  ...LOCATIONS.METRO,
  ...LOCATIONS.REMOTE,
  ...LOCATIONS.FALLBACK,
];

// Alumni Networks - for referral priority scoring
const ALUMNI_NETWORKS = {
  IIM_LUCKNOW: {
    name: 'IIM Lucknow',
    type: 'alumni_iim',
    priority: 5,
    keywords: ['IIM Lucknow', 'IIML', 'Indian Institute of Management Lucknow'],
  },
  MMMUT: {
    name: 'MMMUT Gorakhpur',
    type: 'alumni_mmmut',
    priority: 4,
    keywords: ['MMMUT', 'Madan Mohan Malaviya', 'MMMUT Gorakhpur'],
  },
  ST_JOSEPHS: {
    name: "St Joseph's College Allahabad",
    type: 'alumni_sjc',
    priority: 3,
    keywords: ["St Joseph's", 'Saint Joseph', 'SJC Allahabad'],
  },
};

// Previous Companies - for referral priority
const PREVIOUS_COMPANIES = {
  DARWINBOX: {
    name: 'Darwinbox',
    type: 'darwinbox',
    priority: 5,
    period: 'Jul 2025 - Apr 2026',
  },
  PRIME_FOCUS: {
    name: 'Prime Focus Technologies',
    type: 'prime_focus',
    priority: 4,
    period: 'Jan 2023 - Feb 2025',
  },
  GSK: {
    name: 'GSK Pharmaceuticals',
    type: 'gsk',
    priority: 3,
    period: 'Jun 2021 - Jan 2023',
  },
};

// Relevant roles for referral finding
const RELEVANT_REFERRAL_ROLES = [
  'GTM Manager',
  'Growth Manager',
  'Operations Manager',
  'Chief of Staff',
  'Head of Operations',
  'VP Operations',
  'Director of Growth',
  'Business Planning',
  'HR Manager',
  'Talent Acquisition',
  'Recruiter',
  'Hiring Manager',
];

// Connection types in priority order
const CONNECTION_TYPES = {
  ALUMNI_IIM: { type: 'alumni_iim', label: 'IIM Lucknow Alumni', priority: 5, color: 'purple' },
  DARWINBOX: { type: 'darwinbox', label: 'Darwinbox Colleague', priority: 5, color: 'blue' },
  ALUMNI_MMMUT: { type: 'alumni_mmmut', label: 'MMMUT Alumni', priority: 4, color: 'indigo' },
  PRIME_FOCUS: { type: 'prime_focus', label: 'Prime Focus Colleague', priority: 4, color: 'cyan' },
  ALUMNI_SJC: { type: 'alumni_sjc', label: "St Joseph's Alumni", priority: 3, color: 'teal' },
  GSK: { type: 'gsk', label: 'GSK Colleague', priority: 3, color: 'green' },
  ROLE_RELEVANT: { type: 'role_relevant', label: 'Role Relevant', priority: 2, color: 'yellow' },
  GENERAL: { type: 'general', label: 'Senior Employee', priority: 1, color: 'gray' },
};

// Application status definitions
const APPLICATION_STATUS = {
  PENDING: { value: 'pending', label: 'Pending', color: 'yellow', description: 'Application submitted, awaiting response' },
  GOT_CALL: { value: 'got_call', label: 'Got Call', color: 'blue', description: 'Phone/video call scheduled or completed' },
  IN_PROGRESS: { value: 'in_progress', label: 'In Progress', color: 'purple', description: 'Interview process ongoing' },
  REJECTED: { value: 'rejected', label: 'Rejected', color: 'red', description: 'Application rejected' },
  CONVERTED: { value: 'converted', label: 'Offer Received', color: 'green', description: 'Offer received!' },
  WITHDRAWN: { value: 'withdrawn', label: 'Withdrawn', color: 'gray', description: 'Application withdrawn' },
};

// Job platforms
const PLATFORMS = {
  NAUKRI: 'naukri',
  LINKEDIN: 'linkedin',
  IIMJOBS: 'iimjobs',
  COMPANY_PORTAL: 'company_portal',
  MANUAL: 'manual',
};

// Salary config
const SALARY_CONFIG = {
  MINIMUM_FIXED_LPA: 27,
  PREVIOUS_FIXED_LPA: 27,
  PREVIOUS_VARIABLE_LPA: 3,
  PREVIOUS_TOTAL_LPA: 30,
};

// Scraper config
const SCRAPER_CONFIG = {
  // Freshness: only fetch jobs posted within this many days.
  // 7 days → near-zero DB deduplication, high new-job yield.
  MAX_AGE_DAYS: 7,

  RESULTS_PER_SEARCH: 50,
  REQUEST_DELAY_MS: 800,      // ms between page loads within a group
  MAX_RETRIES: 3,
  TIMEOUT_MS: 30000,

  // Naukri pagination + concurrency
  NAUKRI_PAGES: 10,           // max pages per keyword×location combo
  NAUKRI_CONCURRENCY: 5,      // simultaneous browser pages

  // IIMjobs
  IIMJOBS_PAGES: 2,
  IIMJOBS_CONCURRENCY: 4,
};

module.exports = {
  TARGET_ROLES,
  SEARCH_KEYWORDS,
  LOCATIONS,
  LOCATION_PRIORITY,
  ALL_SEARCH_LOCATIONS,
  ALUMNI_NETWORKS,
  PREVIOUS_COMPANIES,
  RELEVANT_REFERRAL_ROLES,
  CONNECTION_TYPES,
  APPLICATION_STATUS,
  PLATFORMS,
  SALARY_CONFIG,
  SCRAPER_CONFIG,
};
