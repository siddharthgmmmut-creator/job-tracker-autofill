/**
 * LinkedIn Jobs Scraper
 *
 * LinkedIn heavily rate-limits scraping. This module supports two modes:
 * 1. Cookie-based (preferred): Uses your LinkedIn session cookie (li_at)
 * 2. Public API: Limited data, no auth needed but rate limited
 *
 * Setup: Add your LINKEDIN_SESSION_COOKIE to .env file
 * Get it from: Chrome DevTools > Application > Cookies > linkedin.com > li_at
 */
const axios = require('axios');
const { SCRAPER_CONFIG, LOCATION_PRIORITY } = require('../config/constants');
const config = require('../config/config');
const { logger } = require('../middleware/logger');

const LI_JOBS_SEARCH = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
const LI_JOBS_PUBLIC = 'https://www.linkedin.com/jobs/search';

// ── Session cookie ────────────────────────────────────────────────────
// Hardcoded li_at cookie for authenticated LinkedIn scraping.
// Rotate this value when LinkedIn invalidates the session (typically every 30–90 days).
const LI_SESSION_COOKIE = 'AQEFAHQBAAAAABQuP7cAAAGVS9aA6wAAAZ4BmxA6TQAAF3VybjpsaTptZW1iZXI6NjI2NTAyNjk2QEtwaeI0qDHS8xtst0LMyDgEJC9mzXk5ZSoOXk9V3EC5nYtfZi9ClEuiEURbpaOOVNwlwpLemAyCwFsryzW1rBLMOeKl1PL1pvsOczBTVIvqvhv85vUM9rJR5Ltj1zyIZvk_LLOM_KuJ74Rbops76NkeDfA591_YGgANquQ9kDRy6YII-l7Au5D78IaCy4krMiOu5w';

// Location GEO IDs for LinkedIn (India cities)
const LOCATION_GEO_IDS = {
  'Mumbai': '105214831',
  'Pune': '106680682',
  'Delhi': '102713980',
  'Noida': '106681637',
  'Gurgaon': '106781576',
  'Gurugram': '106781576',
  'Bangalore': '105214831',
  'Bengaluru': '106781576',
  'Hyderabad': '105556691',
  'Lucknow': '108073813',
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildHeaders() {
  // Prefer env var so the cookie can be rotated without a code change;
  // fall back to the hardcoded value when the env var is blank.
  const cookie = config.user.linkedinCookie || LI_SESSION_COOKIE;
  return {
    'User-Agent':      config.scraper.userAgent,
    'Accept':          'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cookie':          `li_at=${cookie}`,
    'csrf-token':      'ajax:0',
  };
}

/**
 * Generates a LinkedIn job search URL (for browser/manual use)
 */
function generateLinkedInSearchUrl(keyword, location) {
  const params = new URLSearchParams({
    keywords: keyword,
    location: `${location}, India`,
    f_TPR: 'r2592000', // Last 30 days
    f_JT: 'F',          // Full-time
    sortBy: 'DD',        // Date posted
  });
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

/**
 * Scrape LinkedIn jobs using the hardcoded (or env-overridden) li_at session cookie.
 * Always runs — no skip logic.
 */
async function scrapeLinkedIn(keywords, locations) {
  const allJobs = [];
  const seen = new Set();

  logger.info(`LinkedIn: starting with cookie …${LI_SESSION_COOKIE.slice(-8)}`);

  // Cookie-based scraping
  for (const keyword of keywords) {
    for (const location of locations.slice(0, 3)) { // Limit locations to avoid rate limiting
      logger.info(`LinkedIn: Searching "${keyword}" in ${location}`);
      try {
        await sleep(SCRAPER_CONFIG.REQUEST_DELAY_MS * 2); // Longer delay for LinkedIn

        const start = 0;
        const params = {
          keywords: keyword,
          location: `${location}, India`,
          f_TPR: 'r2592000',
          start,
          count: 25,
        };

        const response = await axios.get(LI_JOBS_SEARCH, {
          params,
          headers: buildHeaders(),
          timeout: SCRAPER_CONFIG.TIMEOUT_MS,
        });

        const jobs = parseLinkedInResponse(response.data, location);
        for (const job of jobs) {
          if (!job.job_url || seen.has(job.job_url)) continue;
          seen.add(job.job_url);
          allJobs.push(job);
        }

        logger.info(`LinkedIn: ${jobs.length} jobs found for "${keyword}" in ${location}`);
      } catch (err) {
        if (err.response?.status === 429) {
          logger.warn('LinkedIn: Rate limited. Waiting 60 seconds...');
          await sleep(60000);
        } else {
          logger.error(`LinkedIn scrape error: ${err.message}`);
        }
      }
    }
  }

  return allJobs;
}

function parseLinkedInResponse(html, location) {
  // LinkedIn search API returns HTML fragments.
  // Strategy: find each job by entity URN, then slice its card block and
  // extract title + company via CSS class name patterns.
  const jobs = [];
  const seenIds = new Set();

  const urnRegex = /data-entity-urn="urn:li:jobPosting:(\d+)"/g;
  let match;

  while ((match = urnRegex.exec(html)) !== null) {
    const jobId = match[1];
    if (seenIds.has(jobId)) continue;
    seenIds.add(jobId);

    const job_url = `https://www.linkedin.com/jobs/view/${jobId}/`;

    // Slice ~2 000 chars — enough for one card, not so much that we bleed into the next
    const block = html.slice(match.index, Math.min(match.index + 2000, html.length));

    // Title: look for the base-search-card__title class (primary), or hidden-nested-link (fallback)
    const titleMatch =
      block.match(/class="[^"]*base-search-card__title[^"]*"[^>]*>\s*([^<]{3,120})/) ||
      block.match(/class="[^"]*hidden-nested-link[^"]*"[^>]*>\s*([^<]{3,120})/);
    const title = titleMatch ? titleMatch[1].trim() : '';
    if (!title) continue; // no recognisable title → skip rather than insert noise

    // Company: look for base-search-card__subtitle, get the text inside its <a> child
    const companyMatch = block.match(
      /class="[^"]*base-search-card__subtitle[^"]*"[\s\S]{0,300}?>\s*([^<]{2,80})\s*<\/a>/
    );
    const company = (companyMatch ? companyMatch[1].trim() : '') || 'Company Not Disclosed';

    jobs.push({
      external_id: jobId,
      title,
      company,
      location,
      job_url,
      platform: 'linkedin',
      posted_date: new Date().toISOString(),
      description: '',
      salary_mentioned: false,
      salary_range: '',
      requirements: '',
      location_priority: LOCATION_PRIORITY[location] || 99,
    });
  }

  return jobs;
}

module.exports = { scrapeLinkedIn, generateLinkedInSearchUrl };
