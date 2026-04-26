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
  const headers = {
    'User-Agent': config.scraper.userAgent,
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  if (config.user.linkedinCookie) {
    headers['Cookie'] = `li_at=${config.user.linkedinCookie}`;
    headers['csrf-token'] = 'ajax:0';
  }

  return headers;
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
 * Scrape LinkedIn jobs (requires session cookie for full access)
 */
async function scrapeLinkedIn(keywords, locations) {
  const allJobs = [];
  const seen = new Set();

  if (!config.user.linkedinCookie) {
    logger.warn('LinkedIn: No session cookie configured. Generating search URLs only.');
    // Return search URL hints for each keyword+location combo
    for (const keyword of keywords) {
      for (const location of locations) {
        allJobs.push({
          title: `[LinkedIn Search] ${keyword} in ${location}`,
          company: 'LinkedIn',
          location: location,
          job_url: generateLinkedInSearchUrl(keyword, location),
          platform: 'linkedin',
          posted_date: new Date().toISOString(),
          description: `Click to search LinkedIn for: "${keyword}" jobs in ${location}`,
          salary_mentioned: false,
          salary_range: '',
          requirements: '',
          location_priority: LOCATION_PRIORITY[location] || 99,
          is_search_url: true,
        });
      }
    }
    return allJobs;
  }

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
  // LinkedIn returns HTML; parse with basic regex (cheerio would be better for production)
  const jobs = [];
  const jobMatches = html.matchAll(/data-entity-urn="urn:li:jobPosting:(\d+)"/g);

  for (const match of jobMatches) {
    const jobId = match[1];
    const job_url = `https://www.linkedin.com/jobs/view/${jobId}/`;

    // Extract title (basic parsing)
    const titleMatch = html.match(new RegExp(`jobPosting:${jobId}[^>]*>[^<]*<[^>]*>[\\s]*([^<]+)<`));
    const title = titleMatch ? titleMatch[1].trim() : 'LinkedIn Job';

    if (!jobs.find(j => j.job_url === job_url)) {
      jobs.push({
        external_id: jobId,
        title,
        company: '',
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
  }

  return jobs;
}

module.exports = { scrapeLinkedIn, generateLinkedInSearchUrl };
