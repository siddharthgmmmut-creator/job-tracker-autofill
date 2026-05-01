/**
 * Job Scheduler - Runs automated scraping and follow-up tasks
 *
 * Schedules:
 * - 7:00 AM daily: Scrape all job platforms
 * - 9:00 AM daily: Follow-up reminders
 * - 11:59 PM Sunday: Weekly backup
 */
const cron = require('node-cron');
const { getDb, setSetting } = require('../database/db');
const { scrapeNaukri } = require('../scrapers/naukri-scraper');
const { scrapeIIMjobs } = require('../scrapers/iimjobs-scraper');
const { scrapeCompanyPortals } = require('../scrapers/company-portal-scraper');
const { scrapeLinkedIn } = require('../scrapers/linkedin-scraper');
const { savePlaceholderReferrals } = require('./referral-finder');
const { createBackup } = require('./backup');
const { logger } = require('../middleware/logger');
const config = require('../config/config');
const { SEARCH_KEYWORDS, ALL_SEARCH_LOCATIONS } = require('../config/constants');
const { classifyNewJobs } = require('./roleIntelligence');

let scraperRunning = false;

// Live scrape state — readable by the /scrape/status endpoint so the UI can poll.
let scrapeState = {
  running:     false,
  startedAt:   null,   // ISO string set when run begins
  finishedAt:  null,   // ISO string set when run ends (success or error)
  result:      null,   // { totalNew, totalFound, totalSkipped, duration, platformResults }
  error:       null,   // error message if the run crashed
};

function getScrapeStatus() { return { ...scrapeState }; }

/**
 * Save scraped jobs to database, avoiding duplicates
 * Returns { new: number, skipped: number }
 */
function saveJobs(jobs) {
  const db = getDb();
  let newCount = 0;
  let skippedCount = 0;

  const insertJob = db.prepare(`
    INSERT OR IGNORE INTO jobs
      (external_id, title, company, location, job_url, platform, posted_date, description,
       salary_mentioned, salary_range, requirements, location_priority)
    VALUES
      (@external_id, @title, @company, @location, @job_url, @platform, @posted_date, @description,
       @salary_mentioned, @salary_range, @requirements, @location_priority)
  `);

  const saveAll = db.transaction((jobList) => {
    for (const job of jobList) {
      // Skip search URL placeholders from LinkedIn (no real job)
      if (job.is_search_url) { skippedCount++; continue; }

      // CRITICAL: Skip jobs without a real apply URL — no point storing un-applyable jobs
      if (!job.job_url || job.job_url.length < 20) { skippedCount++; continue; }

      // Data quality: skip jobs with no company name (indicates extraction failure)
      if (!job.company || job.company.trim() === '') { skippedCount++; continue; }

      // Skip if job URL already exists
      const exists = db.prepare('SELECT id FROM jobs WHERE job_url = ?').get(job.job_url);
      if (exists) { skippedCount++; continue; }

      const result = insertJob.run({
        external_id: job.external_id || null,
        title: job.title || '',
        company: job.company || '',
        location: job.location || '',
        job_url: job.job_url || null,
        platform: job.platform || 'manual',
        posted_date: job.posted_date || new Date().toISOString(),
        description: job.description || '',
        salary_mentioned: job.salary_mentioned ? 1 : 0,
        salary_range: job.salary_range || '',
        requirements: job.requirements || '',
        location_priority: job.location_priority || 99,
      });

      if (result.changes > 0) {
        newCount++;
        // Auto-generate referral placeholders for new jobs
        const newJobId = result.lastInsertRowid;
        try {
          savePlaceholderReferrals(newJobId, job.company, job.title);
        } catch (err) {
          logger.error(`Referral placeholder failed for job ${newJobId}:`, err.message);
        }
      } else {
        skippedCount++;
      }
    }
  });

  saveAll(jobs);
  return { new: newCount, skipped: skippedCount };
}

/**
 * Log scrape results to scrape_logs table
 */
function logScrape(platform, searchTerm, location, found, newJobs, skipped, status, errorMsg, durationMs) {
  const db = getDb();
  db.prepare(`
    INSERT INTO scrape_logs (platform, search_term, location, jobs_found, jobs_new, jobs_skipped, status, error_msg, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(platform, searchTerm, location, found, newJobs, skipped, status, errorMsg, durationMs);
}

// ── Scraping visibility thresholds ────────────────────────────
const LOW_COUNT_THRESHOLDS = {
  naukri:   { found: 10, newJobs: 2 },
  iimjobs:  { found: 5,  newJobs: 1 },
  linkedin: { found: 5,  newJobs: 1 },
};

/**
 * Emit structured visibility logs after each platform scrape.
 * Flags low counts so you notice scraper drift immediately.
 */
function logPlatformVisibility(platform, found, newJobs, skipped, durationMs) {
  const thresh = LOW_COUNT_THRESHOLDS[platform] || { found: 5, newJobs: 1 };
  const durationSec = (durationMs / 1000).toFixed(1);

  // Always emit a structured summary line
  logger.info(
    `📊 [${platform.toUpperCase()}] found=${found} | new=${newJobs} | skipped=${skipped} | time=${durationSec}s`
  );

  // Warn when counts look suspiciously low
  if (found < thresh.found) {
    logger.warn(
      `⚠️  LOW JOB COUNT on ${platform.toUpperCase()}: only ${found} jobs fetched ` +
      `(expected ≥ ${thresh.found}). Possible scraper drift or site layout change.`
    );
  }
  if (newJobs < thresh.newJobs && found >= thresh.found) {
    logger.warn(
      `⚠️  VERY FEW NEW JOBS on ${platform.toUpperCase()}: ${newJobs} new out of ${found} fetched. ` +
      `Database may already be saturated or dedup threshold is too aggressive.`
    );
  }
}

/**
 * Main scraping function - runs all scrapers
 */
async function runScrape() {
  if (scraperRunning) {
    logger.warn('Scraper already running, skipping...');
    return;
  }

  scraperRunning = true;
  scrapeState = { running: true, startedAt: new Date().toISOString(), finishedAt: null, result: null, error: null };
  const startTime = Date.now();
  logger.info('🚀 Starting job scrape...');
  logger.info('─'.repeat(55));

  // Track per-platform results for end-of-run summary
  const platformResults = [];

  try {
    let totalNew = 0;
    let totalSkipped = 0;
    let totalFound = 0;

    // 1. Scrape Naukri (primary - most reliable for India)
    try {
      logger.info('📋 Scraping Naukri...');
      const t = Date.now();
      const naukriJobs = await scrapeNaukri(
        SEARCH_KEYWORDS,              // all keywords (scraper caps internally at 10)
        ALL_SEARCH_LOCATIONS          // all locations (scraper caps internally at 8)
      );
      const elapsed = Date.now() - t;
      const { new: n, skipped: s } = saveJobs(naukriJobs);
      totalNew += n; totalSkipped += s; totalFound += naukriJobs.length;
      logScrape('naukri', SEARCH_KEYWORDS.slice(0,5).join(','), 'all', naukriJobs.length, n, s, 'success', null, elapsed);
      logPlatformVisibility('naukri', naukriJobs.length, n, s, elapsed);
      platformResults.push({ platform: 'Naukri', found: naukriJobs.length, newJobs: n, skipped: s, status: '✅' });
    } catch (err) {
      logger.error('❌ Naukri scrape failed:', err.message);
      logScrape('naukri', '', '', 0, 0, 0, 'error', err.message, 0);
      logger.warn('⚠️  Naukri returned 0 jobs due to error — check scraper logs above.');
      platformResults.push({ platform: 'Naukri', found: 0, newJobs: 0, skipped: 0, status: '❌', error: err.message });
    }

    // 2. Scrape IIMjobs (for premium/senior roles)
    try {
      logger.info('📋 Scraping IIMjobs...');
      const t = Date.now();
      // Keywords and locations are managed internally by the IIMjobs scraper;
      // these args are accepted but the scraper uses its own expanded lists.
      const iimJobs = await scrapeIIMjobs(
        SEARCH_KEYWORDS,
        ALL_SEARCH_LOCATIONS
      );
      const elapsed = Date.now() - t;
      const { new: n, skipped: s } = saveJobs(iimJobs);
      totalNew += n; totalSkipped += s; totalFound += iimJobs.length;
      logScrape('iimjobs', 'growth,gtm,ops', 'Mumbai,Delhi,Bangalore', iimJobs.length, n, s, 'success', null, elapsed);
      logPlatformVisibility('iimjobs', iimJobs.length, n, s, elapsed);
      platformResults.push({ platform: 'IIMjobs', found: iimJobs.length, newJobs: n, skipped: s, status: '✅' });
    } catch (err) {
      logger.error('❌ IIMjobs scrape failed:', err.message);
      logScrape('iimjobs', '', '', 0, 0, 0, 'error', err.message, 0);
      logger.warn('⚠️  IIMjobs returned 0 jobs due to error — check scraper logs above.');
      platformResults.push({ platform: 'IIMjobs', found: 0, newJobs: 0, skipped: 0, status: '❌', error: err.message });
    }

    // 3. Company Portals — Lever + Greenhouse API only (Puppeteer disabled inside scraper)
    try {
      logger.info('📋 Scraping Company Portals (Lever + Greenhouse)...');
      const t = Date.now();
      const portalJobs = await scrapeCompanyPortals();
      const elapsed = Date.now() - t;
      const { new: n, skipped: s } = saveJobs(portalJobs);
      totalNew += n; totalSkipped += s; totalFound += portalJobs.length;
      logScrape('company_portal', 'api-based', 'all', portalJobs.length, n, s, 'success', null, elapsed);
      logPlatformVisibility('company_portal', portalJobs.length, n, s, elapsed);
      platformResults.push({ platform: 'Portals', found: portalJobs.length, newJobs: n, skipped: s, status: '✅' });
    } catch (err) {
      logger.error('❌ Company portals scrape failed:', err.message);
      logScrape('company_portal', '', '', 0, 0, 0, 'error', err.message, 0);
      platformResults.push({ platform: 'Portals', found: 0, newJobs: 0, skipped: 0, status: '❌', error: err.message });
    }

    // 4. LinkedIn — always runs (cookie hardcoded in scraper)
    try {
      logger.info('📋 Scraping LinkedIn...');
      const t = Date.now();
      const liJobs = await scrapeLinkedIn(
        SEARCH_KEYWORDS.slice(0, 8),
        ALL_SEARCH_LOCATIONS.slice(0, 6)
      );
      const elapsed = Date.now() - t;
      const { new: n, skipped: s } = saveJobs(liJobs);
      totalNew += n; totalSkipped += s; totalFound += liJobs.length;
      logScrape('linkedin', SEARCH_KEYWORDS.slice(0,8).join(','), 'multi', liJobs.length, n, s, 'success', null, elapsed);
      logPlatformVisibility('linkedin', liJobs.length, n, s, elapsed);
      platformResults.push({ platform: 'LinkedIn', found: liJobs.length, newJobs: n, skipped: s, status: '✅' });
    } catch (err) {
      logger.error('❌ LinkedIn scrape failed:', err.message);
      logScrape('linkedin', '', '', 0, 0, 0, 'error', err.message, 0);
      logger.warn('⚠️  LinkedIn returned 0 jobs — session cookie may have expired. Update LI_SESSION_COOKIE in linkedin-scraper.js');
      platformResults.push({ platform: 'LinkedIn', found: 0, newJobs: 0, skipped: 0, status: '❌', error: err.message });
    }

    const duration = Math.round((Date.now() - startTime) / 1000);

    // ── Role Intelligence — classify all newly added jobs ──────
    try {
      const rStats = classifyNewJobs();
      logger.info(`🧠 Intelligence: ${rStats.classified} roles assigned, ${rStats.filtered} filtered, ${rStats.noMatch} no-match`);
    } catch (err) {
      logger.warn(`⚠️  Role classification failed (non-fatal): ${err.message}`);
    }

    // ── End-of-run visibility summary ─────────────────────────
    logger.info('─'.repeat(55));
    logger.info('📋 SCRAPE SUMMARY');
    logger.info('─'.repeat(55));
    for (const r of platformResults) {
      const line = `  ${r.status} ${r.platform.padEnd(10)} │ found: ${String(r.found).padStart(4)} │ new: ${String(r.newJobs).padStart(4)} │ skipped: ${String(r.skipped).padStart(4)}`;
      logger.info(line);
      if (r.error) logger.info(`     error: ${r.error.slice(0, 80)}`);
    }
    logger.info('─'.repeat(55));
    logger.info(`  TOTAL  │ found: ${String(totalFound).padStart(4)} │ new: ${String(totalNew).padStart(4)} │ skipped: ${String(totalSkipped).padStart(4)} │ time: ${duration}s`);
    logger.info('─'.repeat(55));

    // Global low-count alert
    if (totalNew === 0 && totalFound > 0) {
      logger.warn('⚠️  ALL JOBS ALREADY IN DB — zero new jobs saved. This is normal if scrapers ran recently.');
    } else if (totalNew === 0 && totalFound === 0) {
      logger.warn('🚨 CRITICAL: No jobs fetched from ANY platform. All scrapers may have failed or been blocked.');
    } else if (totalNew < 5) {
      logger.warn(`⚠️  Very low new job count today (${totalNew}). Scrapers may be degraded.`);
    }

    setSetting('last_scrape', new Date().toISOString(), 'string');

    scrapeState.result = { totalNew, totalFound, totalSkipped, duration, platformResults };
    return { success: true, totalNew, totalSkipped, totalFound, duration, platformResults };
  } catch (err) {
    logger.error('❌ Scrape failed:', err);
    scrapeState.error = err.message;
    throw err;
  } finally {
    scraperRunning = false;
    scrapeState.running    = false;
    scrapeState.finishedAt = new Date().toISOString();
  }
}

/**
 * Check for follow-up reminders
 */
function checkFollowUps() {
  const db = getDb();
  const due = db.prepare(`
    SELECT a.id, a.follow_up_date, j.title, j.company
    FROM applications a
    JOIN jobs j ON a.job_id = j.id
    WHERE a.is_active = 1
      AND a.application_status IN ('pending', 'in_progress', 'got_call')
      AND (a.follow_up_date IS NULL OR a.follow_up_date <= datetime('now'))
  `).all();

  if (due.length > 0) {
    logger.info(`📅 Follow-up reminder: ${due.length} applications need follow-up`);
    due.forEach(app => {
      logger.info(`  → ${app.company}: ${app.title} (ID: ${app.id})`);
    });
  }

  return due;
}

/**
 * Initialize all cron jobs
 */
function initScheduler() {
  // Daily job scraping at 7:00 AM
  cron.schedule(config.scheduler.scraperSchedule, async () => {
    logger.info('⏰ Scheduled scrape starting (7:00 AM)');
    try {
      await runScrape();
    } catch (err) {
      logger.error('Scheduled scrape error:', err);
    }
  }, { timezone: 'Asia/Kolkata' });

  // Follow-up check at 9:00 AM
  cron.schedule(config.scheduler.followupSchedule, () => {
    logger.info('⏰ Follow-up check (9:00 AM)');
    checkFollowUps();
  }, { timezone: 'Asia/Kolkata' });

  // Weekly backup on Sunday at 11:59 PM
  cron.schedule(config.scheduler.backupSchedule, async () => {
    logger.info('⏰ Weekly backup starting...');
    try {
      const backupPath = await createBackup();
      setSetting('last_backup', new Date().toISOString(), 'string');
      logger.info(`Backup completed: ${backupPath}`);
    } catch (err) {
      logger.error('Scheduled backup error:', err);
    }
  }, { timezone: 'Asia/Kolkata' });

  logger.info('✅ Scheduler initialized');
  logger.info(`  Scraper: ${config.scheduler.scraperSchedule} IST`);
  logger.info(`  Follow-ups: ${config.scheduler.followupSchedule} IST`);
  logger.info(`  Backup: ${config.scheduler.backupSchedule} IST`);
}

// Expose for API trigger
async function runManualScrape() {
  logger.info('🔧 Manual scrape triggered');
  return runScrape();
}

module.exports = { initScheduler, runManualScrape, saveJobs, checkFollowUps, getScrapeStatus };
