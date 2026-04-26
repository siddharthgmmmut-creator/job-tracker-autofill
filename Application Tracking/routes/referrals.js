const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { logger } = require('../middleware/logger');
const { CONNECTION_TYPES } = require('../config/constants');

// GET /api/referrals?job_id=X - Get referrals for a job
router.get('/', (req, res) => {
  const db = getDb();
  const { job_id, connection_type, contacted } = req.query;

  let query = `SELECT r.*, j.title as job_title, j.company as job_company FROM referrals r
               JOIN jobs j ON r.job_id = j.id WHERE 1=1`;
  const params = [];

  if (job_id) {
    query += ' AND r.job_id = ?';
    params.push(parseInt(job_id));
  }
  if (connection_type) {
    query += ' AND r.connection_type = ?';
    params.push(connection_type);
  }
  if (contacted !== undefined) {
    query += ' AND r.contacted = ?';
    params.push(contacted === 'true' ? 1 : 0);
  }

  query += ' ORDER BY r.priority_score DESC, r.created_at ASC';
  const referrals = db.prepare(query).all(...params);
  res.json({ success: true, data: referrals });
});

// GET /api/referrals/:id - Single referral
router.get('/:id', (req, res) => {
  const db = getDb();
  const referral = db.prepare(`
    SELECT r.*, j.title as job_title, j.company as job_company
    FROM referrals r JOIN jobs j ON r.job_id = j.id
    WHERE r.id = ?
  `).get(req.params.id);
  if (!referral) return res.status(404).json({ success: false, error: 'Referral not found' });
  res.json({ success: true, data: referral });
});

// POST /api/referrals - Add referral manually
router.post('/', (req, res) => {
  const db = getDb();
  const {
    job_id, person_name, linkedin_url, current_role,
    current_company, connection_type = 'general', priority_score, notes
  } = req.body;

  if (!job_id || !person_name) {
    return res.status(400).json({ success: false, error: 'job_id and person_name are required' });
  }

  // Auto-calculate priority if not provided
  const auto_priority = priority_score ||
    (CONNECTION_TYPES[connection_type?.toUpperCase()]?.priority) ||
    Object.values(CONNECTION_TYPES).find(c => c.type === connection_type)?.priority || 1;

  const result = db.prepare(`
    INSERT INTO referrals (job_id, person_name, linkedin_url, current_role, current_company, connection_type, priority_score, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(job_id, person_name, linkedin_url, current_role, current_company, connection_type, auto_priority, notes);

  // Update job referrals_found flag
  db.prepare("UPDATE jobs SET referrals_found = 1 WHERE id = ?").run(job_id);

  const newRef = db.prepare('SELECT * FROM referrals WHERE id = ?').get(result.lastInsertRowid);
  logger.info(`Referral added: ${person_name} for job ${job_id}`);
  res.status(201).json({ success: true, data: newRef });
});

// PUT /api/referrals/:id - Update referral
router.put('/:id', (req, res) => {
  const db = getDb();
  const {
    person_name, linkedin_url, current_role, current_company,
    connection_type, priority_score, contacted, contacted_date,
    response_received, response_date, notes, verified
  } = req.body;

  const ref = db.prepare('SELECT * FROM referrals WHERE id = ?').get(req.params.id);
  if (!ref) return res.status(404).json({ success: false, error: 'Referral not found' });

  db.prepare(`
    UPDATE referrals SET
      person_name = COALESCE(?, person_name),
      linkedin_url = COALESCE(?, linkedin_url),
      current_role = COALESCE(?, current_role),
      current_company = COALESCE(?, current_company),
      connection_type = COALESCE(?, connection_type),
      priority_score = COALESCE(?, priority_score),
      contacted = COALESCE(?, contacted),
      contacted_date = COALESCE(?, contacted_date),
      response_received = COALESCE(?, response_received),
      response_date = COALESCE(?, response_date),
      notes = COALESCE(?, notes),
      verified = COALESCE(?, verified)
    WHERE id = ?
  `).run(person_name, linkedin_url, current_role, current_company, connection_type,
    priority_score, contacted, contacted_date, response_received, response_date, notes, verified, req.params.id);

  const updated = db.prepare('SELECT * FROM referrals WHERE id = ?').get(req.params.id);
  res.json({ success: true, data: updated });
});

// POST /api/referrals/:id/contact - Mark as contacted
router.post('/:id/contact', (req, res) => {
  const db = getDb();
  const { notes } = req.body;
  db.prepare(`
    UPDATE referrals SET contacted = 1, contacted_date = datetime('now'), notes = COALESCE(?, notes)
    WHERE id = ?
  `).run(notes, req.params.id);
  const updated = db.prepare('SELECT * FROM referrals WHERE id = ?').get(req.params.id);
  res.json({ success: true, data: updated, message: 'Marked as contacted' });
});

// DELETE /api/referrals/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM referrals WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Referral deleted' });
});

// GET /api/referrals/linkedin-search/:jobId - Generate LinkedIn search URLs
router.get('/linkedin-search/:jobId', (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

  const company = encodeURIComponent(job.company);

  const searchUrls = [
    {
      label: 'IIM Lucknow Alumni at ' + job.company,
      url: `https://www.linkedin.com/search/results/people/?keywords=IIM+Lucknow+${company}&origin=GLOBAL_SEARCH_HEADER`,
      type: 'alumni_iim',
      priority: 5,
    },
    {
      label: 'MMMUT Alumni at ' + job.company,
      url: `https://www.linkedin.com/search/results/people/?keywords=MMMUT+${company}&origin=GLOBAL_SEARCH_HEADER`,
      type: 'alumni_mmmut',
      priority: 4,
    },
    {
      label: 'Darwinbox Employees at ' + job.company,
      url: `https://www.linkedin.com/search/results/people/?keywords=Darwinbox+${company}&origin=GLOBAL_SEARCH_HEADER`,
      type: 'darwinbox',
      priority: 5,
    },
    {
      label: 'Prime Focus Employees at ' + job.company,
      url: `https://www.linkedin.com/search/results/people/?keywords=Prime+Focus+Technologies+${company}&origin=GLOBAL_SEARCH_HEADER`,
      type: 'prime_focus',
      priority: 4,
    },
    {
      label: 'GTM/Ops roles at ' + job.company,
      url: `https://www.linkedin.com/search/results/people/?keywords=${company}+GTM+operations+manager&origin=GLOBAL_SEARCH_HEADER`,
      type: 'role_relevant',
      priority: 2,
    },
    {
      label: 'All employees at ' + job.company,
      url: `https://www.linkedin.com/company/${job.company.toLowerCase().replace(/\s+/g, '-')}/people/`,
      type: 'general',
      priority: 1,
    },
  ];

  res.json({ success: true, data: { job, searchUrls } });
});

// GET /api/referrals/message-template/:referralId - Pre-written message
router.get('/message-template/:referralId', (req, res) => {
  const db = getDb();
  const ref = db.prepare(`
    SELECT r.*, j.title as job_title, j.company as job_company, j.job_url
    FROM referrals r JOIN jobs j ON r.job_id = j.id WHERE r.id = ?
  `).get(req.params.referralId);

  if (!ref) return res.status(404).json({ success: false, error: 'Referral not found' });

  const connectionLabel = {
    alumni_iim: 'fellow IIM Lucknow alumnus',
    alumni_mmmut: 'fellow MMMUT Gorakhpur alumnus',
    alumni_sjc: "fellow St Joseph's College alumnus",
    darwinbox: 'ex-Darwinbox colleague',
    prime_focus: 'ex-Prime Focus Technologies colleague',
    gsk: 'ex-GSK Pharmaceuticals colleague',
    role_relevant: 'professional in a similar domain',
    general: 'fellow professional',
  }[ref.connection_type] || 'fellow professional';

  const shortTemplate = `Hi ${ref.person_name.split(' ')[0]},

I'm Siddharth, a ${connectionLabel} (IIM Lucknow MBA '21). I came across a ${ref.job_title} opening at ${ref.job_company} and noticed you're part of the team.

I have 5 years of experience across GTM, Operations, and Business Planning at companies like Darwinbox, Prime Focus Technologies, and GSK Pharmaceuticals.

Would you be open to sharing a referral or pointing me to the right person? I'd be happy to share my CV.

Thanks!
Siddharth`;

  res.json({
    success: true,
    data: {
      template: shortTemplate,
      referral: ref,
    },
  });
});

module.exports = router;
