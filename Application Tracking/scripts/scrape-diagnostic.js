/**
 * Scrape Diagnostic — Naukri + IIMjobs
 * Tests a limited set of URLs to validate Pass 1 (listing) and Pass 2 (detail/JD) quality.
 * Read-only: does not write to DB. Safe to run any time.
 *
 * Usage: node scripts/scrape-diagnostic.js
 */

'use strict';
const puppeteer = require('puppeteer');

// ── Config ────────────────────────────────────────────────────────
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const NAUKRI_TESTS = [
  { keyword: 'growth manager',  location: 'Mumbai'    },
  { keyword: 'chief of staff',  location: 'Mumbai'    },
  { keyword: 'gtm manager',     location: 'Bangalore' },
];
const NAUKRI_DETAIL_LIMIT = 5;   // detail pages per listing page tested

const IIMJOBS_TESTS = [
  { kw: 'growth manager',  city: 'mumbai',    location: 'Mumbai'    },
  { kw: 'chief-of-staff',  city: 'bangalore', location: 'Bangalore' },
  { kw: 'gtm-manager',     city: 'delhi-ncr', location: 'Gurgaon'  },
];
const IIMJOBS_DETAIL_LIMIT = 5;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function banner(msg) {
  const line = '─'.repeat(60);
  console.log(`\n${line}\n  ${msg}\n${line}`);
}

function descStats(jobs) {
  const lens = jobs.map(j => j.description?.length || 0);
  const avg  = lens.length ? Math.round(lens.reduce((a,b)=>a+b,0) / lens.length) : 0;
  const gt1000 = lens.filter(l => l > 1000).length;
  const band   = lens.filter(l => l >= 500 && l <= 1000).length;
  const lt500  = lens.filter(l => l < 500).length;
  return { avg, gt1000, band, lt500, total: jobs.length };
}

// ── NAUKRI ────────────────────────────────────────────────────────
async function naukriListingPage(browser, keyword, location) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 800 });

  const slug  = `${keyword.replace(/\s+/g,'-')}-jobs-in-${location.replace(/\s+/g,'-')}`;
  const url   = `https://www.naukri.com/${slug}?k=${encodeURIComponent(keyword)}&l=${encodeURIComponent(location)}&nojdl=1&jobAge=7`;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector(
      '.srp-jobtuple-wrapper, article.jobTuple, .cust-job-tuple, [data-job-id]',
      { timeout: 8000 }
    ).catch(() => {});
    await sleep(1200);

    const jobs = await page.evaluate(() => {
      const CARD_SELS = ['.srp-jobtuple-wrapper','article.jobTuple','[class*="jobTuple"]','.cust-job-tuple','li[class*="tuple"]','[data-job-id]'];
      let cards = [];
      for (const s of CARD_SELS) {
        const found = document.querySelectorAll(s);
        if (found.length > 2) { cards = [...found]; break; }
      }
      return cards.map(card => {
        let titleEl = null;
        for (const s of ['a.title','a[class*="title"]','h2 a','.jobTitle a']) {
          const el = card.querySelector(s);
          if (el?.href?.includes('job-listings')) { titleEl = el; break; }
        }
        if (!titleEl) {
          const anchors = [...card.querySelectorAll('a[href*="job-listings"]')];
          if (anchors.length) titleEl = anchors[0];
        }
        if (!titleEl?.href) return null;
        const title  = (titleEl.textContent||'').trim();
        const jobUrl = titleEl.href.split('?')[0];
        const descEl = card.querySelector('[class*="job-desc"],.job-description,[class*="description"]');
        const desc   = (descEl?.textContent||'').trim();
        return { title, job_url: jobUrl, description: desc };
      }).filter(Boolean);
    });

    return { url, jobs };
  } catch (err) {
    return { url, error: err.message, jobs: [] };
  } finally {
    await page.close();
  }
}

async function naukriDetailPage(browser, jobUrl) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 800 });
  try {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForSelector(
      '.dang-inner-html, [class*="JDC"], section[class*="desc"]',
      { timeout: 8000 }
    ).catch(() => {});
    await sleep(600);

    return await page.evaluate(() => {
      const jdEl =
        document.querySelector('.dang-inner-html') ||
        document.querySelector('[class*="JDC"] .dang-inner-html') ||
        document.querySelector('[class*="jobDesc"] .dang-inner-html') ||
        document.querySelector('section[class*="desc"] .dang-inner-html') ||
        document.querySelector('[class*="job-desc-container"]') ||
        document.querySelector('[class*="jd-inner-html"]');
      return (jdEl?.innerText || jdEl?.textContent || '').trim();
    });
  } catch (err) {
    return '';
  } finally {
    await page.close();
  }
}

// ── IIMJOBS ───────────────────────────────────────────────────────
async function iimjobsListingPage(browser, kwSlug, citySlug, location) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  const url = `https://www.iimjobs.com/${kwSlug}-jobs-in-${citySlug}`;

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);

    const jobs = await page.evaluate((loc) => {
      const jobLinks = [...document.querySelectorAll('a[href]')]
        .filter(a => /iimjobs\.com\/j\/[a-z0-9-]+-\d{5,}/.test(a.href || ''));

      const seen = new Set();
      const results = [];
      jobLinks.forEach(a => {
        const href = a.href.split('?')[0];
        if (seen.has(href)) return;
        seen.add(href);
        const card = a.closest('[class*="MuiCard"],[class*="MuiPaper"]');
        if (!card) return;
        const textNodes = [...card.querySelectorAll('[class*="MuiTypography"]')]
          .map(el => el.textContent?.trim())
          .filter(t => t && t.length > 2 && t.length < 120 && !t.match(/^\d|Posted|Review|yrs|Lacs|Apply|Save|Shortlist/i));
        if (!textNodes.length) return;
        results.push({ title: textNodes[0], company: textNodes[1]||'', location: loc, job_url: href });
      });
      return results;
    }, location);

    return { url, jobs };
  } catch (err) {
    return { url, error: err.message, jobs: [] };
  } finally {
    await page.close();
  }
}

async function iimjobsDetailPage(browser, jobUrl) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  try {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForSelector('[class*="MuiTypography"],[class*="MuiContainer"]', { timeout: 8000 }).catch(() => {});
    await sleep(2000);

    return await page.evaluate(() => {
      const leaves = [...document.querySelectorAll('[class*="MuiTypography"]')]
        .filter(el => !el.querySelector('[class*="MuiTypography"]'))
        .map(el => (el.innerText || el.textContent || '').trim())
        .filter(t => t.length > 10);

      const metaPatterns = /^(Apply|Save|Share|Posted|Salary|Experience|Location|Job Type|Skills|Company|Views|Applicants|\d+\s*(yrs?|Lacs?|LPA|years?))/i;
      const bodyLines = leaves.filter((t, i) => {
        if (i < 3) return false;
        if (metaPatterns.test(t)) return false;
        return t.length > 20;
      });
      return bodyLines.join('\n\n').trim();
    });
  } catch (err) {
    return '';
  } finally {
    await page.close();
  }
}

// ── REPORT HELPERS ────────────────────────────────────────────────
function printSamples(jobs, platform, n = 5) {
  console.log(`\n  📋 ${platform} — ${n} sample jobs:`);
  jobs.slice(0, n).forEach((j, i) => {
    const len    = j.description?.length || 0;
    const first  = (j.description || '').slice(0, 200).replace(/\n/g, ' ');
    console.log(`  [${i+1}] "${j.title}" | len=${len}`);
    console.log(`       ${first || '(empty)'}`);
  });
}

// ── MAIN ──────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔍 SCRAPE DIAGNOSTIC — Naukri + IIMjobs');
  console.log('  Mode: limited sample run (NOT full production scrape)');
  console.log(`  Date: ${new Date().toLocaleString()}\n`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'],
    });

    // ══════════════════════════════════════════════
    //  NAUKRI
    // ══════════════════════════════════════════════
    banner('NAUKRI — Pass 1: Listing Pages');

    const naukriAllJobs = [];
    for (const { keyword, location } of NAUKRI_TESTS) {
      process.stdout.write(`  Fetching: "${keyword}" in ${location} ... `);
      const { url, jobs, error } = await naukriListingPage(browser, keyword, location);
      if (error) {
        console.log(`ERROR: ${error}`);
      } else {
        console.log(`${jobs.length} cards found`);
        for (const j of jobs) {
          if (!naukriAllJobs.find(x => x.job_url === j.job_url)) {
            naukriAllJobs.push(j);
          }
        }
      }
      await sleep(800);
    }

    console.log(`\n  Pass 1 total unique jobs: ${naukriAllJobs.length}`);
    const naukriCardDescAvg = naukriAllJobs.length
      ? Math.round(naukriAllJobs.map(j => j.description.length).reduce((a,b)=>a+b,0) / naukriAllJobs.length)
      : 0;
    console.log(`  Card snippet avg length: ${naukriCardDescAvg} chars (expected ~90)`);

    banner('NAUKRI — Pass 2: Detail Pages');

    const toEnrich = naukriAllJobs.slice(0, NAUKRI_DETAIL_LIMIT);
    console.log(`  Testing ${toEnrich.length} detail pages (limit=${NAUKRI_DETAIL_LIMIT}):`);

    let naukriEnriched = 0, naukriFailed = 0;
    for (const job of toEnrich) {
      process.stdout.write(`  → ${job.title.slice(0,50).padEnd(50)} ... `);
      const fullDesc = await naukriDetailPage(browser, job.job_url);
      if (fullDesc.length > 100) {
        job.description = fullDesc;
        naukriEnriched++;
        console.log(`✓ ${fullDesc.length} chars`);
      } else {
        naukriFailed++;
        console.log(`✗ (${fullDesc.length} chars — too short)`);
      }
      await sleep(600);
    }

    banner('NAUKRI — Results');
    const naukriStats = descStats(naukriAllJobs);
    console.log(`  Total jobs scraped (listing):     ${naukriStats.total}`);
    console.log(`  Sent to detail extraction (P2):   ${toEnrich.length}`);
    console.log(`  Successfully enriched:            ${naukriEnriched}`);
    console.log(`  Failed detail extraction:         ${naukriFailed}`);
    console.log(`  Avg description length:           ${naukriStats.avg} chars`);
    console.log(`\n  Distribution:`);
    console.log(`    > 1000 chars:  ${naukriStats.gt1000}`);
    console.log(`    500–1000:      ${naukriStats.band}`);
    console.log(`    < 500:         ${naukriStats.lt500}`);
    printSamples(naukriAllJobs, 'Naukri', 5);

    // ══════════════════════════════════════════════
    //  IIMJOBS
    // ══════════════════════════════════════════════
    banner('IIMJOBS — Pass 1: Listing Pages');

    const iimAllJobs = [];
    for (const { kw, city, location } of IIMJOBS_TESTS) {
      process.stdout.write(`  Fetching: "${kw}" in ${city} ... `);
      const { url, jobs, error } = await iimjobsListingPage(browser, kw, city, location);
      if (error) {
        console.log(`ERROR: ${error}`);
      } else {
        console.log(`${jobs.length} cards found`);
        for (const j of jobs) {
          if (!iimAllJobs.find(x => x.job_url === j.job_url)) {
            iimAllJobs.push({ ...j, description: '' });
          }
        }
      }
      await sleep(1000);
    }

    console.log(`\n  Pass 1 total unique jobs: ${iimAllJobs.length}`);

    banner('IIMJOBS — Pass 2: Detail Pages');

    const iimToEnrich = iimAllJobs.slice(0, IIMJOBS_DETAIL_LIMIT);
    console.log(`  Testing ${iimToEnrich.length} detail pages (limit=${IIMJOBS_DETAIL_LIMIT}):`);

    let iimEnriched = 0, iimFailed = 0;
    for (const job of iimToEnrich) {
      process.stdout.write(`  → ${job.title.slice(0,50).padEnd(50)} ... `);
      const fullDesc = await iimjobsDetailPage(browser, job.job_url);
      if (fullDesc.length > 100) {
        job.description = fullDesc;
        iimEnriched++;
        console.log(`✓ ${fullDesc.length} chars`);
      } else {
        iimFailed++;
        console.log(`✗ (${fullDesc.length} chars — too short)`);
      }
      await sleep(1200);
    }

    banner('IIMJOBS — Results');
    const iimStats = descStats(iimAllJobs);
    console.log(`  Total jobs scraped (listing):     ${iimStats.total}`);
    console.log(`  Sent to detail extraction (P2):   ${iimToEnrich.length}`);
    console.log(`  Successfully enriched:            ${iimEnriched}`);
    console.log(`  Failed detail extraction:         ${iimFailed}`);
    console.log(`  Avg description length:           ${iimStats.avg} chars`);
    console.log(`\n  Distribution:`);
    console.log(`    > 1000 chars:  ${iimStats.gt1000}`);
    console.log(`    500–1000:      ${iimStats.band}`);
    console.log(`    < 500:         ${iimStats.lt500}`);
    printSamples(iimAllJobs, 'IIMjobs', 5);

    // ══════════════════════════════════════════════
    //  SUMMARY
    // ══════════════════════════════════════════════
    banner('SUMMARY');
    console.log('  Platform   | Listing | Enriched | Avg Desc | >1000 | 500-1000 | <500');
    console.log('  -----------|---------|----------|----------|-------|----------|-----');
    const nLen = descStats(naukriAllJobs);
    const iLen = descStats(iimAllJobs);
    console.log(`  Naukri     | ${String(nLen.total).padEnd(7)} | ${String(naukriEnriched).padEnd(8)} | ${String(nLen.avg).padEnd(8)} | ${String(nLen.gt1000).padEnd(5)} | ${String(nLen.band).padEnd(8)} | ${nLen.lt500}`);
    console.log(`  IIMjobs    | ${String(iLen.total).padEnd(7)} | ${String(iimEnriched).padEnd(8)} | ${String(iLen.avg).padEnd(8)} | ${String(iLen.gt1000).padEnd(5)} | ${String(iLen.band).padEnd(8)} | ${iLen.lt500}`);

  } finally {
    if (browser) await browser.close().catch(() => {});
    console.log('\n✅ Diagnostic complete.\n');
  }
}

main().catch(err => {
  console.error('\n❌ Diagnostic failed:', err.message);
  process.exit(1);
});
