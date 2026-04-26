import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  res => res.data,
  err => {
    const msg = err.response?.data?.error || err.message || 'Request failed';
    return Promise.reject(new Error(msg));
  }
);

// ── Jobs ────────────────────────────────────────────────────
export const jobsApi = {
  list: (params) => api.get('/jobs', { params }),
  stats: () => api.get('/jobs/stats'),
  get: (id) => api.get(`/jobs/${id}`),
  create: (data) => api.post('/jobs', data),
  update: (id, data) => api.put(`/jobs/${id}`, data),
  delete: (id, permanent = false) => api.delete(`/jobs/${id}`, { params: { permanent } }),
  markNotFit: (id) => api.patch(`/jobs/${id}/not-fit`),
};

// ── Referrals ────────────────────────────────────────────────
export const referralsApi = {
  list: (params) => api.get('/referrals', { params }),
  get: (id) => api.get(`/referrals/${id}`),
  create: (data) => api.post('/referrals', data),
  update: (id, data) => api.put(`/referrals/${id}`, data),
  contact: (id, notes) => api.post(`/referrals/${id}/contact`, { notes }),
  delete: (id) => api.delete(`/referrals/${id}`),
  getLinkedInSearchUrls: (jobId) => api.get(`/referrals/linkedin-search/${jobId}`),
  getMessageTemplate: (referralId) => api.get(`/referrals/message-template/${referralId}`),
};

// ── Applications ─────────────────────────────────────────────
export const applicationsApi = {
  list: (params) => api.get('/applications', { params }),
  pendingFollowups: () => api.get('/applications/pending-followups'),
  get: (id) => api.get(`/applications/${id}`),
  create: (data) => api.post('/applications', data),
  update: (id, data) => api.put(`/applications/${id}`, data),
  delete: (id) => api.delete(`/applications/${id}`),
  history: (id) => api.get(`/applications/${id}/history`),
  exportExcel: () => window.open('/api/applications/export-excel', '_blank'),
};

// ── Analytics ─────────────────────────────────────────────────
export const analyticsApi = {
  overview: () => api.get('/analytics/overview'),
  daily: (days) => api.get('/analytics/daily', { params: { days } }),
  byCompany: () => api.get('/analytics/by-company'),
  byRole: () => api.get('/analytics/by-role'),
  byLocation: () => api.get('/analytics/by-location'),
  referralEffectiveness: () => api.get('/analytics/referral-effectiveness'),
  scrapeLogs: () => api.get('/analytics/scrape-logs'),
  export: () => window.open('/api/analytics/export', '_blank'),
};

// ── Settings ──────────────────────────────────────────────────
export const settingsApi = {
  get: () => api.get('/settings'),
  update: (name, value, type) => api.put(`/settings/${name}`, { value, type }),
  bulkUpdate: (settings) => api.post('/settings/bulk', { settings }),
  createBackup: () => api.post('/settings/backup'),
  listBackups: () => api.get('/settings/backups/list'),
  triggerScrape: () => api.post('/settings/scrape/run'),
  seedDemo: () => api.post('/settings/seed-demo'),
  systemStatus: () => api.get('/settings/system/status'),
};
