/**
 * Referral Finder Service
 *
 * Finds potential referrals for a given company using LinkedIn search URL generation.
 * Priority order:
 * 1. IIM Lucknow alumni at company (priority 5)
 * 2. Darwinbox colleagues at company (priority 5)
 * 3. MMMUT alumni at company (priority 4)
 * 4. Prime Focus colleagues (priority 4)
 * 5. St Joseph's alumni (priority 3)
 * 6. GSK colleagues (priority 3)
 * 7. Role-relevant people (priority 2)
 * 8. Senior employees (priority 1)
 */
const { getDb } = require('../database/db');
const { CONNECTION_TYPES, ALUMNI_NETWORKS, PREVIOUS_COMPANIES } = require('../config/constants');
const { logger } = require('../middleware/logger');

/**
 * Generate LinkedIn search URLs for finding referrals at a company
 */
function generateReferralSearchUrls(company, jobTitle = '') {
  const companyEncoded = encodeURIComponent(company);
  const titleKeywords = extractRoleKeywords(jobTitle);

  return [
    {
      label: `IIM Lucknow + ${company}`,
      url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`"IIM Lucknow" "${company}"`)}&origin=GLOBAL_SEARCH_HEADER`,
      connection_type: 'alumni_iim',
      priority: 5,
      instruction: 'Search for IIM Lucknow alumni working at ' + company,
    },
    {
      label: `Darwinbox alumni at ${company}`,
      url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`"Darwinbox" "${company}"`)}&origin=GLOBAL_SEARCH_HEADER`,
      connection_type: 'darwinbox',
      priority: 5,
      instruction: 'Search for ex-Darwinbox people now at ' + company,
    },
    {
      label: `MMMUT + ${company}`,
      url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`"MMMUT" "${company}"`)}&origin=GLOBAL_SEARCH_HEADER`,
      connection_type: 'alumni_mmmut',
      priority: 4,
      instruction: 'Search for MMMUT alumni working at ' + company,
    },
    {
      label: `Prime Focus + ${company}`,
      url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`"Prime Focus" "${company}"`)}&origin=GLOBAL_SEARCH_HEADER`,
      connection_type: 'prime_focus',
      priority: 4,
      instruction: 'Search for ex-Prime Focus people now at ' + company,
    },
    {
      label: `GSK + ${company}`,
      url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`"GSK" "${company}"`)}&origin=GLOBAL_SEARCH_HEADER`,
      connection_type: 'gsk',
      priority: 3,
      instruction: 'Search for ex-GSK people now at ' + company,
    },
    {
      label: `GTM/Ops at ${company}`,
      url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`"${company}" "GTM" OR "Operations" OR "Growth" OR "Chief of Staff"`)}&origin=GLOBAL_SEARCH_HEADER`,
      connection_type: 'role_relevant',
      priority: 2,
      instruction: 'Find GTM/Ops/Growth people at ' + company,
    },
    {
      label: `HR/Recruiter at ${company}`,
      url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`"${company}" "HR" OR "Recruiter" OR "Talent Acquisition" OR "Human Resources"`)}&origin=GLOBAL_SEARCH_HEADER`,
      connection_type: 'role_relevant',
      priority: 2,
      instruction: 'Find HR/Recruiters at ' + company + ' to reach out directly',
    },
    {
      label: `All employees at ${company}`,
      url: `https://www.linkedin.com/company/${encodeURIComponent(company.toLowerCase().replace(/\s+/g, '-'))}/people/`,
      connection_type: 'general',
      priority: 1,
      instruction: 'Browse all employees at ' + company,
    },
  ];
}

function extractRoleKeywords(jobTitle) {
  const keywords = [];
  const lower = (jobTitle || '').toLowerCase();
  if (lower.includes('growth')) keywords.push('Growth');
  if (lower.includes('gtm') || lower.includes('go-to-market')) keywords.push('GTM');
  if (lower.includes('operations') || lower.includes('ops')) keywords.push('Operations');
  if (lower.includes('chief of staff')) keywords.push('Chief of Staff');
  return keywords;
}

/**
 * Generate a personalized referral message
 */
function generateReferralMessage(referral, job) {
  const firstName = referral.person_name?.split(' ')[0] || 'there';
  const connectionContext = getConnectionContext(referral.connection_type);

  const message = `Hi ${firstName},

I'm Siddharth, an MBA from IIM Lucknow (2021) with 5 years of experience in GTM, Business Planning, and Operations. ${connectionContext}

I noticed you're at ${job.company} and came across a ${job.title} opening there. I've worked at Darwinbox (GTM/Business Planning), Prime Focus Technologies (Enterprise Account Management - APAC), and GSK Pharmaceuticals.

I'd really appreciate it if you could refer me or share any insights about the team. Happy to share my CV and have a quick call if that works.

Thank you!
Siddharth
siddharthgmmmut@gmail.com | +91-8765627606`;

  return message;
}

function getConnectionContext(connectionType) {
  const contexts = {
    alumni_iim: "I noticed you're also from IIM Lucknow — great to connect with a fellow alum!",
    alumni_mmmut: "I noticed you're also from MMMUT Gorakhpur — great to connect with a fellow alum!",
    alumni_sjc: "I noticed you're also from St Joseph's Allahabad — great to connect with a fellow alum!",
    darwinbox: "I came across your profile — looks like we both have Darwinbox in common!",
    prime_focus: "Looks like we both have Prime Focus Technologies in common!",
    gsk: "Looks like we both have GSK Pharmaceuticals in common!",
    role_relevant: "I came across your profile given your experience in a similar domain.",
    general: "I came across your profile while researching opportunities at " + "your company.",
  };
  return contexts[connectionType] || contexts.general;
}

/**
 * Score a potential referral based on connection type and priority
 */
function scoreReferral(connectionType, additionalFactors = {}) {
  const baseScore = Object.values(CONNECTION_TYPES).find(c => c.type === connectionType)?.priority || 1;
  let score = baseScore;

  if (additionalFactors.verified) score += 0.5;
  if (additionalFactors.sameCity) score += 0.3;
  if (additionalFactors.seniorRole) score += 0.2;

  return Math.min(5, Math.round(score * 10) / 10);
}

/**
 * Find existing referrals for a job from the database
 */
function getReferralsForJob(jobId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM referrals
    WHERE job_id = ?
    ORDER BY priority_score DESC, contacted ASC
  `).all(jobId);
}

/**
 * Save auto-generated referral search hints as placeholder referrals
 * (user will fill in actual person details)
 */
function savePlaceholderReferrals(jobId, company, jobTitle) {
  const db = getDb();
  const searchUrls = generateReferralSearchUrls(company, jobTitle);

  const existing = db.prepare('SELECT COUNT(*) as c FROM referrals WHERE job_id = ?').get(jobId);
  if (existing.c > 0) return; // Already has referrals

  const insert = db.prepare(`
    INSERT INTO referrals (job_id, person_name, linkedin_url, connection_type, priority_score, notes, extraction_method)
    VALUES (?, ?, ?, ?, ?, ?, 'auto_search')
  `);

  const insertAll = db.transaction(() => {
    for (const search of searchUrls.slice(0, 5)) {
      insert.run(
        jobId,
        `[Search: ${search.label}]`,
        search.url,
        search.connection_type,
        search.priority,
        search.instruction
      );
    }
  });

  insertAll();

  db.prepare("UPDATE jobs SET referrals_found = 1 WHERE id = ?").run(jobId);
  logger.info(`Placeholder referrals created for job ${jobId} at ${company}`);
}

module.exports = {
  generateReferralSearchUrls,
  generateReferralMessage,
  scoreReferral,
  getReferralsForJob,
  savePlaceholderReferrals,
};
