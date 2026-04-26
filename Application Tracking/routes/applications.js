const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { logger } = require('../middleware/logger');
const { APPLICATION_STATUS } = require('../config/constants');
const XLSX = require('xlsx');

// GET /api/applications - All applications
router.get('/', (req, res) => {
  const db = getDb();
  const { status, page = 1, limit = 50, sort = 'applied_date', order = 'desc' } = req.query;

  let query = `
    SELECT a.*,
      j.title as job_title, j.company, j.location, j.job_url, j.platform,
      j.posted_date, j.salary_range,
      (SELECT COUNT(*) FROM referrals r WHERE r.job_id = a.job_id) as referral_count
    FROM applications a
    JOIN jobs j ON a.job_id = j.id
    WHERE a.is_active = 1
  `;
  const params = [];

  if (status) {
    query += ' AND a.application_status = ?';
    params.push(status);
  }

  const allowedSorts = ['applied_date', 'application_status', 'follow_up_date', 'company'];
  const sortCol = allowedSorts.includes(sort) ? sort : 'applied_date';
  const sortDir = order === 'asc' ? 'ASC' : 'DESC';

  const sortTable = ['company'].includes(sortCol) ? 'j' : 'a';
  query += ` ORDER BY ${sortTable}.${sortCol} ${sortDir}`;

  const countQuery = query.replace(/SELECT a\.\*.*?FROM applications a/s, 'SELECT COUNT(*) as total FROM applications a');
  const total = db.prepare(countQuery).get(...params)?.total || 0;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  query += ' LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);

  const apps = db.prepare(query).all(...params);
  res.json({
    success: true,
    data: apps,
    pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
  });
});

// GET /api/applications/export-excel - Download all applications as Excel
router.get('/export-excel', (req, res) => {
  const db = getDb();
  const apps = db.prepare(`
    SELECT
      j.company           AS "Company",
      j.title             AS "Job Title",
      j.location          AS "Location",
      j.salary_range      AS "Salary Range",
      j.platform          AS "Platform",
      a.applied_date      AS "Applied Date",
      a.application_status AS "Status",
      a.first_response_date AS "First Response Date",
      a.interview_date    AS "Interview Date",
      a.offer_amount      AS "Offer Amount",
      a.referral_contacted_names AS "Referrals Contacted",
      a.notes             AS "Notes",
      a.follow_up_date    AS "Follow-up Date",
      j.job_url           AS "Job URL"
    FROM applications a
    JOIN jobs j ON a.job_id = j.id
    WHERE a.is_active = 1
    ORDER BY a.applied_date DESC
  `).all();

  // Clean up dates and JSON fields
  const rows = apps.map(r => ({
    ...r,
    'Applied Date': r['Applied Date'] ? r['Applied Date'].split('T')[0] : '',
    'First Response Date': r['First Response Date'] ? r['First Response Date'].split('T')[0] : '',
    'Interview Date': r['Interview Date'] ? r['Interview Date'].split('T')[0] : '',
    'Follow-up Date': r['Follow-up Date'] ? r['Follow-up Date'].split('T')[0] : '',
    'Referrals Contacted': (() => { try { return JSON.parse(r['Referrals Contacted'] || '[]').join(', '); } catch { return ''; } })(),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  // Auto-width columns
  const colWidths = Object.keys(rows[0] || {}).map(k => ({ wch: Math.max(k.length, 18) }));
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Applications');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = `applications_${new Date().toISOString().split('T')[0]}.xlsx`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// GET /api/applications/pending-followups - Follow-up reminders
router.get('/pending-followups', (req, res) => {
  const db = getDb();
  const apps = db.prepare(`
    SELECT a.*, j.title as job_title, j.company, j.location
    FROM applications a JOIN jobs j ON a.job_id = j.id
    WHERE a.is_active = 1
      AND a.application_status IN ('pending', 'in_progress', 'got_call')
      AND (a.follow_up_date IS NULL OR a.follow_up_date <= datetime('now'))
    ORDER BY a.follow_up_date ASC NULLS LAST
  `).all();
  res.json({ success: true, data: apps });
});

// GET /api/applications/:id - Single application with history
router.get('/:id', (req, res) => {
  const db = getDb();
  const app = db.prepare(`
    SELECT a.*,
      j.title as job_title, j.company, j.location, j.job_url, j.platform, j.description
    FROM applications a JOIN jobs j ON a.job_id = j.id
    WHERE a.id = ?
  `).get(req.params.id);
  if (!app) return res.status(404).json({ success: false, error: 'Application not found' });

  const history = db.prepare(
    'SELECT * FROM application_history WHERE application_id = ? ORDER BY changed_at DESC'
  ).all(req.params.id);

  const referrals = db.prepare(
    'SELECT * FROM referrals WHERE job_id = ? ORDER BY priority_score DESC'
  ).all(app.job_id);

  // Parse JSON field
  try { app.referral_contacted_names = JSON.parse(app.referral_contacted_names || '[]'); } catch {}

  res.json({ success: true, data: { ...app, history, referrals } });
});

// POST /api/applications - Create new application
router.post('/', (req, res) => {
  const db = getDb();
  const {
    job_id,
    applied_date,
    application_status = 'pending',
    referral_contacted_names = [],
    referral_1_linkedin, referral_2_linkedin, referral_3_linkedin, referral_4_linkedin,
    message_sent_date,
    notes,
    follow_up_date,
  } = req.body;

  if (!job_id) return res.status(400).json({ success: false, error: 'job_id is required' });

  const existing = db.prepare('SELECT id FROM applications WHERE job_id = ? AND is_active = 1').get(job_id);
  if (existing) {
    return res.status(409).json({
      success: false,
      error: 'Application already exists for this job',
      existing_id: existing.id,
    });
  }

  // Auto-set follow-up date to 7 days from now if not provided
  const autoFollowUp = follow_up_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const result = db.prepare(`
    INSERT INTO applications (
      job_id, applied_date, application_status, referral_contacted_names,
      referral_1_linkedin, referral_2_linkedin, referral_3_linkedin, referral_4_linkedin,
      message_sent_date, notes, follow_up_date
    ) VALUES (?, COALESCE(?, datetime('now')), ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    job_id,
    applied_date,
    application_status,
    JSON.stringify(referral_contacted_names),
    referral_1_linkedin, referral_2_linkedin, referral_3_linkedin, referral_4_linkedin,
    message_sent_date, notes, autoFollowUp
  );

  // Log to history
  db.prepare(`
    INSERT INTO application_history (application_id, status_changed_from, status_changed_to, changed_by, notes)
    VALUES (?, NULL, ?, 'user', 'Application created')
  `).run(result.lastInsertRowid, application_status);

  const newApp = db.prepare('SELECT * FROM applications WHERE id = ?').get(result.lastInsertRowid);
  logger.info(`Application created for job_id: ${job_id}`);
  res.status(201).json({ success: true, data: newApp });
});

// PUT /api/applications/:id - Update application
router.put('/:id', (req, res) => {
  const db = getDb();
  const {
    application_status,
    referral_contacted_names,
    referral_1_linkedin, referral_2_linkedin, referral_3_linkedin, referral_4_linkedin,
    message_sent_date, first_response_date, interview_date, interview_status,
    offer_received, offer_amount, follow_up_date, notes,
  } = req.body;

  const current = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ success: false, error: 'Application not found' });

  // Track status change
  if (application_status && application_status !== current.application_status) {
    db.prepare(`
      INSERT INTO application_history (application_id, status_changed_from, status_changed_to, changed_by)
      VALUES (?, ?, ?, 'user')
    `).run(req.params.id, current.application_status, application_status);

    // Auto-set response date on first call
    if (application_status === 'got_call' && !current.first_response_date) {
      req.body.first_response_date = req.body.first_response_date || new Date().toISOString();
    }
  }

  const refNames = referral_contacted_names
    ? JSON.stringify(Array.isArray(referral_contacted_names) ? referral_contacted_names : [referral_contacted_names])
    : null;

  db.prepare(`
    UPDATE applications SET
      application_status = COALESCE(?, application_status),
      referral_contacted_names = COALESCE(?, referral_contacted_names),
      referral_1_linkedin = COALESCE(?, referral_1_linkedin),
      referral_2_linkedin = COALESCE(?, referral_2_linkedin),
      referral_3_linkedin = COALESCE(?, referral_3_linkedin),
      referral_4_linkedin = COALESCE(?, referral_4_linkedin),
      message_sent_date = COALESCE(?, message_sent_date),
      first_response_date = COALESCE(?, first_response_date),
      interview_date = COALESCE(?, interview_date),
      interview_status = COALESCE(?, interview_status),
      offer_received = COALESCE(?, offer_received),
      offer_amount = COALESCE(?, offer_amount),
      follow_up_date = COALESCE(?, follow_up_date),
      notes = COALESCE(?, notes)
    WHERE id = ?
  `).run(
    application_status, refNames,
    referral_1_linkedin, referral_2_linkedin, referral_3_linkedin, referral_4_linkedin,
    message_sent_date, req.body.first_response_date || first_response_date,
    interview_date, interview_status, offer_received, offer_amount,
    follow_up_date, notes, req.params.id
  );

  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  res.json({ success: true, data: updated });
});

// DELETE /api/applications/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare("UPDATE applications SET is_active = 0 WHERE id = ?").run(req.params.id);
  res.json({ success: true, message: 'Application archived' });
});

// GET /api/applications/:id/history
router.get('/:id/history', (req, res) => {
  const db = getDb();
  const history = db.prepare(
    'SELECT * FROM application_history WHERE application_id = ? ORDER BY changed_at DESC'
  ).all(req.params.id);
  res.json({ success: true, data: history });
});

module.exports = router;
