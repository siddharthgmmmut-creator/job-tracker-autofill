/**
 * IIMjobs.com Scraper — Fixed for new React/MUI site structure
 *
 * IIMjobs now uses:
 * - Category listing pages: /c/sales-marketing-jobs
 * - City-filtered pages: /sales-marketing-jobs-in-mumbai
 * - Job detail URLs: /j/[title-slug]-[numeric-id]
 * Old /k/ and .jobTuple selectors no longer work.
 */
const puppeteer = require('puppeteer');
const { SCRAPER_CONFIG, LOCATION_PRIORITY } = require('../config/constants');
const config = require('../config/config');
const { logger } = require('../middleware/logger');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// IIMjobs category pages relevant to Siddharth's target roles
const CATEGORY_URLS = [
  { url: 'https://www.iimjobs.com/sales-marketing-jobs-in-mumbai',    location: 'Mumbai' },
  { url: 'https://www.iimjobs.com/consulting-general-mgmt-jobs-in-mumbai', location: 'Mumbai' },
  { url: 'https://www.iimjobs.com/sales-marketing-jobs-in-delhi-ncr',  location: 'Gurgaon' },
  { url: 'https://www.iimjobs.com/consulting-general-mgmt-jobs-in-delhi-ncr', location: 'Delhi' },
  { url: 'https://www.iimjobs.com/sales-marketing-jobs-in-bangalore',  location: 'Bangalore' },
  { url: 'https://www.iimjobs.com/sales-marketing-jobs-in-pune',       location: 'Pune' },
];

// Keywords to filter relevant jobs from the category listings
const RELEVANT_KEYWORDS = [
  'growth', 'gtm', 'go-to-market', 'strategy', 'chief of staff',
  'operations', 'business planning', 'revenue', 'product growth',
  "founder's office", 'market expansion', 'commercial'
];

async function scrapeIIMjobsCategory(browser, categoryUrl, location) {
  const page = await browser.newPage();
  const jobs = [];

  try {
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    logger.info(`IIMjobs: Fetching ${categoryUrl}`);

    await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(3000);

    const pageJobs = await page.evaluate((location, keywords) => {
      const results = [];

      // Find all job detail links: /j/[title]-[numeric-id]
      const jobLinks = [...document.querySelectorAll('a[href]')]
        .filter(a => {
          const href = a.href || '';
          // Must be a job detail page: /j/some-title-123456
          return href.match(/iimjobs\.com\/j\/[a-z0-9-]+-\d{5,}/);
        });

      const seen = new Set();
      jobLinks.forEach(a => {
        try {
          const href = a.href.split('?')[0]; // Remove tracking params
          if (seen.has(href)) return;
          seen.add(href);

          // Extract title from URL slug (most reliable — slug IS the title)
          // e.g. /j/senior-growth-manager-acme-corp-1234567 → "Senior Growth Manager Acme Corp"
          const slugMatch = href.match(/\/j\/(.+)-\d{5,}$/);
          if (!slugMatch) return;
          const title = slugMatch[1]
            .replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase())
            .trim();

          if (!title || title.length < 5) return;

          // Filter: title must contain at least one relevant keyword
          const titleLower = title.toLowerCase();
          if (!keywords.some(k => titleLower.includes(k))) return;

          // Company: try to get from card — look for the second distinct text block
          const card = a.closest('[class*="MuiCard"], [class*="MuiPaper"]');
          const textNodes = card
            ? [...card.querySelectorAll('[class*="MuiTypography"]')]
                .map(el => el.textContent?.trim())
                .filter(t => t && t.length > 2 && t.length < 100 && !t.match(/^\d|Posted|Review|yrs|Lacs/))
            : [];
          // textNodes[0] is usually the job title, textNodes[1] is company
          const company = textNodes[1] || textNodes[0] || 'See IIMjobs';

          results.push({
            title,
            company: company.slice(0, 80),
            location,
            job_url: href,
          });
        } catch {}
      });

      return results;
    }, location, RELEVANT_KEYWORDS);

    for (const job of pageJobs) {
      jobs.push({
        ...job,
        platform: 'iimjobs',
        posted_date: new Date().toISOString(),
        description: '',
        salary_mentioned: 0,
        salary_range: '',
        requirements: '',
        location_priority: LOCATION_PRIORITY[job.location] || 99,
      });
    }

    logger.info(`IIMjobs: ${jobs.length} relevant jobs from ${categoryUrl}`);
  } catch (err) {
    logger.error(`IIMjobs error for ${categoryUrl}: ${err.message}`);
  } finally {
    await page.close();
  }

  return jobs;
}

async function scrapeIIMjobs(keywords, locations) {
  const allJobs = [];
  const seen = new Set();
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    for (const cat of CATEGORY_URLS) {
      try {
        const jobs = await scrapeIIMjobsCategory(browser, cat.url, cat.location);
        for (const job of jobs) {
          const key = job.job_url;
          if (!seen.has(key)) { seen.add(key); allJobs.push(job); }
        }
        await sleep(2000);
      } catch (err) {
        logger.error(`IIMjobs category error: ${err.message}`);
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  logger.info(`IIMjobs total: ${allJobs.length} unique relevant jobs`);
  return allJobs;
}

module.exports = { scrapeIIMjobs };
