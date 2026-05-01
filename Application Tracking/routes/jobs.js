const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { logger } = require('../middleware/logger');
const { LOCATION_PRIORITY } = require('../config/constants');
const { savePlaceholderReferrals } = require('../services/referral-finder');

// ── Experience filter helpers ─────────────────────────────────
function parseExpRange(text) {
  if (!text) return null;
  // "4-8 Yrs", "5 to 10 years", "3 – 6 years", "4–12 Yrs"
  const rangeMatch = text.match(/(\d+)\s*[-–to]+\s*(\d+)\s*(?:yrs?|years?)/i);
  if (rangeMatch) return { min: parseInt(rangeMatch[1]), max: parseInt(rangeMatch[2]) };
  // "10+ years", "minimum 5 years", "5 years"
  const minMatch = text.match(/(?:min(?:imum)?\s+)?(\d+)\+?\s*(?:yrs?|years?)/i);
  if (minMatch) {
    const n = parseInt(minMatch[1]);
    return { min: n, max: n + 6 }; // treat "5 years" as 5–11
  }
  return null;
}

function jobFitsExperience(job, userExp) {
  const text = `${job.requirements || ''} ${job.description || ''}`;
  const range = parseExpRange(text);
  if (!range) return true; // can't parse → always include
  return userExp >= range.min && userExp <= range.max;
}

// GET /api/jobs - List all jobs with filters
router.get('/', (req, res) => {
  const db = getDb();
  const {
    search, location, platform, page = 1, limit = 50,
    sort = 'posted_date', order = 'desc', active = '1',
    days, applied, hidden, user_exp, role_tag,
  } = req.query;

  let query = `
    SELECT j.*,
      (SELECT COUNT(*) FROM referrals r WHERE r.job_id = j.id) as referral_count,
      (SELECT id FROM applications a WHERE a.job_id = j.id LIMIT 1) as application_id,
      (SELECT application_status FROM applications a WHERE a.job_id = j.id LIMIT 1) as application_status
    FROM jobs j
    WHERE 1=1
  `;
  const params = [];

  if (active !== 'all') {
    query += ` AND j.is_active = ?`;
    params.push(active === '1' ? 1 : 0);
  }

  // Hide "not fit" jobs by default; pass hidden=1 to see them
  if (hidden !== '1') {
    query += ` AND (j.is_not_fit = 0 OR j.is_not_fit IS NULL)`;
  } else {
    query += ` AND j.is_not_fit = 1`;
  }

  if (search) {
    query += ` AND (j.title LIKE ? OR j.company LIKE ? OR j.description LIKE ?)`;
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  if (location) {
    query += ` AND j.location LIKE ?`;
    params.push(`%${location}%`);
  }

  if (platform) {
    query += ` AND j.platform = ?`;
    params.push(platform);
  }

  if (days) {
    query += ` AND j.posted_date >= datetime('now', ?)`;
    params.push(`-${days} days`);
  }

  // Role Intelligence filter — match against the fit_category column (primary role)
  // or any secondary role stored in the JSON role_tags array
  if (role_tag) {
    query += ` AND (j.fit_category = ? OR j.role_tags LIKE ?)`;
    params.push(role_tag, `%"id":"${role_tag}"%`);
  }

  if (applied === 'yes') {
    query += ` AND EXISTS (SELECT 1 FROM applications a WHERE a.job_id = j.id)`;
  } else if (applied === 'no') {
    query += ` AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.job_id = j.id)`;
  }

  const allowedSorts = ['posted_date', 'scraped_date', 'title', 'company', 'location_priority'];
  const sortCol = allowedSorts.includes(sort) ? sort : 'posted_date';
  const sortDir = order === 'asc' ? 'ASC' : 'DESC';
  query += ` ORDER BY j.${sortCol} ${sortDir}`;

  // Experience filter — done in JS (ambiguous jobs are never excluded)
  const ue = user_exp ? parseFloat(user_exp) : NaN;
  if (!isNaN(ue)) {
    const allRows = db.prepare(query).all(...params);
    const filtered = allRows.filter(job => jobFitsExperience(job, ue));
    const total = filtered.length;
    const offsetVal = (parseInt(page) - 1) * parseInt(limit);
    return res.json({
      success: true,
      data: filtered.slice(offsetVal, offsetVal + parseInt(limit)),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const countQuery = query.replace(/SELECT j\.\*.*?FROM jobs j/s, 'SELECT COUNT(*) as total FROM jobs j');

  const total = db.prepare(countQuery).get(...params)?.total || 0;
  query += ` LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), offset);

  const jobs = db.prepare(query).all(...params);

  res.json({
    success: true,
    data: jobs,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

// GET /api/jobs/companies — All distinct company names (for dropdown)
router.get('/companies', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT DISTINCT company FROM jobs
    WHERE is_active = 1
      AND (is_not_fit = 0 OR is_not_fit IS NULL)
      AND company IS NOT NULL AND company != ''
      AND company NOT LIKE 'See %'
    ORDER BY company ASC
  `).all();
  res.json({ success: true, data: rows.map(r => r.company) });
});

// GET /api/jobs/stats - Quick stats
router.get('/stats', (req, res) => {
  const db = getDb();
  const stats = {
    total: db.prepare("SELECT COUNT(*) as c FROM jobs WHERE is_active=1").get().c,
    today: db.prepare("SELECT COUNT(*) as c FROM jobs WHERE date(scraped_date)=date('now')").get().c,
    thisWeek: db.prepare("SELECT COUNT(*) as c FROM jobs WHERE scraped_date >= datetime('now','-7 days')").get().c,
    notApplied: db.prepare("SELECT COUNT(*) as c FROM jobs j WHERE is_active=1 AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.job_id=j.id)").get().c,
    withReferrals: db.prepare("SELECT COUNT(*) as c FROM jobs WHERE referrals_found=1").get().c,
    byPlatform: db.prepare("SELECT platform, COUNT(*) as count FROM jobs WHERE is_active=1 GROUP BY platform ORDER BY count DESC").all(),
    byLocation: db.prepare("SELECT location, COUNT(*) as count FROM jobs WHERE is_active=1 GROUP BY location ORDER BY count DESC LIMIT 10").all(),
  };
  res.json({ success: true, data: stats });
});

// GET /api/jobs/:id - Single job
router.get('/:id', (req, res) => {
  const db = getDb();
  const job = db.prepare(`
    SELECT j.*,
      (SELECT COUNT(*) FROM referrals r WHERE r.job_id = j.id) as referral_count,
      (SELECT id FROM applications a WHERE a.job_id = j.id LIMIT 1) as application_id,
      (SELECT application_status FROM applications a WHERE a.job_id = j.id LIMIT 1) as application_status
    FROM jobs j WHERE j.id = ?
  `).get(req.params.id);

  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  res.json({ success: true, data: job });
});

// POST /api/jobs - Add job manually
router.post('/', (req, res) => {
  const db = getDb();
  const { title, company, location, job_url, platform = 'manual', posted_date, description, salary_range } = req.body;

  if (!title || !company) {
    return res.status(400).json({ success: false, error: 'title and company are required' });
  }

  // Check for duplicate URL
  if (job_url) {
    const existing = db.prepare('SELECT id FROM jobs WHERE job_url = ?').get(job_url);
    if (existing) {
      return res.status(409).json({ success: false, error: 'Job URL already exists', existing_id: existing.id });
    }
  }

  const locPriority = LOCATION_PRIORITY[location] || 99;

  const result = db.prepare(`
    INSERT INTO jobs (title, company, location, job_url, platform, posted_date, description, salary_range, location_priority)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, company, location, job_url, platform, posted_date, description, salary_range, locPriority);

  const newJob = db.prepare('SELECT * FROM jobs WHERE id = ?').get(result.lastInsertRowid);
  // Auto-generate LinkedIn referral search placeholders
  try { savePlaceholderReferrals(result.lastInsertRowid, company, title); } catch {}
  logger.info(`New job added manually: ${title} at ${company}`);
  res.status(201).json({ success: true, data: newJob });
});

// PUT /api/jobs/:id - Update job
router.put('/:id', (req, res) => {
  const db = getDb();
  const { title, company, location, is_active, description, salary_range } = req.body;

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

  db.prepare(`
    UPDATE jobs SET
      title = COALESCE(?, title),
      company = COALESCE(?, company),
      location = COALESCE(?, location),
      is_active = COALESCE(?, is_active),
      description = COALESCE(?, description),
      salary_range = COALESCE(?, salary_range)
    WHERE id = ?
  `).run(title, company, location, is_active, description, salary_range, req.params.id);

  const updated = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  res.json({ success: true, data: updated });
});

// PATCH /api/jobs/:id/not-fit — Toggle "not a fit for me" flag
router.patch('/:id/not-fit', (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT id, is_not_fit FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

  const newVal = job.is_not_fit ? 0 : 1; // toggle
  db.prepare('UPDATE jobs SET is_not_fit = ? WHERE id = ?').run(newVal, req.params.id);
  logger.info(`Job ${req.params.id} ${newVal ? 'marked not-fit' : 'restored'}`);
  res.json({ success: true, data: { id: job.id, is_not_fit: newVal } });
});

// DELETE /api/jobs/:id - Soft delete (deactivate) job
router.delete('/:id', (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

  const { permanent } = req.query;
  if (permanent === 'true') {
    db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
    logger.info(`Job permanently deleted: ${job.title} at ${job.company}`);
    res.json({ success: true, message: 'Job permanently deleted' });
  } else {
    db.prepare("UPDATE jobs SET is_active = 0 WHERE id = ?").run(req.params.id);
    res.json({ success: true, message: 'Job deactivated' });
  }
});

module.exports = router;
