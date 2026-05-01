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

  // ── Safe migrations (idempotent — column-already-exists errors are swallowed) ──
  const addCol = (sql) => { try { database.exec(sql); } catch (_) {} };

  addCol(`ALTER TABLE jobs ADD COLUMN is_not_fit       INTEGER DEFAULT 0`);
  addCol(`ALTER TABLE jobs ADD COLUMN role_tags         TEXT    DEFAULT NULL`);
  addCol(`ALTER TABLE jobs ADD COLUMN intelligence_score INTEGER DEFAULT 0`);
  addCol(`ALTER TABLE jobs ADD COLUMN fit_category      TEXT    DEFAULT NULL`);

  // Role definitions table (for dynamic role management via Settings)
  database.exec(`
    CREATE TABLE IF NOT EXISTS role_definitions (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      color            TEXT DEFAULT 'blue',
      titles           TEXT DEFAULT '[]',
      keywords         TEXT DEFAULT '[]',
      responsibilities TEXT DEFAULT '[]',
      signals          TEXT DEFAULT '[]',
      exclude_keywords TEXT DEFAULT '[]',
      seniority_reject TEXT DEFAULT '[]',
      is_technical     INTEGER DEFAULT 0,
      threshold        INTEGER DEFAULT 20,
      is_active        INTEGER DEFAULT 1,
      created_at       TEXT DEFAULT (datetime('now')),
      updated_at       TEXT DEFAULT (datetime('now'))
    )
  `);

  // Seed role definitions from JSON (INSERT OR IGNORE — safe to re-run)
  try {
    const repoPath = path.join(__dirname, '../data/roleRepository.json');
    if (fs.existsSync(repoPath)) {
      const { roles } = JSON.parse(fs.readFileSync(repoPath, 'utf8'));
      const upsertRole = database.prepare(`
        INSERT OR IGNORE INTO role_definitions
          (id, name, color, titles, keywords, responsibilities, signals,
           exclude_keywords, seniority_reject, is_technical, threshold)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const seedRoles = database.transaction((roleList) => {
        for (const r of roleList) {
          upsertRole.run(
            r.id, r.name, r.color || 'blue',
            JSON.stringify(r.titles          || []),
            JSON.stringify(r.keywords        || []),
            JSON.stringify(r.responsibilities || []),
            JSON.stringify(r.signals         || []),
            JSON.stringify(r.excludeKeywords || []),
            JSON.stringify(r.seniorityReject || []),
            r.isTechnical ? 1 : 0,
            r.threshold   || 20
          );
        }
      });
      seedRoles(roles);
    }
  } catch (_) { /* non-fatal — roles can be seeded later */ }

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
