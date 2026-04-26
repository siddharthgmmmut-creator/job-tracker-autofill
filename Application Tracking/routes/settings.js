const express = require('express');
const router = express.Router();
const { getDb, getSetting, setSetting } = require('../database/db');
const { createBackup, listBackups } = require('../services/backup');
const { logger } = require('../middleware/logger');
const { runManualScrape } = require('../services/scheduler');
const { seedDemoJobs } = require('../database/seed');
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

module.exports = router;
