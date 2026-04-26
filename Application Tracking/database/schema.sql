-- ============================================================
-- Job Application Tracker - Database Schema
-- ============================================================

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ============================================================
-- Table 1: JOBS
-- ============================================================
CREATE TABLE IF NOT EXISTS jobs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT,
  title       TEXT NOT NULL,
  company     TEXT NOT NULL,
  location    TEXT,
  job_url     TEXT UNIQUE,
  platform    TEXT NOT NULL DEFAULT 'manual',
  posted_date TEXT,
  scraped_date TEXT DEFAULT (datetime('now')),
  description TEXT,
  salary_mentioned INTEGER DEFAULT 0,
  salary_range TEXT,
  requirements TEXT,
  location_priority INTEGER DEFAULT 99,
  is_active   INTEGER DEFAULT 1,
  referrals_found INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
CREATE INDEX IF NOT EXISTS idx_jobs_platform ON jobs(platform);
CREATE INDEX IF NOT EXISTS idx_jobs_posted_date ON jobs(posted_date);
CREATE INDEX IF NOT EXISTS idx_jobs_location ON jobs(location);

-- ============================================================
-- Table 2: REFERRALS
-- ============================================================
CREATE TABLE IF NOT EXISTS referrals (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id            INTEGER NOT NULL,
  person_name       TEXT NOT NULL,
  linkedin_url      TEXT,
  current_role      TEXT,
  current_company   TEXT,
  connection_type   TEXT NOT NULL DEFAULT 'general',
  priority_score    INTEGER DEFAULT 1,
  extraction_method TEXT DEFAULT 'manual',
  notes             TEXT,
  contacted         INTEGER DEFAULT 0,
  contacted_date    TEXT,
  response_received INTEGER DEFAULT 0,
  response_date     TEXT,
  verified          INTEGER DEFAULT 0,
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_referrals_job_id ON referrals(job_id);
CREATE INDEX IF NOT EXISTS idx_referrals_connection_type ON referrals(connection_type);

-- ============================================================
-- Table 3: APPLICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS applications (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id                  INTEGER NOT NULL,
  applied_date            TEXT DEFAULT (datetime('now')),
  application_status      TEXT DEFAULT 'pending',
  referral_contacted_names TEXT DEFAULT '[]',
  referral_1_linkedin     TEXT,
  referral_2_linkedin     TEXT,
  referral_3_linkedin     TEXT,
  referral_4_linkedin     TEXT,
  message_sent_date       TEXT,
  first_response_date     TEXT,
  interview_date          TEXT,
  interview_status        TEXT,
  offer_received          INTEGER DEFAULT 0,
  offer_amount            TEXT,
  follow_up_date          TEXT,
  notes                   TEXT,
  is_active               INTEGER DEFAULT 1,
  created_at              TEXT DEFAULT (datetime('now')),
  updated_at              TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(application_status);
CREATE INDEX IF NOT EXISTS idx_applications_applied_date ON applications(applied_date);
CREATE INDEX IF NOT EXISTS idx_applications_follow_up ON applications(follow_up_date);

-- ============================================================
-- Table 4: APPLICATION_HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS application_history (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id      INTEGER NOT NULL,
  status_changed_from TEXT,
  status_changed_to   TEXT,
  changed_at          TEXT DEFAULT (datetime('now')),
  changed_by          TEXT DEFAULT 'user',
  notes               TEXT,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_history_application_id ON application_history(application_id);

-- ============================================================
-- Table 5: SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_name  TEXT UNIQUE NOT NULL,
  setting_value TEXT,
  setting_type  TEXT DEFAULT 'string',
  last_updated  TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- Table 6: SCRAPE_LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS scrape_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  platform     TEXT NOT NULL,
  search_term  TEXT,
  location     TEXT,
  jobs_found   INTEGER DEFAULT 0,
  jobs_new     INTEGER DEFAULT 0,
  jobs_skipped INTEGER DEFAULT 0,
  status       TEXT DEFAULT 'success',
  error_msg    TEXT,
  duration_ms  INTEGER,
  ran_at       TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- Triggers: Auto-update updated_at
-- ============================================================
CREATE TRIGGER IF NOT EXISTS jobs_updated_at
  AFTER UPDATE ON jobs
  BEGIN
    UPDATE jobs SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS applications_updated_at
  AFTER UPDATE ON applications
  BEGIN
    UPDATE applications SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS referrals_updated_at
  AFTER UPDATE ON referrals
  BEGIN
    UPDATE referrals SET updated_at = datetime('now') WHERE id = NEW.id;
  END;
