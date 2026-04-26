/**
 * Naukri.com Scraper — Puppeteer-based (handles anti-bot measures)
 */
const puppeteer = require('puppeteer');
const { SCRAPER_CONFIG, LOCATION_PRIORITY } = require('../config/constants');
const config = require('../config/config');
const { logger } = require('../middleware/logger');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getBrowser() {
  return puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', '--disable-gpu',
      '--window-size=1280,800',
    ],
  });
}

/**
 * Search Naukri for a keyword+location combo using Puppeteer
 */
async function searchNaukriPuppeteer(browser, keyword, location) {
  const page = await browser.newPage();
  const jobs = [];

  try {
    await page.setUserAgent(config.scraper.userAgent);
    await page.setViewport({ width: 1280, height: 800 });

    // Build URL: naukri search URL format
    const slug = `${keyword.replace(/\s+/g, '-')}-jobs-in-${location.replace(/\s+/g, '-')}`;
    const url = `https://www.naukri.com/${slug}?k=${encodeURIComponent(keyword)}&l=${encodeURIComponent(location)}&nojdl=1&jobAge=${SCRAPER_CONFIG.MAX_AGE_DAYS}`;

    logger.info(`Naukri: Fetching ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for job cards to load
    await page.waitForSelector('.srp-jobtuple-wrapper, article.jobTuple, .cust-job-tuple', {
      timeout: 10000,
    }).catch(() => {});

    await sleep(2000); // Let JS settle

    // Extract jobs from page
    const pageJobs = await page.evaluate((maxAge, locPriority, location, keyword) => {
      const results = [];
      const jobCards = document.querySelectorAll(
        '.srp-jobtuple-wrapper, article.jobTuple, [class*="jobTuple"], .cust-job-tuple'
      );

      jobCards.forEach(card => {
        try {
          // Try multiple title selectors
          let titleEl = card.querySelector('a.title, a[class*="title"], h2 a, .jobTitle a');
          // Fallback: any anchor pointing to a job-listings URL
          if (!titleEl || !titleEl.href) {
            const allAnchors = card.querySelectorAll('a[href*="job-listings"]');
            if (allAnchors.length) titleEl = allAnchors[0];
          }
          const companyEl = card.querySelector('a.comp-name, [class*="comp-name"], .companyInfo a');
          const locationEl = card.querySelector('.loc, [class*="location"], span[class*="locWdth"]');
          const salaryEl = card.querySelector('.salary, [class*="salary"], span[class*="sal"]');
          const postedEl = card.querySelector('.job-post-day, [class*="post-day"], span[class*="date"]');
          const expEl = card.querySelector('.exp, [class*="experience"]');
          const descEl = card.querySelector('[class*="job-desc"], .job-description');

          const title = titleEl?.textContent?.trim() || '';
          const company = companyEl?.textContent?.trim() || '';
          const href = titleEl?.href || '';

          if (!title || !company) return;
          // CRITICAL: Skip jobs without a real Naukri job-listings URL
          if (!href || !href.includes('job-listings')) return;
          const cleanUrl = href.split('?')[0];

          // Relevance filter: title must contain at least one keyword token
          const kwTokens = keyword.toLowerCase().split(/\s+/).filter(w => w.length > 2);
          const titleLower = title.toLowerCase();
          const matchesKeyword = kwTokens.some(t => titleLower.includes(t));
          if (!matchesKeyword) return;

          // Parse posted date
          const postedText = postedEl?.textContent?.trim() || '';
          let daysOld = 0;
          const daysMatch = postedText.match(/(\d+)\s*day/i);
          const weekMatch = postedText.match(/(\d+)\s*week/i);
          const monthMatch = postedText.match(/(\d+)\s*month/i);
          if (daysMatch) daysOld = parseInt(daysMatch[1]);
          else if (weekMatch) daysOld = parseInt(weekMatch[1]) * 7;
          else if (monthMatch) daysOld = parseInt(monthMatch[1]) * 30;

          if (daysOld > maxAge) return;

          const postedDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
          const loc = locationEl?.textContent?.trim()?.split(',')[0]?.trim() || location;

          results.push({
            title,
            company,
            location: loc,
            job_url: cleanUrl,
            platform: 'naukri',
            posted_date: postedDate,
            description: descEl?.textContent?.trim()?.slice(0, 600) || '',
            salary_mentioned: !!salaryEl?.textContent?.trim(),
            salary_range: salaryEl?.textContent?.trim() || '',
            requirements: expEl?.textContent?.trim() || '',
          });
        } catch {}
      });

      return results;
    }, SCRAPER_CONFIG.MAX_AGE_DAYS, LOCATION_PRIORITY, location, keyword);

    // Add location priority
    for (const job of pageJobs) {
      job.location_priority = LOCATION_PRIORITY[job.location] || LOCATION_PRIORITY[location] || 99;
      jobs.push(job);
    }

    logger.info(`Naukri: ${pageJobs.length} jobs from "${keyword}" in ${location}`);
  } catch (err) {
    logger.error(`Naukri page error for "${keyword}" in ${location}: ${err.message}`);
  } finally {
    await page.close();
  }

  return jobs;
}

async function scrapeNaukri(keywords, locations) {
  const allJobs = [];
  const seen = new Set();
  let browser;

  try {
    browser = await getBrowser();
    logger.info('Naukri: Browser launched');

    for (const keyword of keywords.slice(0, 4)) {       // Max 4 keywords
      for (const location of locations.slice(0, 4)) {   // Max 4 locations
        try {
          const jobs = await searchNaukriPuppeteer(browser, keyword, location);
          for (const job of jobs) {
            const key = job.job_url || `${job.title}|${job.company}|${job.location}`;
            if (!seen.has(key)) {
              seen.add(key);
              allJobs.push(job);
            }
          }
          await sleep(2500);
        } catch (err) {
          logger.error(`Naukri search error: ${err.message}`);
        }
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  logger.info(`Naukri total: ${allJobs.length} unique jobs`);
  return allJobs;
}

module.exports = { scrapeNaukri };
