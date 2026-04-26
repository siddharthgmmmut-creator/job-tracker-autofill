const fs = require('fs');
const path = require('path');
const { getDb } = require('../database/db');
const config = require('../config/config');
const { logger } = require('../middleware/logger');

function ensureBackupDir() {
  if (!fs.existsSync(config.backup.dir)) {
    fs.mkdirSync(config.backup.dir, { recursive: true });
  }
}

async function createBackup() {
  ensureBackupDir();
  const db = getDb();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
  const backupFile = path.join(config.backup.dir, `backup_${timestamp}.json`);

  const data = {
    meta: {
      created_at: new Date().toISOString(),
      version: '1.0.0',
      description: "Siddharth's Job Tracker Backup",
    },
    jobs: db.prepare('SELECT * FROM jobs').all(),
    applications: db.prepare('SELECT * FROM applications').all(),
    referrals: db.prepare('SELECT * FROM referrals').all(),
    application_history: db.prepare('SELECT * FROM application_history').all(),
    settings: db.prepare('SELECT * FROM settings').all(),
    scrape_logs: db.prepare('SELECT * FROM scrape_logs ORDER BY ran_at DESC LIMIT 100').all(),
  };

  fs.writeFileSync(backupFile, JSON.stringify(data, null, 2), 'utf8');

  // Rotate old backups
  rotateBackups();

  const sizeKB = Math.round(fs.statSync(backupFile).size / 1024);
  logger.info(`Backup created: ${backupFile} (${sizeKB}KB)`);
  return backupFile;
}

function rotateBackups() {
  ensureBackupDir();
  const files = fs.readdirSync(config.backup.dir)
    .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
    .map(f => ({ name: f, time: fs.statSync(path.join(config.backup.dir, f)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);

  // Keep only the last N backups
  const toDelete = files.slice(config.backup.maxBackups);
  for (const file of toDelete) {
    fs.unlinkSync(path.join(config.backup.dir, file.name));
    logger.info(`Old backup deleted: ${file.name}`);
  }
}

function listBackups() {
  ensureBackupDir();
  return fs.readdirSync(config.backup.dir)
    .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
    .map(f => {
      const fullPath = path.join(config.backup.dir, f);
      const stat = fs.statSync(fullPath);
      return {
        filename: f,
        path: fullPath,
        size_kb: Math.round(stat.size / 1024),
        created_at: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function restoreBackup(backupPath) {
  const db = getDb();

  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }

  const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  logger.info(`Restoring backup from: ${backupPath}`);

  const restore = db.transaction(() => {
    // Clear existing data
    db.prepare('DELETE FROM application_history').run();
    db.prepare('DELETE FROM applications').run();
    db.prepare('DELETE FROM referrals').run();
    db.prepare('DELETE FROM jobs').run();
    db.prepare('DELETE FROM scrape_logs').run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('jobs','applications','referrals','application_history','scrape_logs')").run();

    // Restore jobs
    const insertJob = db.prepare(`
      INSERT OR IGNORE INTO jobs (id,external_id,title,company,location,job_url,platform,posted_date,scraped_date,
        description,salary_mentioned,salary_range,requirements,location_priority,is_active,referrals_found,created_at,updated_at)
      VALUES (@id,@external_id,@title,@company,@location,@job_url,@platform,@posted_date,@scraped_date,
        @description,@salary_mentioned,@salary_range,@requirements,@location_priority,@is_active,@referrals_found,@created_at,@updated_at)
    `);
    for (const job of (data.jobs || [])) insertJob.run(job);

    // Restore applications
    const insertApp = db.prepare(`
      INSERT OR IGNORE INTO applications VALUES (@id,@job_id,@applied_date,@application_status,
        @referral_contacted_names,@referral_1_linkedin,@referral_2_linkedin,@referral_3_linkedin,@referral_4_linkedin,
        @message_sent_date,@first_response_date,@interview_date,@interview_status,@offer_received,@offer_amount,
        @follow_up_date,@notes,@is_active,@created_at,@updated_at)
    `);
    for (const app of (data.applications || [])) insertApp.run(app);

    // Restore referrals
    const insertRef = db.prepare(`
      INSERT OR IGNORE INTO referrals VALUES (@id,@job_id,@person_name,@linkedin_url,@current_role,@current_company,
        @connection_type,@priority_score,@extraction_method,@notes,@contacted,@contacted_date,@response_received,
        @response_date,@verified,@created_at,@updated_at)
    `);
    for (const ref of (data.referrals || [])) insertRef.run(ref);
  });

  restore();
  logger.info('Backup restored successfully');
  return { restored: true, jobs: data.jobs?.length || 0, applications: data.applications?.length || 0 };
}

module.exports = { createBackup, listBackups, restoreBackup };
