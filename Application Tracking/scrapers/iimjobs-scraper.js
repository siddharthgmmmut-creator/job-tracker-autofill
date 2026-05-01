/**
 * IIMjobs.com Scraper — two-pass: listing → detail page JD
 *
 * Pass 1: Collect job URLs from listing pages (React/MUI structure)
 * Pass 2: Open each job detail page and extract the full JD text
 */

const puppeteer = require('puppeteer');
const { SCRAPER_CONFIG, LOCATION_PRIORITY } = require('../config/constants');
const config = require('../config/config');
const { logger } = require('../middleware/logger');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class Semaphore {
  constructor(limit) { this.limit = limit; this.active = 0; this.queue = []; }
  acquire() {
    return new Promise(resolve => {
      if (this.active < this.limit) { this.active++; resolve(); }
      else { this.queue.push(resolve); }
    });
  }
  release() {
    if (this.queue.length) { this.queue.shift()(); }
    else { this.active--; }
  }
}

const IIMJOBS_CONCURRENCY        = SCRAPER_CONFIG.IIMJOBS_CONCURRENCY || 4;
const IIMJOBS_DETAIL_CONCURRENCY = 2;   // conservative — IIMjobs is rate-sensitive
const IIMJOBS_DETAIL_LIMIT       = 100; // max detail pages per run

const IIMJOBS_SEARCH_KEYWORDS = [
  'growth manager', 'gtm manager', 'chief of staff', 'ceo office',
  'operations manager', 'business operations', 'strategy manager',
  'growth marketing', "founder's office", 'program manager',
  'revenue operations', 'product strategy', 'strategy analyst',
];

const IIMJOBS_CITIES = [
  { slug: 'mumbai',    location: 'Mumbai'    },
  { slug: 'delhi-ncr', location: 'Gurgaon'  },
  { slug: 'pune',      location: 'Pune'      },
  { slug: 'bangalore', location: 'Bangalore' },
  { slug: 'hyderabad', location: 'Hyderabad' },
  { slug: 'chennai',   location: 'Chennai'   },
];

const IIMJOBS_PAGES_PER_SEARCH = 2;

const RELEVANT_KEYWORDS = [
  'growth', 'gtm', 'go-to-market', 'strategy', 'chief of staff',
  'ceo', 'operations', 'business planning', "founder's office",
  'growth marketing', 'program manager', 'revenue operations',
  'product strategy',
];

function buildSearchUrls() {
  const entries = [];
  for (const kw of IIMJOBS_SEARCH_KEYWORDS) {
    const kwSlug = kw.replace(/\s+/g, '-').replace(/'/g, '');
    for (const city of IIMJOBS_CITIES) {
      const baseUrl = `https://www.iimjobs.com/${kwSlug}-jobs-in-${city.slug}`;
      for (let page = 1; page <= IIMJOBS_PAGES_PER_SEARCH; page++) {
        entries.push({
          url: page === 1 ? baseUrl : `${baseUrl}?page=${page}`,
          location: city.location,
        });
      }
    }
  }
  return entries;
}

// ── Pass 1: collect job URLs from listing page ────────────────────
async function scrapeIIMjobsListing(browser, categoryUrl, location) {
  const page = await browser.newPage();
  const jobs = [];

  try {
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    logger.info(`IIMjobs listing: ${categoryUrl}`);

    await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);

    const pageJobs = await page.evaluate((location, keywords) => {
      const COMPANY_ROLE_WORDS = [
        'manager', 'head', 'analyst', 'officer', 'director', 'lead',
        'associate', 'executive', 'specialist', 'engineer', 'consultant',
        'partner', 'intern', 'president', 'founder', 'recruiter',
        'developer', 'strategist', 'advisor', 'vice president',
      ];

      const jobLinks = [...document.querySelectorAll('a[href]')]
        .filter(a => /iimjobs\.com\/j\/[a-z0-9-]+-\d{5,}/.test(a.href || ''));

      const seen = new Set();
      const results = [];

      jobLinks.forEach(a => {
        try {
          const href = a.href.split('?')[0];
          if (seen.has(href)) return;
          seen.add(href);

          const card = a.closest('[class*="MuiCard"], [class*="MuiPaper"]');
          if (!card) return;

          const textNodes = [...card.querySelectorAll('[class*="MuiTypography"]')]
            .map(el => el.textContent?.trim())
            .filter(t => t && t.length > 2 && t.length < 120 && !t.match(/^\d|Posted|Review|yrs|Lacs|Apply|Save|Shortlist/i));

          if (textNodes.length === 0) return;

          const title = textNodes[0];
          if (!title || title.length < 5) return;

          const titleLower = title.toLowerCase();
          if (!keywords.some(k => titleLower.includes(k))) return;

          const rawCompany = (textNodes[1] || '').trim();
          if (rawCompany) {
            const rawLower = rawCompany.toLowerCase();
            if (COMPANY_ROLE_WORDS.some(w => rawLower.includes(w))) return;
          }

          results.push({
            title,
            company: (rawCompany || 'Company Not Disclosed').slice(0, 80),
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
        description: '',        // filled in Pass 2
        salary_mentioned: 0,
        salary_range: '',
        requirements: '',
        location_priority: LOCATION_PRIORITY[job.location] || 99,
      });
    }

    logger.info(`IIMjobs listing: ${jobs.length} jobs from ${categoryUrl}`);
  } catch (err) {
    logger.error(`IIMjobs listing error [${categoryUrl}]: ${err.message}`);
  } finally {
    await page.close();
  }

  return jobs;
}

// ── Pass 2: fetch full JD from detail page ────────────────────────
async function fetchIIMjobsDetail(browser, jobUrl) {
  const page = await browser.newPage();
  try {
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });

    // Wait for main content to render
    await page.waitForSelector('[class*="MuiTypography"], [class*="MuiContainer"]', { timeout: 8000 }).catch(() => {});
    await sleep(2000); // give React time to render the JD section

    const detail = await page.evaluate(() => {
      // Strategy: collect leaf-level MuiTypography elements (no nested Typography children)
      // This avoids duplicate text from parent containers.
      const leaves = [...document.querySelectorAll('[class*="MuiTypography"]')]
        .filter(el => !el.querySelector('[class*="MuiTypography"]')) // leaf nodes only
        .map(el => (el.innerText || el.textContent || '').trim())
        .filter(t => t.length > 10);

      // Skip lines that are clearly metadata (short, contain numbers/units)
      const metaPatterns = /^(Apply|Save|Share|Posted|Salary|Experience|Location|Job Type|Skills|Company|Views|Applicants|\d+\s*(yrs?|Lacs?|LPA|years?))/i;

      // Split into metadata block (first ~5 items) and JD body (rest)
      // The JD content lines are usually longer (>40 chars)
      const bodyLines = leaves.filter((t, i) => {
        if (i < 3) return false; // skip title, company, location header
        if (metaPatterns.test(t)) return false;
        return t.length > 20;
      });

      const description = bodyLines.join('\n\n').trim();

      // Salary: short text containing Lacs/LPA
      const salary = leaves.find(t => /lacs?|lpa|₹|\d+\s*-\s*\d+/i.test(t) && t.length < 80) || '';

      // Requirements: text with years of experience
      const requirements = leaves.find(t => /(\d+)\s*(yrs?|years?)/i.test(t) && t.length < 80) || '';

      return { description, salary, requirements };
    });

    return detail;
  } catch (err) {
    logger.debug(`IIMjobs detail failed [${jobUrl.slice(-40)}]: ${err.message}`);
    return { description: '', salary: '', requirements: '' };
  } finally {
    await page.close();
  }
}

// ── Main export ───────────────────────────────────────────────────
async function scrapeIIMjobs(keywords, locations) {
  const allJobs = [];
  const seen    = new Set();
  let   browser;

  const searchUrls = buildSearchUrls();
  logger.info(`IIMjobs: ${searchUrls.length} URLs | concurrency=${IIMJOBS_CONCURRENCY}`);

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    // ── Pass 1: listing pages ──────────────────────────────────
    const listSem = new Semaphore(IIMJOBS_CONCURRENCY);

    await Promise.all(searchUrls.map(async ({ url, location }) => {
      await listSem.acquire();
      try {
        const jobs = await scrapeIIMjobsListing(browser, url, location);
        for (const job of jobs) {
          if (!seen.has(job.job_url)) { seen.add(job.job_url); allJobs.push(job); }
        }
      } catch (err) {
        logger.error(`IIMjobs listing error [${url}]: ${err.message}`);
      } finally {
        listSem.release();
      }
    }));

    logger.info(`IIMjobs Pass 1 complete: ${allJobs.length} unique jobs`);

    // ── Pass 2: detail pages for full JD ──────────────────────
    const toEnrich = allJobs.slice(0, IIMJOBS_DETAIL_LIMIT);
    logger.info(`IIMjobs Pass 2: fetching JD for ${toEnrich.length} jobs (concurrency=${IIMJOBS_DETAIL_CONCURRENCY})`);

    const detailSem = new Semaphore(IIMJOBS_DETAIL_CONCURRENCY);
    let enriched = 0;

    await Promise.all(toEnrich.map(async (job) => {
      await detailSem.acquire();
      try {
        await sleep(800);
        const detail = await fetchIIMjobsDetail(browser, job.job_url);
        if (detail.description.length > 100) {
          job.description = detail.description;
          enriched++;
        }
        if (detail.salary && detail.salary.length > 2) {
          job.salary_range = detail.salary;
          job.salary_mentioned = 1;
        }
        if (detail.requirements && detail.requirements.length > 2) {
          job.requirements = detail.requirements;
        }
      } finally {
        detailSem.release();
      }
    }));

    // ── Description quality stats ──────────────────────────────
    const lengths = allJobs.map(j => j.description.length);
    const avgLen  = lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 0;
    const full    = lengths.filter(l => l > 500).length;
    const partial = lengths.filter(l => l > 100 && l <= 500).length;
    const empty   = lengths.filter(l => l <= 100).length;
    logger.info(`📏 IIMjobs JD quality: avg=${avgLen} chars | full(>500)=${full} | partial=${partial} | short/empty=${empty} | enriched=${enriched}/${toEnrich.length}`);

  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  logger.info(`IIMjobs total: ${allJobs.length} unique relevant jobs`);
  return allJobs;
}

module.exports = { scrapeIIMjobs };
