/**
 * Job Data Cleanup Script
 *
 * Fixes corrupted data from IIMjobs scraper where:
 * - company field contains "Industry" literal string
 * - company field contains role descriptions instead of company names
 * - title contains embedded company name that should be extracted
 *
 * Run: node scripts/cleanup-jobs.js
 *      node scripts/cleanup-jobs.js --dry-run    (preview without changes)
 */

const Database = require('better-sqlite3');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const DB_PATH = path.join(__dirname, '..', 'data', 'jobs.db');

// Role keywords that should NEVER appear in a company name.
// If they appear in `company`, the data is corrupted.
const ROLE_KEYWORDS = new Set([
  // Seniority levels
  'senior', 'junior', 'lead', 'principal', 'associate', 'deputy', 'assistant',
  'sr', 'jr', 'avp', 'svp', 'evp', 'gm', 'agm', 'dgm',
  // Position types
  'manager', 'director', 'head', 'vp', 'chief', 'ceo', 'cto', 'cfo', 'coo', 'cmo',
  'analyst', 'consultant', 'specialist', 'officer', 'president', 'founder',
  'strategist', 'expert', 'executive', 'coordinator', 'supervisor',
  'architect', 'engineer', 'designer', 'developer', 'entrepreneur',
  // Vice variants
  'vice',
]);

// Soft role keywords — domain words that appear in role titles
// (e.g., "Strategy Manager", "Marketing Lead"). These can ALSO trigger role boundary
// detection — if we hit one before a strong keyword, it's still likely the role start.
const SOFT_ROLE_KEYWORDS = new Set([
  'strategy', 'marketing', 'sales', 'operations', 'product', 'business',
  'commercial', 'technical', 'growth', 'revenue', 'finance', 'risk', 'hr',
  'partner', 'partnerships', 'planning', 'transformation', 'consulting',
]);

function cleanWord(w) {
  return (w || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isRoleWord(word) {
  return ROLE_KEYWORDS.has(cleanWord(word));
}

function isSoftRoleWord(word) {
  return SOFT_ROLE_KEYWORDS.has(cleanWord(word));
}

/**
 * Check if a company string looks like a corrupted role description.
 * Returns true if the company contains role keywords (which means it's not a real company).
 */
function isCorruptedCompany(company) {
  if (!company) return true;
  const c = company.trim();

  // Empty or generic placeholders
  if (c === '' || c === 'Industry' || c === 'industry') return true;

  // Has role keywords mixed in
  const words = c.split(/\s+/);
  for (const w of words) {
    if (isRoleWord(w)) return true;
  }

  // Suspiciously long (>40 chars usually means it's a description)
  if (c.length > 50) return true;

  // Has dashes — companies usually don't ("Acme - Senior Manager" pattern)
  if (c.includes(' - ') && words.some(w => isSoftRoleWord(w))) return true;

  return false;
}

/**
 * Extract a real company name from the start of a corrupted title.
 * Pattern: "<Company Name Words> <Role Words> <other stuff>"
 * Returns null if can't reliably extract.
 */
function extractCompanyFromTitle(title) {
  if (!title) return null;

  const words = title.trim().split(/\s+/);
  if (words.length < 2) return null;

  // Find first STRONG role keyword (definitive role boundary)
  let strongStart = -1;
  for (let i = 0; i < words.length; i++) {
    if (isRoleWord(words[i])) {
      strongStart = i;
      break;
    }
  }

  // Find first SOFT role keyword (domain word — also likely role boundary)
  let softStart = -1;
  for (let i = 0; i < words.length; i++) {
    if (isSoftRoleWord(words[i])) {
      softStart = i;
      break;
    }
  }

  // Pick whichever boundary comes earliest
  let roleStart = strongStart;
  if (softStart !== -1 && (strongStart === -1 || softStart < strongStart)) {
    roleStart = softStart;
  }

  // First word is a role keyword → no company at the start, give up
  if (roleStart === 0) return null;

  // No role keyword anywhere → can't reliably split company from role
  // Don't guess — return null and let it become "Company Not Mentioned"
  if (roleStart === -1) return null;

  // Found role keyword at position N → company is words[0..N]
  const companyWords = words.slice(0, roleStart);

  // Sanity checks
  if (companyWords.length === 0) return null;
  if (companyWords.length > 6) return null; // Too long for a company name

  const company = companyWords.join(' ').trim();

  if (company.length < 2 || company.length > 50) return null;

  // Reject if it's just generic words like "The" or "A"
  const meaningful = companyWords.filter(w =>
    !['the', 'a', 'an', 'of', 'and', '&'].includes(cleanWord(w))
  );
  if (meaningful.length === 0) return null;

  return company;
}

// ─────────────────────────────────────────────────────────────────
// MAIN CLEANUP
// ─────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`);
console.log('JOB DATA CLEANUP SCRIPT');
console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will update DB)'}`);
console.log(`Database: ${DB_PATH}`);
console.log('═'.repeat(60));

const db = new Database(DB_PATH, { readonly: DRY_RUN });

// Step 1: Find all jobs with corrupted company field
const allJobs = db.prepare("SELECT id, title, company, platform FROM jobs WHERE is_active = 1").all();
console.log(`\nTotal active jobs: ${allJobs.length}`);

const corruptedJobs = allJobs.filter(j => isCorruptedCompany(j.company));
console.log(`Jobs with corrupted company field: ${corruptedJobs.length}`);

// Group by platform for visibility
const byPlatform = {};
for (const j of corruptedJobs) {
  byPlatform[j.platform] = (byPlatform[j.platform] || 0) + 1;
}
console.log('Breakdown by platform:');
Object.entries(byPlatform).forEach(([p, n]) => console.log(`  ${p}: ${n}`));

console.log(`\n${'─'.repeat(60)}`);
console.log('PROCESSING CORRUPTED JOBS');
console.log('─'.repeat(60));

const update = DRY_RUN ? null : db.prepare("UPDATE jobs SET company = ? WHERE id = ?");

const stats = {
  fixedFromTitle: 0,
  setToUnknown: 0,
  examples_fixed: [],
  examples_unknown: [],
};

for (const job of corruptedJobs) {
  const extracted = extractCompanyFromTitle(job.title);

  if (extracted) {
    if (!DRY_RUN) update.run(extracted, job.id);
    stats.fixedFromTitle++;
    if (stats.examples_fixed.length < 10) {
      stats.examples_fixed.push({
        id: job.id,
        oldCompany: job.company.slice(0, 40),
        newCompany: extracted,
        title: job.title.slice(0, 60),
      });
    }
  } else {
    if (!DRY_RUN) update.run('Company Not Mentioned', job.id);
    stats.setToUnknown++;
    if (stats.examples_unknown.length < 10) {
      stats.examples_unknown.push({
        id: job.id,
        oldCompany: job.company.slice(0, 40),
        title: job.title.slice(0, 60),
      });
    }
  }
}

console.log(`\nResults:`);
console.log(`  Extracted company from title: ${stats.fixedFromTitle}`);
console.log(`  Set to "Company Not Mentioned": ${stats.setToUnknown}`);

console.log(`\n${'─'.repeat(60)}`);
console.log('EXAMPLES — FIXED FROM TITLE');
console.log('─'.repeat(60));
stats.examples_fixed.forEach(e => {
  console.log(`  [#${e.id}] "${e.title}"`);
  console.log(`    Was:  "${e.oldCompany}"`);
  console.log(`    Now:  "${e.newCompany}"`);
});

console.log(`\n${'─'.repeat(60)}`);
console.log('EXAMPLES — SET TO "Company Not Mentioned"');
console.log('─'.repeat(60));
stats.examples_unknown.forEach(e => {
  console.log(`  [#${e.id}] "${e.title}"`);
  console.log(`    Was:  "${e.oldCompany}"`);
});

console.log(`\n${'═'.repeat(60)}`);
if (DRY_RUN) {
  console.log('DRY RUN COMPLETE — no changes made.');
  console.log('Run without --dry-run to apply changes.');
} else {
  console.log('CLEANUP COMPLETE!');
  console.log(`${stats.fixedFromTitle + stats.setToUnknown} jobs updated.`);
}
console.log('═'.repeat(60));

db.close();
