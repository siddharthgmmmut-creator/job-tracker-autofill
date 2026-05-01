/**
 * IIMjobs Investigation Script
 * 1. Test which keyword slugs return job cards
 * 2. Dump the DOM structure of a detail page to find the correct JD selector
 *
 * Read-only. Does not touch any scraper files.
 * Usage: node scripts/iimjobs-investigate.js
 */

'use strict';
const puppeteer = require('puppeteer');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── 1. Keyword slug tests ─────────────────────────────────────────
const SLUG_TESTS = [
  // Current scraper slugs (likely broken)
  { slug: 'growth-manager',       city: 'mumbai'    },
  { slug: 'gtm-manager',          city: 'mumbai'    },
  { slug: 'chief-of-staff',       city: 'mumbai'    },
  { slug: 'ceo-office',           city: 'mumbai'    },
  { slug: 'operations-manager',   city: 'mumbai'    },
  { slug: 'business-operations',  city: 'mumbai'    },
  { slug: 'strategy-manager',     city: 'mumbai'    },
  { slug: 'growth-marketing',     city: 'mumbai'    },
  { slug: 'founders-office',      city: 'mumbai'    },
  { slug: 'program-manager',      city: 'mumbai'    },
  { slug: 'revenue-operations',   city: 'mumbai'    },
  { slug: 'product-strategy',     city: 'mumbai'    },
  { slug: 'strategy-analyst',     city: 'mumbai'    },
  // Alternate forms to try
  { slug: 'chief-of-staff',       city: 'bangalore' },
  { slug: 'chief-of-staff',       city: 'delhi-ncr' },
  { slug: 'program-manager',      city: 'bangalore' },
  { slug: 'operations-manager',   city: 'bangalore' },
  { slug: 'strategy',             city: 'mumbai'    },
  { slug: 'business-analyst',     city: 'mumbai'    },
  { slug: 'product-manager',      city: 'mumbai'    },
];

async function testSlug(browser, slug, city) {
  const url = `https://www.iimjobs.com/${slug}-jobs-in-${city}`;
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(1500);

    const result = await page.evaluate(() => {
      // Count job links matching the detail URL pattern
      const jobLinks = [...document.querySelectorAll('a[href]')]
        .filter(a => /iimjobs\.com\/j\/[a-z0-9-]+-\d{5,}/.test(a.href || ''));

      // Deduplicate
      const hrefs = [...new Set(jobLinks.map(a => a.href.split('?')[0]))];

      // Grab first title + URL for inspection
      let sampleTitle = '', sampleUrl = '';
      for (const a of jobLinks) {
        const card = a.closest('[class*="MuiCard"],[class*="MuiPaper"]');
        if (card) {
          const typs = [...card.querySelectorAll('[class*="MuiTypography"]')]
            .map(el => el.textContent?.trim())
            .filter(t => t && t.length > 2);
          if (typs.length) { sampleTitle = typs[0]; sampleUrl = a.href.split('?')[0]; break; }
        }
      }

      // Also check if the page has any error/no-results message
      const bodyText = document.body?.innerText || '';
      const isEmpty  = /no jobs found|0 jobs|no results/i.test(bodyText);

      return { count: hrefs.length, sampleTitle, sampleUrl, isEmpty };
    });

    return { url, ...result };
  } catch (err) {
    return { url, count: 0, error: err.message };
  } finally {
    await page.close();
  }
}

// ── 2. Detail page DOM inspector ─────────────────────────────────
async function inspectDetailPage(browser, detailUrl) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  console.log(`\n  Inspecting detail page: ${detailUrl}`);
  try {
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000); // extra wait for React to render

    const info = await page.evaluate(() => {
      // Collect all div/section/article elements with more than 200 chars of text
      // that could be JD containers
      const candidates = [];
      const els = document.querySelectorAll('div, section, article, main');
      els.forEach(el => {
        const txt = (el.innerText || el.textContent || '').trim();
        if (txt.length < 200) return;
        // Skip if it has too many children (likely a layout container)
        const directChildren = el.children.length;
        if (directChildren > 20) return;
        const classes = el.className || '';
        const id = el.id || '';
        candidates.push({
          tag: el.tagName,
          classes: classes.slice(0, 120),
          id,
          textLen: txt.length,
          firstChars: txt.slice(0, 150),
          childCount: directChildren,
        });
      });

      // Sort by text length descending, take top 20
      candidates.sort((a, b) => b.textLen - a.textLen);

      // Also specifically look for known IIMjobs class patterns
      const specificChecks = [
        '.job-desc', '.jd-content', '.job-description', '[class*="jobDesc"]',
        '[class*="job-details"]', '[class*="jd"]', '[class*="description"]',
        'section', 'article', 'main',
        '[class*="MuiBox"]', '[class*="MuiContainer"]', '[class*="MuiGrid"]',
        '[class*="content"]', '[class*="body"]', '[class*="detail"]',
      ];
      const specificResults = [];
      for (const sel of specificChecks) {
        const found = [...document.querySelectorAll(sel)];
        for (const el of found) {
          const txt = (el.innerText || el.textContent || '').trim();
          if (txt.length > 300) {
            specificResults.push({
              selector: sel,
              classes: (el.className || '').slice(0, 120),
              textLen: txt.length,
              firstChars: txt.slice(0, 200),
            });
          }
        }
        if (specificResults.length > 30) break;
      }

      // Get the page title (actual job title)
      const titleEl = document.querySelector('h1, [class*="MuiTypography-h1"], [class*="job-title"]');
      const pageTitle = titleEl?.textContent?.trim() || document.title;

      // Dump ALL class names present on MuiTypography elements for analysis
      const muiClasses = [...new Set(
        [...document.querySelectorAll('[class*="MuiTypography"]')]
          .map(el => el.className)
          .filter(c => c && c.includes('MuiTypography'))
      )].slice(0, 30);

      // Get ALL MuiTypography leaf text to see what's in there
      const muiLeafText = [...document.querySelectorAll('[class*="MuiTypography"]')]
        .filter(el => !el.querySelector('[class*="MuiTypography"]'))
        .map(el => (el.innerText || el.textContent || '').trim())
        .filter(t => t.length > 5)
        .slice(0, 30);

      return {
        pageTitle,
        topCandidates: candidates.slice(0, 20),
        specificResults: specificResults.slice(0, 20),
        muiClasses,
        muiLeafText,
      };
    });

    return info;
  } catch (err) {
    return { error: err.message };
  } finally {
    await page.close();
  }
}

// ── MAIN ─────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔍 IIMjobs Investigation\n');
  let browser;
  let firstWorkingDetailUrl = null;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'],
    });

    // ── Phase 1: Slug tests ──────────────────────────────────────
    console.log('═══ PHASE 1: Keyword Slug Tests ═══\n');
    const working = [], broken = [];

    for (const { slug, city } of SLUG_TESTS) {
      const res = await testSlug(browser, slug, city);
      const ok = res.count > 0;
      const marker = ok ? '✅' : '❌';
      console.log(`  ${marker}  ${slug}-jobs-in-${city}  →  ${res.count} jobs${res.error ? ' [ERR: '+res.error+']' : ''}`);
      if (ok) {
        working.push({ slug, city, count: res.count, sampleTitle: res.sampleTitle, sampleUrl: res.sampleUrl });
        if (!firstWorkingDetailUrl && res.sampleUrl) firstWorkingDetailUrl = res.sampleUrl;
      } else {
        broken.push({ slug, city });
      }
      await sleep(1200);
    }

    console.log(`\n  Working slugs: ${working.length}/${SLUG_TESTS.length}`);
    console.log(`  Broken slugs:  ${broken.length}/${SLUG_TESTS.length}`);

    console.log('\n  Working slug details:');
    for (const w of working) {
      console.log(`    ${w.slug}-jobs-in-${w.city} → ${w.count} jobs`);
      console.log(`      Sample title: "${w.sampleTitle}"`);
      console.log(`      Sample URL:   ${w.sampleUrl}`);
    }

    // ── Phase 2: Detail page DOM inspection ──────────────────────
    if (firstWorkingDetailUrl) {
      console.log('\n═══ PHASE 2: Detail Page DOM Inspection ═══');
      const info = await inspectDetailPage(browser, firstWorkingDetailUrl);

      if (info.error) {
        console.log(`  Error: ${info.error}`);
      } else {
        console.log(`\n  Page title: "${info.pageTitle}"`);

        console.log('\n  --- Top DOM candidates (by text length) ---');
        info.topCandidates.slice(0, 10).forEach((c, i) => {
          console.log(`  [${i+1}] <${c.tag}> classes="${c.classes}" id="${c.id}"`);
          console.log(`       textLen=${c.textLen}, children=${c.childCount}`);
          console.log(`       First 150: "${c.firstChars}"`);
          console.log('');
        });

        console.log('\n  --- Specific selector results ---');
        info.specificResults.slice(0, 10).forEach((c, i) => {
          console.log(`  [${i+1}] sel="${c.selector}"  classes="${c.classes}"`);
          console.log(`       textLen=${c.textLen}`);
          console.log(`       First 200: "${c.firstChars}"`);
          console.log('');
        });

        console.log('\n  --- MuiTypography classes on page ---');
        info.muiClasses.forEach(c => console.log(`    ${c}`));

        console.log('\n  --- MuiTypography leaf text (first 30 nodes) ---');
        info.muiLeafText.forEach((t, i) => console.log(`    [${i}] "${t.slice(0,100)}"`));
      }
    } else {
      console.log('\n  ⚠️  No working detail URLs found — cannot inspect detail page.');
    }

  } finally {
    if (browser) await browser.close().catch(() => {});
    console.log('\n✅ Investigation complete.\n');
  }
}

main().catch(err => {
  console.error('\n❌ Investigation failed:', err.message);
  process.exit(1);
});
