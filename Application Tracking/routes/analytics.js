const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

// GET /api/analytics/overview - Main dashboard stats
router.get('/overview', (req, res) => {
  const db = getDb();

  const stats = {
    applications: {
      total: db.prepare("SELECT COUNT(*) as c FROM applications WHERE is_active=1").get().c,
      today: db.prepare("SELECT COUNT(*) as c FROM applications WHERE date(applied_date)=date('now')").get().c,
      thisWeek: db.prepare("SELECT COUNT(*) as c FROM applications WHERE applied_date >= datetime('now','-7 days')").get().c,
      thisMonth: db.prepare("SELECT COUNT(*) as c FROM applications WHERE applied_date >= datetime('now','-30 days')").get().c,
    },
    jobs: {
      total: db.prepare("SELECT COUNT(*) as c FROM jobs WHERE is_active=1").get().c,
      today: db.prepare("SELECT COUNT(*) as c FROM jobs WHERE date(scraped_date)=date('now')").get().c,
      notApplied: db.prepare("SELECT COUNT(*) as c FROM jobs j WHERE is_active=1 AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.job_id=j.id)").get().c,
    },
    pipeline: {
      pending: db.prepare("SELECT COUNT(*) as c FROM applications WHERE application_status='pending' AND is_active=1").get().c,
      got_call: db.prepare("SELECT COUNT(*) as c FROM applications WHERE application_status='got_call' AND is_active=1").get().c,
      in_progress: db.prepare("SELECT COUNT(*) as c FROM applications WHERE application_status='in_progress' AND is_active=1").get().c,
      rejected: db.prepare("SELECT COUNT(*) as c FROM applications WHERE application_status='rejected' AND is_active=1").get().c,
      converted: db.prepare("SELECT COUNT(*) as c FROM applications WHERE application_status='converted' AND is_active=1").get().c,
    },
    referrals: {
      total: db.prepare("SELECT COUNT(*) as c FROM referrals").get().c,
      contacted: db.prepare("SELECT COUNT(*) as c FROM referrals WHERE contacted=1").get().c,
      responded: db.prepare("SELECT COUNT(*) as c FROM referrals WHERE response_received=1").get().c,
    },
    followups: {
      due: db.prepare(`
        SELECT COUNT(*) as c FROM applications
        WHERE is_active=1
          AND application_status IN ('pending','in_progress','got_call')
          AND (follow_up_date IS NULL OR follow_up_date <= datetime('now'))
      `).get().c,
      upcoming: db.prepare(`
        SELECT COUNT(*) as c FROM applications
        WHERE is_active=1
          AND follow_up_date > datetime('now')
          AND follow_up_date <= datetime('now','+3 days')
      `).get().c,
    },
  };

  // Conversion rates
  const total = stats.applications.total || 1;
  stats.conversionRates = {
    callRate: Math.round(((stats.pipeline.got_call + stats.pipeline.in_progress + stats.pipeline.converted) / total) * 100),
    offerRate: Math.round((stats.pipeline.converted / total) * 100),
    rejectionRate: Math.round((stats.pipeline.rejected / total) * 100),
  };

  res.json({ success: true, data: stats });
});

// GET /api/analytics/daily - Applications per day (last 30 days)
router.get('/daily', (req, res) => {
  const db = getDb();
  const days = parseInt(req.query.days) || 30;

  const data = db.prepare(`
    WITH RECURSIVE dates(date) AS (
      SELECT date('now', -(${days}-1) || ' days')
      UNION ALL
      SELECT date(date, '+1 day') FROM dates WHERE date < date('now')
    )
    SELECT
      dates.date,
      COUNT(a.id) as applications,
      COUNT(j.id) as jobs_scraped
    FROM dates
    LEFT JOIN applications a ON date(a.applied_date) = dates.date AND a.is_active=1
    LEFT JOIN jobs j ON date(j.scraped_date) = dates.date
    GROUP BY dates.date
    ORDER BY dates.date ASC
  `).all();

  res.json({ success: true, data });
});

// GET /api/analytics/by-company - Stats grouped by company
router.get('/by-company', (req, res) => {
  const db = getDb();
  const data = db.prepare(`
    SELECT
      j.company,
      COUNT(DISTINCT j.id) as jobs_found,
      COUNT(DISTINCT a.id) as applications,
      COUNT(DISTINCT r.id) as referrals,
      SUM(CASE WHEN a.application_status='got_call' THEN 1 ELSE 0 END) as calls,
      SUM(CASE WHEN a.application_status='converted' THEN 1 ELSE 0 END) as offers
    FROM jobs j
    LEFT JOIN applications a ON a.job_id = j.id AND a.is_active=1
    LEFT JOIN referrals r ON r.job_id = j.id
    GROUP BY j.company
    ORDER BY applications DESC, jobs_found DESC
    LIMIT 30
  `).all();
  res.json({ success: true, data });
});

// GET /api/analytics/by-role - Stats grouped by role title keywords
router.get('/by-role', (req, res) => {
  const db = getDb();
  const data = db.prepare(`
    SELECT
      CASE
        WHEN lower(j.title) LIKE '%growth%' THEN 'Growth Manager'
        WHEN lower(j.title) LIKE '%gtm%' OR lower(j.title) LIKE '%go-to-market%' THEN 'GTM Manager'
        WHEN lower(j.title) LIKE '%chief of staff%' THEN 'Chief of Staff'
        WHEN lower(j.title) LIKE '%founder%' THEN "Founder's Office"
        WHEN lower(j.title) LIKE '%operations%' THEN 'Operations Manager'
        WHEN lower(j.title) LIKE '%business planning%' THEN 'Business Planning'
        WHEN lower(j.title) LIKE '%ai%' THEN 'AI Roles'
        ELSE 'Other'
      END as role_category,
      COUNT(DISTINCT j.id) as jobs_found,
      COUNT(DISTINCT a.id) as applications,
      SUM(CASE WHEN a.application_status='got_call' THEN 1 ELSE 0 END) as calls,
      SUM(CASE WHEN a.application_status='converted' THEN 1 ELSE 0 END) as offers
    FROM jobs j
    LEFT JOIN applications a ON a.job_id = j.id AND a.is_active=1
    GROUP BY role_category
    ORDER BY applications DESC
  `).all();
  res.json({ success: true, data });
});

// GET /api/analytics/by-location - Stats grouped by location
router.get('/by-location', (req, res) => {
  const db = getDb();
  const data = db.prepare(`
    SELECT
      j.location,
      COUNT(DISTINCT j.id) as jobs_found,
      COUNT(DISTINCT a.id) as applications,
      SUM(CASE WHEN a.application_status='got_call' THEN 1 ELSE 0 END) as calls
    FROM jobs j
    LEFT JOIN applications a ON a.job_id = j.id AND a.is_active=1
    GROUP BY j.location
    ORDER BY applications DESC, jobs_found DESC
  `).all();
  res.json({ success: true, data });
});

// GET /api/analytics/referral-effectiveness - Referral impact analysis
router.get('/referral-effectiveness', (req, res) => {
  const db = getDb();
  const withRef = db.prepare(`
    SELECT
      COUNT(DISTINCT a.id) as total,
      SUM(CASE WHEN a.application_status='got_call' THEN 1 ELSE 0 END) as calls,
      SUM(CASE WHEN a.application_status='converted' THEN 1 ELSE 0 END) as offers
    FROM applications a
    WHERE a.is_active=1 AND EXISTS (
      SELECT 1 FROM referrals r WHERE r.job_id=a.job_id AND r.contacted=1
    )
  `).get();

  const withoutRef = db.prepare(`
    SELECT
      COUNT(DISTINCT a.id) as total,
      SUM(CASE WHEN a.application_status='got_call' THEN 1 ELSE 0 END) as calls
    FROM applications a
    WHERE a.is_active=1 AND NOT EXISTS (
      SELECT 1 FROM referrals r WHERE r.job_id=a.job_id AND r.contacted=1
    )
  `).get();

  const byType = db.prepare(`
    SELECT r.connection_type,
      COUNT(DISTINCT r.id) as total,
      COUNT(DISTINCT CASE WHEN r.response_received=1 THEN r.id END) as responses
    FROM referrals r
    GROUP BY r.connection_type
    ORDER BY responses DESC
  `).all();

  res.json({
    success: true,
    data: {
      withReferral: withRef,
      withoutReferral: withoutRef,
      callRateWithRef: withRef.total ? Math.round((withRef.calls / withRef.total) * 100) : 0,
      callRateWithoutRef: withoutRef.total ? Math.round((withoutRef.calls / withoutRef.total) * 100) : 0,
      byConnectionType: byType,
    },
  });
});

// GET /api/analytics/scrape-logs - Scraper performance
router.get('/scrape-logs', (req, res) => {
  const db = getDb();
  const logs = db.prepare(`
    SELECT * FROM scrape_logs
    ORDER BY ran_at DESC LIMIT 50
  `).all();
  const summary = db.prepare(`
    SELECT platform, COUNT(*) as runs, SUM(jobs_found) as total_found, SUM(jobs_new) as total_new
    FROM scrape_logs WHERE status='success'
    GROUP BY platform
  `).all();
  res.json({ success: true, data: { logs, summary } });
});

// GET /api/analytics/export - Export all data as JSON
router.get('/export', (req, res) => {
  const db = getDb();
  const data = {
    exported_at: new Date().toISOString(),
    jobs: db.prepare('SELECT * FROM jobs').all(),
    applications: db.prepare('SELECT * FROM applications').all(),
    referrals: db.prepare('SELECT * FROM referrals').all(),
    application_history: db.prepare('SELECT * FROM application_history').all(),
    settings: db.prepare('SELECT * FROM settings').all(),
  };
  res.setHeader('Content-Disposition', `attachment; filename="job-tracker-export-${Date.now()}.json"`);
  res.json(data);
});

module.exports = router;
