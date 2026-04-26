/**
 * One-time cleanup: remove jobs that have no URL or have misleading URLs
 * (careers homepage, amazon.jobs search, etc) — keeps any tracked jobs intact.
 */
const { getDb, initDb } = require('../database/db');

initDb();
const db = getDb();

const before = db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n;

const trackedIds = new Set(
  db.prepare('SELECT DISTINCT job_id FROM applications WHERE is_active=1').all().map(r => r.job_id)
);

// 1) Find candidate IDs: jobs without a real URL
const noUrlIds = db.prepare(
  "SELECT id FROM jobs WHERE job_url IS NULL OR job_url = '' OR length(job_url) < 25"
).all().map(r => r.id);

// 2) Find candidate IDs: misleading seed URLs (careers home, search-only)
const badPatterns = [
  '%/careers',
  '%/careers/',
  '%amazon.jobs/en/search%',
  '%hubspot.com/jobs%',
  '%zeptonow.com/careers%',
  '%navi.com/careers%',
  '%sliceit.com/careers%',
  '%open.money/careers%',
  '%groww.in/p/careers%',
  '%browserstack.com/careers%',
  '%chargebee.com/careers/%',
  '%darwinbox.com/careers%',
  '%careers.cred.club/%',
  '%careers.swiggy.com/%',
];
const misleadingIds = new Set();
for (const pat of badPatterns) {
  const rows = db.prepare('SELECT id FROM jobs WHERE job_url LIKE ?').all(pat);
  rows.forEach(r => misleadingIds.add(r.id));
}

// Combine, then exclude tracked
const allBad = new Set([...noUrlIds, ...misleadingIds]);
const toDelete = [...allBad].filter(id => !trackedIds.has(id));

const delRef = db.prepare('DELETE FROM referrals WHERE job_id = ?');
const delJob = db.prepare('DELETE FROM jobs WHERE id = ?');

const txn = db.transaction(() => {
  for (const id of toDelete) {
    delRef.run(id);
    delJob.run(id);
  }
});
txn();

const after = db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n;
console.log(`Cleanup: removed ${toDelete.length} jobs (${noUrlIds.length} no-URL + ${misleadingIds.size} misleading)`);
console.log(`Before: ${before} jobs → After: ${after} jobs`);
process.exit(0);
