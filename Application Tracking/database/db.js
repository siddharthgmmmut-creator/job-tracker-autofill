const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

let db;

function getDb() {
  if (!db) {
    // Ensure data directory exists
    const dbDir = path.dirname(config.database.path);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(config.database.path, {
      verbose: config.isDev() ? null : null,
    });

    // Performance pragmas
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000'); // 64MB cache
    db.pragma('temp_store = MEMORY');
  }
  return db;
}

function initDb() {
  const database = getDb();
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  // better-sqlite3's exec() handles multi-statement SQL including triggers
  try {
    database.exec(schema);
  } catch (err) {
    // Ignore "already exists" errors (idempotent runs)
    if (!err.message.includes('already exists')) {
      console.error('Schema warning:', err.message);
    }
  }

  seedDefaultSettings(database);

  // Safe migration: add is_not_fit column if it doesn't exist yet
  try {
    database.exec(`ALTER TABLE jobs ADD COLUMN is_not_fit INTEGER DEFAULT 0`);
  } catch (_) { /* column already exists — ignore */ }

  console.log('✅ Database initialized at:', config.database.path);
  return database;
}

function seedDefaultSettings(database) {
  const defaults = [
    { name: 'user_name', value: 'Siddharth', type: 'string' },
    { name: 'user_email', value: 'siddharthgmmmut@gmail.com', type: 'string' },
    { name: 'user_phone', value: '+91-8765627606', type: 'string' },
    { name: 'target_roles', value: JSON.stringify([
      'Growth Manager', 'Senior Growth Manager', 'GTM Manager', 'GTM Lead',
      'AI GTM Engineer', 'Chief of Staff', "Founder's Office",
      'Operations Manager', 'Business Planning Manager', 'Senior Manager Operations'
    ]), type: 'json' },
    { name: 'target_locations', value: JSON.stringify([
      'Mumbai', 'Pune', 'Delhi', 'Noida', 'Gurgaon', 'Lucknow', 'Bangalore', 'Hyderabad'
    ]), type: 'json' },
    { name: 'min_salary_lpa', value: '27', type: 'number' },
    { name: 'scraper_enabled', value: 'true', type: 'boolean' },
    { name: 'scraper_schedule', value: '0 7 * * *', type: 'string' },
    { name: 'followup_days', value: '7', type: 'number' },
    { name: 'last_scrape', value: '', type: 'string' },
    { name: 'last_backup', value: '', type: 'string' },
    { name: 'cv_path', value: '../SIDDHARTH_CV_2.pdf', type: 'string' },
    { name: 'linkedin_url', value: '', type: 'string' },
    { name: 'exclude_roles', value: JSON.stringify(['Sales Executive', 'Business Development Executive', 'Account Executive']), type: 'json' },
    { name: 'max_job_age_days', value: '60', type: 'number' },
  ];

  const upsert = database.prepare(`
    INSERT OR IGNORE INTO settings (setting_name, setting_value, setting_type)
    VALUES (@name, @value, @type)
  `);

  const insertAll = database.transaction((items) => {
    for (const item of items) {
      upsert.run(item);
    }
  });

  insertAll(defaults);
}

// Helper: get setting value
function getSetting(name) {
  const db = getDb();
  const row = db.prepare('SELECT setting_value, setting_type FROM settings WHERE setting_name = ?').get(name);
  if (!row) return null;
  if (row.setting_type === 'json') {
    try { return JSON.parse(row.setting_value); } catch { return row.setting_value; }
  }
  if (row.setting_type === 'boolean') return row.setting_value === 'true';
  if (row.setting_type === 'number') return parseFloat(row.setting_value);
  return row.setting_value;
}

// Helper: set setting value
function setSetting(name, value, type = 'string') {
  const db = getDb();
  const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
  db.prepare(`
    INSERT INTO settings (setting_name, setting_value, setting_type, last_updated)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(setting_name) DO UPDATE SET
      setting_value = excluded.setting_value,
      setting_type = excluded.setting_type,
      last_updated = datetime('now')
  `).run(name, strValue, type);
}

module.exports = { getDb, initDb, getSetting, setSetting };

// If run directly: node database/db.js
if (require.main === module) {
  initDb();
  console.log('Database setup complete!');
  process.exit(0);
}
