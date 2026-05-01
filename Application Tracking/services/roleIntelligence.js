/**
 * Role Intelligence Engine
 *
 * Classifies jobs semantically against a configurable role repository.
 * Roles are loaded from the DB (seeded from data/roleRepository.json).
 *
 * Scoring formula per role:
 *   score = (title_match × 3) + (keyword_match × 2) +
 *           (responsibility_match × 3) + (signal_match × 4) −
 *           (exclude_match × 5) − (role_seniority_reject × 20)
 *
 * Global filters (applied before per-role scoring):
 *   Tech Filter    — rejects jobs that are clearly engineering/data roles
 *   Seniority Filter — rejects VP / Director / CXO level titles
 *
 * Output per job: top 2-3 matched roles above threshold, stored as JSON
 * in jobs.role_tags, primary role in jobs.fit_category.
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const { getDb }  = require('../database/db');
const { logger } = require('../middleware/logger');

// ── Global tech-rejection keywords ────────────────────────────────
// These indicate coding/data-engineering roles, NOT management roles.
const TECH_HARD_REJECT = [
  'data scientist', 'data engineer', 'machine learning engineer',
  'ml engineer', 'software engineer', 'backend engineer', 'frontend engineer',
  'full stack engineer', 'full stack developer', 'devops engineer', 'sre',
  'site reliability engineer', 'cloud engineer', 'ai engineer',
];

// Body keywords — if 2+ present, likely a tech role
const TECH_BODY_SIGNALS = [
  'python', 'machine learning', 'data science', 'deep learning',
  'tensorflow', 'pytorch', 'etl pipeline', 'data pipeline',
  'spark', 'hadoop', 'data engineering', 'model training',
  'neural network', 'nlp model', 'computer vision',
];

// AI/GTM context titles that should NOT be caught by tech filter
const TECH_ALLOW_IN_TITLE = [
  'ai gtm', 'ai product', 'ai strategy', 'genai', 'llm strategy',
  'ai program manager', 'ai chief of staff', 'ai operations',
];

// ── Global seniority-rejection patterns (match in normalized title) ─
const SENIORITY_REJECT_PATTERNS = [
  'vp ', ' vp,', 'vice president',
  ' director', 'director,', 'director -', 'director–',
  'chief executive', 'chief operating', 'chief technology',
  'chief product', 'chief marketing', 'chief revenue', 'chief financial',
  'cto ', 'coo ', 'ceo ', 'cmo ', 'cfo ', 'cpo ',
  'svp ', 'evp ', ' president,', 'president -',
];

// ── Text normalisation ─────────────────────────────────────────────
/**
 * Lowercase, strip possessives/apostrophes, remove punctuation,
 * collapse whitespace. Safe to call on null/undefined.
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u2032\u02BC]/g, '')   // smart single quotes
    .replace(/'s\b/g, '')                           // possessives: CEO's → CEO
    .replace(/[^\w\s]/g, ' ')                       // punctuation → space
    .replace(/\s+/g, ' ')                           // collapse whitespace
    .trim();
}

// ── Global filters ─────────────────────────────────────────────────
function isTechHeavy(normTitle, normBody) {
  // Whitelisted AI-management titles pass through
  if (TECH_ALLOW_IN_TITLE.some(t => normTitle.includes(t))) return false;
  // Hard reject: title IS a tech role
  if (TECH_HARD_REJECT.some(t => normTitle.includes(normalizeText(t)))) return true;
  // Soft reject: body contains 2+ independent data/ML signals
  const bodyHits = TECH_BODY_SIGNALS.filter(kw => normBody.includes(kw)).length;
  return bodyHits >= 2;
}

function hasSeniorityRejection(normTitle) {
  return SENIORITY_REJECT_PATTERNS.some(p => normTitle.includes(p));
}

// ── Role repository cache ──────────────────────────────────────────
let _cachedRoles = null;
let _cacheTs     = 0;
const CACHE_TTL  = 5 * 60 * 1000; // 5 minutes

function loadRoles() {
  const now = Date.now();
  if (_cachedRoles && (now - _cacheTs) < CACHE_TTL) return _cachedRoles;

  // 1. Try DB
  try {
    const db   = getDb();
    const rows = db.prepare('SELECT * FROM role_definitions WHERE is_active = 1 ORDER BY name').all();
    if (rows.length > 0) {
      _cachedRoles = rows.map(r => ({
        id:              r.id,
        name:            r.name,
        color:           r.color || 'blue',
        titles:          _parseJson(r.titles),
        keywords:        _parseJson(r.keywords),
        responsibilities: _parseJson(r.responsibilities),
        signals:         _parseJson(r.signals),
        excludeKeywords: _parseJson(r.exclude_keywords),
        seniorityReject: _parseJson(r.seniority_reject),
        isTechnical:     !!r.is_technical,
        threshold:       r.threshold || 20,
      }));
      _cacheTs = now;
      return _cachedRoles;
    }
  } catch (_) {}

  // 2. Fallback: JSON file
  const jsonPath = path.join(__dirname, '../data/roleRepository.json');
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  _cachedRoles = raw.roles;
  _cacheTs = now;
  return _cachedRoles;
}

function invalidateCache() {
  _cachedRoles = null;
  _cacheTs     = 0;
}

function _parseJson(str) {
  try { return JSON.parse(str || '[]'); } catch { return []; }
}

// ── Per-role scorer ────────────────────────────────────────────────
/**
 * Returns a numeric score for a single role against normalized text.
 *
 * Weights:  title +3 | keyword +2 | responsibility +3 | signal +4
 *           excludeKeyword −5 | roleSpecific seniority −20
 */
function scoreJobForRole(normFull, normTitle, role) {
  let score = 0;

  // Title matches (×3 each)
  for (const t of role.titles) {
    if (normTitle.includes(normalizeText(t))) score += 3;
  }

  // Keyword matches (×2 each)
  for (const k of role.keywords) {
    if (normFull.includes(normalizeText(k))) score += 2;
  }

  // Responsibility matches (×3 each)
  for (const r of role.responsibilities) {
    if (normFull.includes(normalizeText(r))) score += 3;
  }

  // Signal matches (×4 each)
  for (const s of role.signals) {
    if (normFull.includes(normalizeText(s))) score += 4;
  }

  // Exclude keyword matches (×−5 each)
  for (const e of role.excludeKeywords) {
    if (normFull.includes(normalizeText(e))) score -= 5;
  }

  // Role-level seniority penalty (×−20) — e.g. "vp growth" for growth_manager role
  for (const sr of (role.seniorityReject || [])) {
    if (normTitle.includes(normalizeText(sr))) score -= 20;
  }

  return score;
}

// ── Main classifier ────────────────────────────────────────────────
/**
 * Classify a single job against all loaded roles.
 *
 * Returns:
 *   { tags: [{id, name, score, color}], topScore: number, filtered: string|null }
 *
 * filtered values:
 *   'tech'      — rejected by tech filter
 *   'seniority' — rejected by global seniority filter
 *   'no_match'  — passed filters but no role exceeded its threshold
 *   null        — successfully classified
 */
function classifyJob(job, roles) {
  const normTitle = normalizeText(job.title);
  const normFull  = normalizeText(
    `${job.title || ''} ${job.description || ''} ${job.requirements || ''}`
  );

  if (isTechHeavy(normTitle, normFull)) {
    return { tags: [], topScore: 0, filtered: 'tech' };
  }

  if (hasSeniorityRejection(normTitle)) {
    return { tags: [], topScore: 0, filtered: 'seniority' };
  }

  const scored = roles
    .map(role => ({ role, score: scoreJobForRole(normFull, normTitle, role) }))
    .filter(({ score, role }) => score >= role.threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);   // top 3 roles max

  if (scored.length === 0) {
    return { tags: [], topScore: 0, filtered: 'no_match' };
  }

  return {
    tags: scored.map(s => ({
      id:    s.role.id,
      name:  s.role.name,
      score: s.score,
      color: s.role.color,
    })),
    topScore: scored[0].score,
    filtered: null,
  };
}

// ── Batch operations ───────────────────────────────────────────────
/**
 * (Re-)classify every active job in the DB.
 * Used for the Settings "Re-classify All" button.
 */
function classifyAllJobs() {
  const db    = getDb();
  const roles = loadRoles();

  const jobs  = db.prepare(
    'SELECT id, title, description, requirements FROM jobs WHERE is_active = 1'
  ).all();

  const update = db.prepare(
    'UPDATE jobs SET role_tags = ?, intelligence_score = ?, fit_category = ? WHERE id = ?'
  );

  let classified = 0, filtered = 0, noMatch = 0;

  const runAll = db.transaction((jobList) => {
    for (const job of jobList) {
      const result = classifyJob(job, roles);
      update.run(
        JSON.stringify(result.tags),
        result.topScore,
        result.tags[0]?.id || null,
        job.id
      );
      if (result.filtered === 'tech' || result.filtered === 'seniority') filtered++;
      else if (result.filtered === 'no_match') noMatch++;
      else classified++;
    }
  });

  runAll(jobs);

  const stats = { classified, filtered, noMatch, total: jobs.length };
  logger.info(
    `🧠 Role Intelligence (full): classified=${classified} filtered=${filtered} no_match=${noMatch} total=${jobs.length}`
  );
  return stats;
}

/**
 * Classify only jobs that haven't been tagged yet.
 * Called automatically after each scrape.
 */
function classifyNewJobs() {
  const db    = getDb();
  const roles = loadRoles();

  const jobs = db.prepare(`
    SELECT id, title, description, requirements
    FROM   jobs
    WHERE  is_active = 1
      AND  (role_tags IS NULL OR role_tags = '' OR role_tags = '[]')
  `).all();

  if (jobs.length === 0) return { classified: 0, filtered: 0, noMatch: 0, total: 0 };

  const update = db.prepare(
    'UPDATE jobs SET role_tags = ?, intelligence_score = ?, fit_category = ? WHERE id = ?'
  );

  let classified = 0, filtered = 0, noMatch = 0;

  const runAll = db.transaction((jobList) => {
    for (const job of jobList) {
      const result = classifyJob(job, roles);
      update.run(
        JSON.stringify(result.tags),
        result.topScore,
        result.tags[0]?.id || null,
        job.id
      );
      if (result.filtered === 'tech' || result.filtered === 'seniority') filtered++;
      else if (result.filtered === 'no_match') noMatch++;
      else classified++;
    }
  });

  runAll(jobs);

  const stats = { classified, filtered, noMatch, total: jobs.length };
  logger.info(
    `🧠 Role Intelligence (new): classified=${classified} filtered=${filtered} total=${jobs.length}`
  );
  return stats;
}

// ── Seed DB from JSON ──────────────────────────────────────────────
/**
 * One-time seed: write the bundled roleRepository.json into role_definitions table.
 * Uses INSERT OR IGNORE so running it twice is safe.
 */
function seedRolesToDb() {
  const db      = getDb();
  const jsonPath = path.join(__dirname, '../data/roleRepository.json');
  const raw     = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const upsert = db.prepare(`
    INSERT OR IGNORE INTO role_definitions
      (id, name, color, titles, keywords, responsibilities, signals,
       exclude_keywords, seniority_reject, is_technical, threshold)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction((roles) => {
    for (const role of roles) {
      upsert.run(
        role.id,
        role.name,
        role.color || 'blue',
        JSON.stringify(role.titles          || []),
        JSON.stringify(role.keywords        || []),
        JSON.stringify(role.responsibilities || []),
        JSON.stringify(role.signals         || []),
        JSON.stringify(role.excludeKeywords || []),
        JSON.stringify(role.seniorityReject || []),
        role.isTechnical ? 1 : 0,
        role.threshold   || 20
      );
    }
  });

  insertAll(raw.roles);
  logger.info(`🧠 Role definitions seeded: ${raw.roles.length} roles from JSON`);
  invalidateCache();
}

module.exports = {
  classifyJob,
  classifyAllJobs,
  classifyNewJobs,
  loadRoles,
  invalidateCache,
  seedRolesToDb,
  normalizeText,
};
