/**
 * Naukri.com Scraper — two-pass: listing → detail page JD
 *
 * Pass 1: Collect job cards from search listing pages (fast, parallel)
 * Pass 2: Open each unique job detail page and extract the full JD text
 *
 * Detail page uses .dang-inner-html — Naukri's React JD container.
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

const PAGES_PER_SEARCH    = SCRAPER_CONFIG.NAUKRI_PAGES       || 10;
const CONCURRENCY         = SCRAPER_CONFIG.NAUKRI_CONCURRENCY || 5;
const FRESH_AGE_DAYS      = SCRAPER_CONFIG.MAX_AGE_DAYS       || 7;
const PAGE_DELAY_MS       = SCRAPER_CONFIG.REQUEST_DELAY_MS   || 800;
const DETAIL_CONCURRENCY  = 3;   // simultaneous detail page fetches
const DETAIL_LIMIT        = 200; // max detail pages per run

function getBrowser() {
  return puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', '--disable-gpu',
      '--window-size=1280,800',
    ],
  });
}

// ── Pass 1: listing page ──────────────────────────────────────────
async function fetchNaukriPage(browser, keyword, location, pageNum) {
  const page = await browser.newPage();
  const jobs = [];

  try {
    await page.setUserAgent(config.scraper.userAgent);
    await page.setViewport({ width: 1280, height: 800 });

    const slug  = `${keyword.replace(/\s+/g, '-')}-jobs-in-${location.replace(/\s+/g, '-')}`;
    const pageQ = pageNum > 1 ? `&pg=${pageNum}` : '';
    const url   = `https://www.naukri.com/${slug}?k=${encodeURIComponent(keyword)}&l=${encodeURIComponent(location)}&nojdl=1&jobAge=${FRESH_AGE_DAYS}${pageQ}`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const pageTitle = await page.title().catch(() => '');
    if (/access denied|captcha|blocked|sorry/i.test(pageTitle)) {
      logger.warn(`Naukri: bot-detected [${keyword} / ${location} p${pageNum}]`);
      return [];
    }

    await page.waitForSelector(
      '.srp-jobtuple-wrapper, article.jobTuple, .cust-job-tuple, [data-job-id]',
      { timeout: 8000 }
    ).catch(() => {});
    await sleep(1200);

    const extracted = await page.evaluate((maxAge, locFallback) => {
      const CARD_SELS = [
        '.srp-jobtuple-wrapper', 'article.jobTuple', '[class*="jobTuple"]',
        '.cust-job-tuple', 'li[class*="tuple"]', '[data-job-id]',
      ];
      let cards = [];
      for (const s of CARD_SELS) {
        const found = document.querySelectorAll(s);
        if (found.length > 2) { cards = [...found]; break; }
      }

      const results = [];
      cards.forEach(card => {
        try {
          let titleEl = null;
          for (const s of ['a.title', 'a[class*="title"]', 'h2 a', '.jobTitle a']) {
            const el = card.querySelector(s);
            if (el?.href?.includes('job-listings')) { titleEl = el; break; }
          }
          if (!titleEl) {
            const anchors = [...card.querySelectorAll('a[href*="job-listings"]')];
            if (anchors.length) titleEl = anchors[0];
          }
          if (!titleEl?.href) return;

          const jobTitle = (titleEl.textContent || '').trim();
          if (!jobTitle || jobTitle.length < 3) return;
          const jobUrl = titleEl.href.split('?')[0];

          let company = '';
          for (const s of ['a.comp-name','[class*="comp-name"]','.companyInfo a','[class*="company-name"]','a[class*="company"]']) {
            const t = card.querySelector(s)?.textContent?.trim();
            if (t && t.length > 1) { company = t; break; }
          }
          if (!company) return;

          const locEl  = card.querySelector('.loc, [class*="location"], span[class*="locWdth"], [class*="location-link"]');
          const jobLoc = locEl?.textContent?.trim()?.split(',')[0]?.trim() || locFallback;

          const salEl      = card.querySelector('.salary, [class*="salary"], span[class*="sal"], [class*="compensation"]');
          const salaryText = salEl?.textContent?.trim() || '';

          const expEl   = card.querySelector('.exp, [class*="experience"], [class*="exp-container"]');
          const expText = expEl?.textContent?.trim() || '';

          const postedEl   = card.querySelector('.job-post-day, [class*="post-day"], span[class*="date"], [class*="post-date"]');
          const postedText = postedEl?.textContent?.trim() || '';
          let daysOld = 0;
          const dm = postedText.match(/(\d+)\s*day/i);
          const wm = postedText.match(/(\d+)\s*week/i);
          const mm = postedText.match(/(\d+)\s*month/i);
          if (dm) daysOld = parseInt(dm[1]);
          else if (wm) daysOld = parseInt(wm[1]) * 7;
          else if (mm) daysOld = parseInt(mm[1]) * 30;
          if (daysOld > maxAge) return;

          // Card snippet — will be replaced by full JD in Pass 2
          const descEl    = card.querySelector('[class*="job-desc"], .job-description, [class*="description"]');
          const description = descEl?.textContent?.trim() || '';

          results.push({
            title: jobTitle, company, location: jobLoc, job_url: jobUrl,
            platform: 'naukri',
            posted_date: new Date(Date.now() - daysOld * 86400000).toISOString(),
            description,
            salary_mentioned: salaryText.length > 2,
            salary_range: salaryText,
            requirements: expText,
            location_priority: 99,
          });
        } catch { /* malformed card */ }
      });

      return results;
    }, FRESH_AGE_DAYS, location);

    for (const job of extracted) {
      job.location_priority = LOCATION_PRIORITY[job.location] || LOCATION_PRIORITY[location] || 99;
      jobs.push(job);
    }

    if (jobs.length > 0) logger.info(`  ✓ Naukri [${keyword} / ${location} / p${pageNum}]: ${jobs.length} jobs`);

  } catch (err) {
    logger.error(`  ✗ Naukri fetch error [${keyword} / ${location} / p${pageNum}]: ${err.message}`);
  } finally {
    await page.close();
  }

  return jobs;
}

// ── Pass 2: fetch full JD from detail page ────────────────────────
async function fetchNaukriDetail(browser, jobUrl) {
  const page = await browser.newPage();
  try {
    await page.setUserAgent(config.scraper.userAgent);
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });

    // Wait for the JD container to render
    await page.waitForSelector(
      '.dang-inner-html, [class*="JDC"], section[class*="desc"]',
      { timeout: 8000 }
    ).catch(() => {});
    await sleep(600);

    const detail = await page.evaluate(() => {
      // JD selectors in priority order — Naukri uses .dang-inner-html consistently
      const jdEl =
        document.querySelector('.dang-inner-html') ||
        document.querySelector('[class*="JDC"] .dang-inner-html') ||
        document.querySelector('[class*="jobDesc"] .dang-inner-html') ||
        document.querySelector('section[class*="desc"] .dang-inner-html') ||
        document.querySelector('[class*="job-desc-container"]') ||
        document.querySelector('[class*="jd-inner-html"]');

      const description = (jdEl?.innerText || jdEl?.textContent || '').trim();

      // Salary — detail page is often more complete
      const salEl = document.querySelector(
        '[class*="salary-container"], [class*="jhc__salary"], [class*="comp-dtls-wrap"], [class*="salary"]'
      );
      const salary = (salEl?.innerText || '').trim().slice(0, 200);

      // Experience
      const expEl = document.querySelector(
        '[class*="exp-container"], [class*="jhc__exp"], [class*="experience"]'
      );
      const requirements = (expEl?.innerText || '').trim().slice(0, 200);

      return { description, salary, requirements };
    });

    return detail;
  } catch (err) {
    logger.debug(`Naukri detail failed [${jobUrl.slice(-40)}]: ${err.message}`);
    return { description: '', salary: '', requirements: '' };
  } finally {
    await page.close();
  }
}

// ── Main export ───────────────────────────────────────────────────
async function scrapeNaukri(keywords, locations) {
  const allJobs = [];
  const seen    = new Set();
  let   browser;

  const kwList  = keywords.slice(0, 12);
  const locList = locations.slice(0, 10);
  const groups  = kwList.flatMap(kw => locList.map(loc => [kw, loc]));

  logger.info(`Naukri: ${groups.length} groups | ≤${PAGES_PER_SEARCH} pages each | concurrency=${CONCURRENCY} | freshness=${FRESH_AGE_DAYS}d`);

  try {
    browser   = await getBrowser();
    const sem = new Semaphore(CONCURRENCY);

    // ── Pass 1: listing pages ──────────────────────────────────
    await Promise.all(groups.map(async ([keyword, location]) => {
      await sem.acquire();
      try {
        for (let pageNum = 1; pageNum <= PAGES_PER_SEARCH; pageNum++) {
          const jobs = await fetchNaukriPage(browser, keyword, location, pageNum);
          let newInPage = 0;
          for (const job of jobs) {
            if (!seen.has(job.job_url)) {
              seen.add(job.job_url);
              allJobs.push(job);
              newInPage++;
            }
          }
          if (jobs.length === 0) break;
          if (pageNum < PAGES_PER_SEARCH) await sleep(PAGE_DELAY_MS);
        }
      } finally {
        sem.release();
      }
    }));

    logger.info(`Naukri Pass 1 complete: ${allJobs.length} unique jobs found`);

    // ── Pass 2: detail pages for full JD ──────────────────────
    const toEnrich = allJobs.slice(0, DETAIL_LIMIT);
    logger.info(`Naukri Pass 2: fetching full JD for ${toEnrich.length} jobs (concurrency=${DETAIL_CONCURRENCY})`);

    const detailSem = new Semaphore(DETAIL_CONCURRENCY);
    let enriched = 0;

    await Promise.all(toEnrich.map(async (job) => {
      await detailSem.acquire();
      try {
        await sleep(400);
        const detail = await fetchNaukriDetail(browser, job.job_url);
        if (detail.description.length > 100) {
          job.description = detail.description;
          enriched++;
        }
        if (detail.salary && detail.salary.length > 2 && !job.salary_range) {
          job.salary_range = detail.salary;
          job.salary_mentioned = true;
        }
        if (detail.requirements && detail.requirements.length > 2 && !job.requirements) {
          job.requirements = detail.requirements;
        }
      } finally {
        detailSem.release();
      }
    }));

    // ── Description quality stats ──────────────────────────────
    const lengths  = allJobs.map(j => j.description.length);
    const avgLen   = lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 0;
    const full     = lengths.filter(l => l > 500).length;
    const partial  = lengths.filter(l => l > 100 && l <= 500).length;
    const empty    = lengths.filter(l => l <= 100).length;
    logger.info(`📏 Naukri JD quality: avg=${avgLen} chars | full(>500)=${full} | partial=${partial} | short/empty=${empty} | enriched=${enriched}/${toEnrich.length}`);

  } catch (err) {
    logger.error(`Naukri scraper crashed: ${err.message}`);
    throw err;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  logger.info(`Naukri total: ${allJobs.length} unique jobs`);
  return allJobs;
}

module.exports = { scrapeNaukri };
