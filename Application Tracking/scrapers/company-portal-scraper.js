/**
 * Company Portal Scraper
 * Scrapes career pages of top Indian companies using:
 * - Lever API (JSON) for companies on Lever ATS
 * - Greenhouse JSON feed for companies on Greenhouse ATS
 * - Puppeteer for direct career pages
 */
const puppeteer = require('puppeteer');
const axios = require('axios');
const { LOCATION_PRIORITY } = require('../config/constants');
const { logger } = require('../middleware/logger');

// ── ATS-based scrapers (fast, no browser needed) ─────────────────────────────

/**
 * Lever ATS: returns all open jobs as JSON
 * URL pattern: https://api.lever.co/v0/postings/<company-slug>?mode=json
 */
async function scrapeLever(companySlug, companyName, targetKeywords) {
  const url = `https://api.lever.co/v0/postings/${companySlug}?mode=json`;
  const res = await axios.get(url, { timeout: 15000 });
  const posts = Array.isArray(res.data) ? res.data : [];

  const kw = targetKeywords.map(k => k.toLowerCase());
  return posts
    .filter(p => kw.some(k => p.text?.toLowerCase().includes(k) || p.categories?.team?.toLowerCase().includes(k)))
    .map(p => {
      const loc = p.categories?.location || '';
      return {
        title: p.text,
        company: companyName,
        location: loc,
        job_url: p.hostedUrl,
        platform: 'company_portal',
        posted_date: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
        description: p.descriptionPlain?.slice(0, 500) || '',
        salary_mentioned: 0,
        salary_range: '',
        requirements: '',
        location_priority: LOCATION_PRIORITY[loc] || 99,
      };
    });
}

/**
 * Greenhouse ATS: board token feed
 * URL pattern: https://boards-api.greenhouse.io/v1/boards/<token>/jobs
 */
async function scrapeGreenhouse(boardToken, companyName, targetKeywords) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`;
  const res = await axios.get(url, { timeout: 15000 });
  const jobs = res.data?.jobs || [];

  const kw = targetKeywords.map(k => k.toLowerCase());
  return jobs
    .filter(j => kw.some(k => j.title?.toLowerCase().includes(k) || j.departments?.[0]?.name?.toLowerCase().includes(k)))
    .map(j => {
      const loc = j.location?.name || '';
      return {
        title: j.title,
        company: companyName,
        location: loc,
        job_url: j.absolute_url,
        platform: 'company_portal',
        posted_date: j.updated_at || new Date().toISOString(),
        description: j.content ? j.content.replace(/<[^>]+>/g, '').slice(0, 500) : '',
        salary_mentioned: 0,
        salary_range: '',
        requirements: '',
        location_priority: LOCATION_PRIORITY[loc] || 99,
      };
    });
}

// ── Puppeteer-based portal scraper ────────────────────────────────────────────

const COMPANY_PORTALS = [
  // Lever ATS companies
  { type: 'lever', slug: 'razorpay', name: 'Razorpay' },
  { type: 'lever', slug: 'meesho', name: 'Meesho' },
  { type: 'lever', slug: 'browserstack', name: 'Browserstack' },
  { type: 'lever', slug: 'chargebee', name: 'Chargebee' },
  { type: 'lever', slug: 'darwinbox', name: 'Darwinbox' },

  // Greenhouse ATS companies
  { type: 'greenhouse', token: 'phonepe', name: 'PhonePe' },
  { type: 'greenhouse', token: 'swiggy', name: 'Swiggy' },

  // Direct Puppeteer scraping
  {
    type: 'puppeteer',
    name: 'CRED',
    url: 'https://careers.cred.club/',
    selectors: {
      container: '.job-listing, .position-listing, [class*="job"], [class*="position"], li',
      title: 'h3, h2, .title, [class*="title"]',
      location: '[class*="location"], .location',
    }
  },
  {
    type: 'puppeteer',
    name: 'Groww',
    url: 'https://groww.in/p/careers',
    selectors: {
      container: '.job-item, .position, [class*="job"], [class*="opening"]',
      title: 'h3, h2, .title',
      location: '.location, [class*="location"]',
    }
  },
  {
    type: 'puppeteer',
    name: 'Zepto',
    url: 'https://www.zeptonow.com/careers',
    selectors: {
      container: '[class*="job"], [class*="position"], [class*="opening"]',
      title: 'h3, h2, [class*="title"]',
      location: '[class*="location"]',
    }
  },
];

// Targeted keywords — kept tight to avoid pulling in sales/BD/PM noise
const TARGET_KEYWORDS = [
  'growth manager', 'growth marketing', 'gtm', 'go-to-market',
  'strategy', 'chief of staff', 'ceo office', "founder's office",
  'business planning', 'operations manager', 'business operations',
];

async function scrapePuppeteerPortal(portal, keywords) {
  let browser;
  const results = [];
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.goto(portal.url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    const kw = keywords.map(k => k.toLowerCase());
    const jobs = await page.evaluate((sel, kw, company) => {
      const containers = document.querySelectorAll(sel.container);
      const found = [];
      containers.forEach(el => {
        const titleEl = el.querySelector(sel.title);
        const locEl = el.querySelector(sel.location);
        const title = (titleEl?.textContent || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120);
        if (!title || title.length < 5) return;
        if (!kw.some(k => title.toLowerCase().includes(k))) return;
        const location = (locEl?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60) || 'India';
        const linkEl = el.closest('a') || el.querySelector('a');
        const href = linkEl?.href || '';
        found.push({ title, location, job_url: href, company });
      });
      return found;
    }, portal.selectors, kw, portal.name);

    jobs.forEach(j => {
      results.push({
        ...j,
        platform: 'company_portal',
        posted_date: new Date().toISOString(),
        description: '',
        salary_mentioned: 0,
        salary_range: '',
        requirements: '',
        location_priority: LOCATION_PRIORITY[j.location] || 90,
        job_url: j.job_url || portal.url,
      });
    });
  } catch (err) {
    logger.warn(`Company portal Puppeteer failed for ${portal.name}: ${err.message}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  return results;
}

/**
 * Main export: scrape all company portals.
 * Only Lever and Greenhouse (API-based, fast, reliable) are active.
 * Puppeteer portals are kept in COMPANY_PORTALS for future use but are SKIPPED.
 */
async function scrapeCompanyPortals(keywords = TARGET_KEYWORDS) {
  const allJobs = [];

  for (const portal of COMPANY_PORTALS) {
    // Puppeteer scraping disabled — browser-based portals cause timeouts
    if (portal.type === 'puppeteer') {
      logger.info(`  ⏭️  Skipping Puppeteer portal: ${portal.name}`);
      continue;
    }

    try {
      let jobs = [];
      if (portal.type === 'lever') {
        logger.info(`  → Lever: ${portal.name}`);
        jobs = await scrapeLever(portal.slug, portal.name, keywords);
      } else if (portal.type === 'greenhouse') {
        logger.info(`  → Greenhouse: ${portal.name}`);
        jobs = await scrapeGreenhouse(portal.token, portal.name, keywords);
      }
      logger.info(`    ${portal.name}: ${jobs.length} matching jobs`);
      allJobs.push(...jobs);
    } catch (err) {
      logger.warn(`Company portal failed [${portal.name}]: ${err.message}`);
    }

    // Small delay between portals to be respectful to their APIs
    await new Promise(r => setTimeout(r, 1500));
  }

  return allJobs;
}

module.exports = { scrapeCompanyPortals };
