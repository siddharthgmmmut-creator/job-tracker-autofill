const express = require('express');
const router = express.Router();
const { getDb, getSetting, setSetting } = require('../database/db');
const { createBackup, listBackups } = require('../services/backup');
const { logger } = require('../middleware/logger');
const { runManualScrape, getScrapeStatus } = require('../services/scheduler');
const { seedDemoJobs } = require('../database/seed');
const { classifyAllJobs, invalidateCache } = require('../services/roleIntelligence');
const path = require('path');
const fs = require('fs');
const config = require('../config/config');

// GET /api/settings - All settings
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM settings ORDER BY setting_name').all();
  const settings = {};
  rows.forEach(row => {
    try {
      if (row.setting_type === 'json') settings[row.setting_name] = JSON.parse(row.setting_value);
      else if (row.setting_type === 'boolean') settings[row.setting_name] = row.setting_value === 'true';
      else if (row.setting_type === 'number') settings[row.setting_name] = parseFloat(row.setting_value);
      else settings[row.setting_name] = row.setting_value;
    } catch {
      settings[row.setting_name] = row.setting_value;
    }
  });
  res.json({ success: true, data: settings });
});

// PUT /api/settings/:name - Update single setting
router.put('/:name', (req, res) => {
  const { value, type } = req.body;
  if (value === undefined) return res.status(400).json({ success: false, error: 'value is required' });

  setSetting(req.params.name, value, type);
  logger.info(`Setting updated: ${req.params.name}`);
  res.json({ success: true, message: 'Setting updated', name: req.params.name, value });
});

// POST /api/settings - Bulk update settings
router.post('/bulk', (req, res) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ success: false, error: 'settings object required' });
  }
  for (const [name, value] of Object.entries(settings)) {
    const type = Array.isArray(value) || typeof value === 'object' ? 'json'
      : typeof value === 'boolean' ? 'boolean'
      : typeof value === 'number' ? 'number'
      : 'string';
    setSetting(name, value, type);
  }
  logger.info(`Bulk settings update: ${Object.keys(settings).join(', ')}`);
  res.json({ success: true, message: 'Settings updated', count: Object.keys(settings).length });
});

// POST /api/settings/backup - Create manual backup
router.post('/backup', async (req, res) => {
  try {
    const backupPath = await createBackup();
    setSetting('last_backup', new Date().toISOString(), 'string');
    logger.info('Manual backup created:', backupPath);
    res.json({ success: true, message: 'Backup created', path: backupPath });
  } catch (err) {
    logger.error('Backup failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/settings/backups/list - List all backups
router.get('/backups/list', (req, res) => {
  try {
    const backups = listBackups();
    res.json({ success: true, data: backups });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/settings/scrape/status - Live scrape state (for polling)
router.get('/scrape/status', (req, res) => {
  res.json({ success: true, data: getScrapeStatus() });
});

// POST /api/settings/scrape/run - Trigger manual scrape
router.post('/scrape/run', async (req, res) => {
  try {
    logger.info('Manual scrape triggered via API');
    // Run async, don't wait - respond immediately
    runManualScrape()
      .then(result => logger.info(`Scrape finished: ${result?.totalNew} new jobs`))
      .catch(err => logger.error('Manual scrape error:', err.message));
    res.json({ success: true, message: 'Scrape started! Jobs will appear in 2-3 minutes. Watch the Scrape Logs in Analytics.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/settings/seed-demo - Load 30 demo jobs instantly
router.post('/seed-demo', (req, res) => {
  try {
    const result = seedDemoJobs();
    logger.info(`Demo data seeded: ${result.added} jobs added`);
    res.json({
      success: true,
      message: `✅ Added ${result.added} demo jobs from Razorpay, PhonePe, CRED, Darwinbox, Zepto and 25+ more companies!`,
      data: result,
    });
  } catch (err) {
    logger.error('Seed error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/settings/system/status - System health
router.get('/system/status', (req, res) => {
  const db = getDb();
  const dbStats = db.prepare('SELECT COUNT(*) as jobs FROM jobs').get();
  const dbSize = fs.existsSync(config.database.path)
    ? Math.round(fs.statSync(config.database.path).size / 1024) + ' KB'
    : 'unknown';

  res.json({
    success: true,
    data: {
      status: 'running',
      uptime: Math.round(process.uptime()),
      nodeVersion: process.version,
      databasePath: config.database.path,
      databaseSize: dbSize,
      totalJobs: dbStats.jobs,
      lastScrape: getSetting('last_scrape'),
      lastBackup: getSetting('last_backup'),
      environment: config.env,
      port: config.port,
    },
  });
});

// DELETE /api/settings/data/old - Clean old inactive data
router.delete('/data/old', (req, res) => {
  const db = getDb();
  const { days = 180 } = req.query;

  const result = db.prepare(`
    DELETE FROM jobs WHERE is_active = 0 AND updated_at < datetime('now', '-${parseInt(days)} days')
  `).run();

  logger.info(`Cleaned ${result.changes} old inactive jobs`);
  res.json({ success: true, message: `Deleted ${result.changes} old records`, deleted: result.changes });
});

// ─────────────────────────────────────────────────────────────────
// ROLE INTELLIGENCE — CRUD + Classification trigger
// NOTE: static /roles/classify is registered BEFORE /roles/:id so
//       Express doesn't swallow it as a param match.
// ─────────────────────────────────────────────────────────────────

// GET /api/settings/roles — list all role definitions
router.get('/roles', (req, res) => {
  const db = getDb();
  try {
    const rows = db.prepare(
      'SELECT * FROM role_definitions ORDER BY name ASC'
    ).all();
    const roles = rows.map(r => ({
      id:              r.id,
      name:            r.name,
      color:           r.color,
      is_active:       !!r.is_active,
      threshold:       r.threshold,
      is_technical:    !!r.is_technical,
      titles:          _parseArr(r.titles),
      keywords:        _parseArr(r.keywords),
      responsibilities: _parseArr(r.responsibilities),
      signals:         _parseArr(r.signals),
      excludeKeywords: _parseArr(r.exclude_keywords),
      seniorityReject: _parseArr(r.seniority_reject),
      created_at:      r.created_at,
      updated_at:      r.updated_at,
    }));
    res.json({ success: true, data: roles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/settings/roles/classify — re-classify ALL jobs now (manual trigger)
// Must be before /roles/:id so Express doesn't treat 'classify' as an id param
router.post('/roles/classify', (req, res) => {
  try {
    logger.info('Manual role re-classification triggered');
    const stats = classifyAllJobs();
    logger.info(`Re-classification complete: ${stats.classified} tagged, ${stats.filtered} filtered, ${stats.total} total`);
    res.json({ success: true, data: stats });
  } catch (err) {
    logger.error('Re-classification failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/settings/roles — create a new role definition
router.post('/roles', (req, res) => {
  const db = getDb();
  const {
    id, name, color = 'blue',
    titles = [], keywords = [], responsibilities = [], signals = [],
    excludeKeywords = [], seniorityReject = [],
    isTechnical = false, threshold = 20,
  } = req.body;

  if (!id || !name) {
    return res.status(400).json({ success: false, error: '`id` and `name` are required' });
  }
  if (!/^[a-z0-9_]+$/.test(id)) {
    return res.status(400).json({ success: false, error: '`id` must be lowercase letters, digits, or underscores' });
  }

  try {
    db.prepare(`
      INSERT INTO role_definitions
        (id, name, color, titles, keywords, responsibilities, signals,
         exclude_keywords, seniority_reject, is_technical, threshold)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, name, color,
      JSON.stringify(titles),
      JSON.stringify(keywords),
      JSON.stringify(responsibilities),
      JSON.stringify(signals),
      JSON.stringify(excludeKeywords),
      JSON.stringify(seniorityReject),
      isTechnical ? 1 : 0,
      threshold,
    );
    invalidateCache();
    logger.info(`Role created: ${id} (${name})`);
    res.status(201).json({ success: true, message: 'Role created', id });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ success: false, error: `Role id "${id}" already exists` });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/settings/roles/:id — update an existing role definition
router.put('/roles/:id', (req, res) => {
  const db = getDb();
  const role = db.prepare('SELECT id FROM role_definitions WHERE id = ?').get(req.params.id);
  if (!role) return res.status(404).json({ success: false, error: 'Role not found' });

  const {
    name, color, titles, keywords, responsibilities,
    signals, excludeKeywords, seniorityReject,
    isTechnical, threshold, is_active,
  } = req.body;

  // Build partial update — only touch fields that were actually sent
  const fields = [];
  const params = [];

  if (name            !== undefined) { fields.push('name = ?');             params.push(name); }
  if (color           !== undefined) { fields.push('color = ?');            params.push(color); }
  if (titles          !== undefined) { fields.push('titles = ?');           params.push(JSON.stringify(titles)); }
  if (keywords        !== undefined) { fields.push('keywords = ?');         params.push(JSON.stringify(keywords)); }
  if (responsibilities !== undefined) { fields.push('responsibilities = ?'); params.push(JSON.stringify(responsibilities)); }
  if (signals         !== undefined) { fields.push('signals = ?');          params.push(JSON.stringify(signals)); }
  if (excludeKeywords !== undefined) { fields.push('exclude_keywords = ?'); params.push(JSON.stringify(excludeKeywords)); }
  if (seniorityReject !== undefined) { fields.push('seniority_reject = ?'); params.push(JSON.stringify(seniorityReject)); }
  if (isTechnical     !== undefined) { fields.push('is_technical = ?');     params.push(isTechnical ? 1 : 0); }
  if (threshold       !== undefined) { fields.push('threshold = ?');        params.push(threshold); }
  if (is_active       !== undefined) { fields.push('is_active = ?');        params.push(is_active ? 1 : 0); }

  if (fields.length === 0) {
    return res.status(400).json({ success: false, error: 'No fields to update' });
  }

  fields.push("updated_at = datetime('now')");
  params.push(req.params.id);

  db.prepare(`UPDATE role_definitions SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  invalidateCache();
  logger.info(`Role updated: ${req.params.id}`);
  res.json({ success: true, message: 'Role updated' });
});

// DELETE /api/settings/roles/:id — soft-deactivate a role
router.delete('/roles/:id', (req, res) => {
  const db = getDb();
  const role = db.prepare('SELECT id FROM role_definitions WHERE id = ?').get(req.params.id);
  if (!role) return res.status(404).json({ success: false, error: 'Role not found' });

  db.prepare("UPDATE role_definitions SET is_active = 0, updated_at = datetime('now') WHERE id = ?")
    .run(req.params.id);
  invalidateCache();
  logger.info(`Role deactivated: ${req.params.id}`);
  res.json({ success: true, message: 'Role deactivated' });
});

// ── Internal helper ───────────────────────────────────────────────
function _parseArr(str) {
  try { return JSON.parse(str || '[]'); } catch { return []; }
}

module.exports = router;
