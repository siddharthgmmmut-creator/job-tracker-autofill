/**
 * IIMjobs Investigation Part 2:
 * 1. Test additional slug variations to find more working keywords
 * 2. Inspect the exact card/anchor structure on a listing page to fix title extraction
 * 3. Inspect the detail page MuiGrid-grid-md-8 inner structure to find JD selector
 */

'use strict';
const puppeteer = require('puppeteer');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// More slug variations to try
const MORE_SLUGS = [
  // Variations of broken ones
  { slug: 'go-to-market',               city: 'mumbai'    },
  { slug: 'growth',                     city: 'mumbai'    },
  { slug: 'strategy-and-operations',    city: 'mumbai'    },
  { slug: 'strategy-operations',        city: 'mumbai'    },
  { slug: 'general-management',         city: 'mumbai'    },
  { slug: 'general-manager',            city: 'mumbai'    },
  { slug: 'founder-office',             city: 'mumbai'    },
  { slug: 'ceo',                        city: 'mumbai'    },
  { slug: 'strategic-planning',         city: 'mumbai'    },
  { slug: 'business-strategy',          city: 'mumbai'    },
  { slug: 'brand-strategy',             city: 'mumbai'    },
  { slug: 'marketing-strategy',         city: 'mumbai'    },
  { slug: 'product-management',         city: 'mumbai'    },
  { slug: 'product-manager',            city: 'bangalore' },
  { slug: 'program-manager',            city: 'delhi-ncr' },
  { slug: 'operations',                 city: 'mumbai'    },
  { slug: 'management-consulting',      city: 'mumbai'    },
  { slug: 'consulting',                 city: 'mumbai'    },
  { slug: 'venture-capital',            city: 'mumbai'    },
  { slug: 'business-development',       city: 'mumbai'    },
  // Also test known working ones in more cities
  { slug: 'business-operations',        city: 'bangalore' },
  { slug: 'business-operations',        city: 'delhi-ncr' },
  { slug: 'growth-marketing',           city: 'bangalore' },
  { slug: 'growth-marketing',           city: 'delhi-ncr' },
  { slug: 'revenue-operations',         city: 'bangalore' },
  { slug: 'product-strategy',           city: 'bangalore' },
];

async function testSlug(browser, slug, city) {
  const url = `https://www.iimjobs.com/${slug}-jobs-in-${city}`;
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(1000);
    const count = await page.evaluate(() =>
      new Set([...document.querySelectorAll('a[href]')]
        .filter(a => /iimjobs\.com\/j\/[a-z0-9-]+-\d{5,}/.test(a.href||''))
        .map(a => a.href.split('?')[0])).size
    );
    return { count };
  } catch (err) {
    return { count: 0, error: err.message };
  } finally {
    await page.close();
  }
}

// Inspect listing page card structure in detail
async function inspectListingPage(browser, slug, city) {
  const url = `https://www.iimjobs.com/${slug}-jobs-in-${city}`;
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);

    const result = await page.evaluate(() => {
      // For the FIRST 3 job links, dump their immediate DOM context
      const jobLinks = [...document.querySelectorAll('a[href]')]
        .filter(a => /iimjobs\.com\/j\/[a-z0-9-]+-\d{5,}/.test(a.href || ''));

      const uniqueLinks = [];
      const seen = new Set();
      for (const a of jobLinks) {
        const href = a.href.split('?')[0];
        if (!seen.has(href)) { seen.add(href); uniqueLinks.push(a); }
      }

      return uniqueLinks.slice(0, 4).map(a => {
        const href = a.href.split('?')[0];
        // The anchor's own text
        const anchorText = a.textContent?.trim() || '';

        // Walk up 5 levels and collect class names + first 80 chars of text at each level
        const levels = [];
        let el = a;
        for (let i = 0; i < 6; i++) {
          el = el.parentElement;
          if (!el) break;
          levels.push({
            tag: el.tagName,
            classes: (el.className||'').slice(0, 100),
            textStart: (el.innerText||el.textContent||'').trim().slice(0, 80),
            childCount: el.children.length,
          });
        }

        // Try finding the "closest" MuiCard/MuiPaper to determine what card we'd get
        const closestCard = a.closest('[class*="MuiCard"],[class*="MuiPaper"]');
        const closestCardText = (closestCard?.innerText||closestCard?.textContent||'').trim().slice(0, 150);
        const closestCardClass = (closestCard?.className||'').slice(0, 100);

        // MuiTypography nodes within that closest card
        const muiTypInCard = closestCard
          ? [...closestCard.querySelectorAll('[class*="MuiTypography"]')]
              .filter(el => !el.querySelector('[class*="MuiTypography"]'))
              .map(el => (el.textContent||'').trim())
              .filter(t => t.length > 1)
              .slice(0, 6)
          : [];

        return {
          href,
          anchorText,
          levels,
          closestCardClass,
          closestCardText,
          muiTypInCard,
        };
      });
    });

    return { url, cards: result };
  } catch (err) {
    return { url, error: err.message, cards: [] };
  } finally {
    await page.close();
  }
}

// Inspect detail page - focus on the 8.5-column main content
async function inspectDetailPageDeep(browser, detailUrl) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  try {
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3500);

    return await page.evaluate(() => {
      // Target the main content column (the wider grid column)
      const mainCol =
        document.querySelector('[class*="MuiGrid-grid-md-8"]') ||
        document.querySelector('[class*="MuiGrid-grid-lg-8"]');

      if (!mainCol) return { error: 'No MuiGrid-grid-md-8 found' };

      const mainColText  = (mainCol.innerText || mainCol.textContent || '').trim();
      const mainColClass = (mainCol.className || '');

      // List direct children of mainCol with their text
      const children = [...mainCol.children].map(child => ({
        tag: child.tagName,
        classes: (child.className||'').slice(0, 100),
        textLen: (child.innerText||child.textContent||'').trim().length,
        textStart: (child.innerText||child.textContent||'').trim().slice(0, 200),
      }));

      // Now try different text extraction strategies within mainCol
      // Strategy A: all p, li, span > 20 chars
      const stratA = [...mainCol.querySelectorAll('p, li')]
        .map(el => (el.innerText||el.textContent||'').trim())
        .filter(t => t.length > 20)
        .join('\n\n');

      // Strategy B: MuiTypography-body1/body2/body3 only (not nav/heading variants)
      const stratB = [...mainCol.querySelectorAll(
        '[class*="MuiTypography-body1"],[class*="MuiTypography-body2"],[class*="MuiTypography-body3"]'
      )]
        .filter(el => !el.querySelector('[class*="MuiTypography-body"]'))
        .map(el => (el.innerText||el.textContent||'').trim())
        .filter(t => t.length > 15)
        .join('\n\n');

      // Strategy C: all text from mainCol, skip the heading area
      // Get all leaf-level text blocks with > 30 chars
      const allLeafText = [];
      const walker = document.createTreeWalker(mainCol, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const txt = node.textContent.trim();
        if (txt.length > 30) allLeafText.push(txt);
      }
      const stratC = allLeafText.join('\n').trim();

      // Also check what's in the skills/mandatory-skills box
      const skillsBox = [...mainCol.querySelectorAll('[class*="MuiBox"]')]
        .find(el => (el.innerText||el.textContent||'').includes('Mandatory Skills'));
      const skillsText = skillsBox ? (skillsBox.innerText||skillsBox.textContent||'').trim() : '';

      // Get h1 (actual job title)
      const h1 = document.querySelector('h1,[class*="MuiTypography-h1"],[class*="MuiTypography-h2"]');
      const jobTitle = h1 ? (h1.innerText||h1.textContent||'').trim() : '';

      return {
        jobTitle,
        mainColClass,
        mainColTotalLen: mainColText.length,
        mainColStart: mainColText.slice(0, 300),
        children,
        stratALen: stratA.length,
        stratAStart: stratA.slice(0, 300),
        stratBLen: stratB.length,
        stratBStart: stratB.slice(0, 300),
        stratCLen: stratC.length,
        stratCStart: stratC.slice(0, 300),
        skillsText: skillsText.slice(0, 200),
      };
    });
  } catch (err) {
    return { error: err.message };
  } finally {
    await page.close();
  }
}

async function main() {
  console.log('\n🔍 IIMjobs Investigation Part 2\n');
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'],
    });

    // ── Phase 1: More slug variations ───────────────────────────
    console.log('═══ PHASE 1: Additional Slug Tests ═══\n');
    const working = [];
    for (const { slug, city } of MORE_SLUGS) {
      const res = await testSlug(browser, slug, city);
      const ok = res.count > 0;
      if (ok) {
        console.log(`  ✅  ${slug}-jobs-in-${city}  →  ${res.count} jobs`);
        working.push({ slug, city, count: res.count });
      } else {
        console.log(`  ❌  ${slug}-jobs-in-${city}  →  0`);
      }
      await sleep(800);
    }
    console.log(`\n  New working slugs found: ${working.length}`);

    // ── Phase 2: Listing card structure inspection ───────────────
    console.log('\n═══ PHASE 2: Listing Card Structure (chief-of-staff / mumbai) ═══\n');
    const listInfo = await inspectListingPage(browser, 'chief-of-staff', 'mumbai');
    if (listInfo.error) {
      console.log(`  Error: ${listInfo.error}`);
    } else {
      listInfo.cards.forEach((c, i) => {
        console.log(`  ─── Card ${i+1} ───`);
        console.log(`  URL: ${c.href}`);
        console.log(`  Anchor text: "${c.anchorText}"`);
        console.log(`  Closest MuiCard class: "${c.closestCardClass}"`);
        console.log(`  Closest MuiCard text[0:150]: "${c.closestCardText}"`);
        console.log(`  MuiTypography in card: ${JSON.stringify(c.muiTypInCard)}`);
        console.log(`  Parent levels:`);
        c.levels.forEach((l, j) => {
          console.log(`    [+${j+1}] <${l.tag}> class="${l.classes}" children=${l.childCount} text="${l.textStart}"`);
        });
        console.log('');
      });
    }

    // ── Phase 3: Detail page deep inspection ────────────────────
    console.log('\n═══ PHASE 3: Detail Page Deep Inspection ═══\n');
    // Use working sample URL
    const detailUrl = 'https://www.iimjobs.com/j/chief-of-staff-business-analysis-consulting-firm-1693584';
    const info = await inspectDetailPageDeep(browser, detailUrl);

    if (info.error) {
      console.log(`  Error: ${info.error}`);
    } else {
      console.log(`  Job title: "${info.jobTitle}"`);
      console.log(`  Main col class: "${info.mainColClass}"`);
      console.log(`  Main col total chars: ${info.mainColTotalLen}`);
      console.log(`  Main col start[0:300]: "${info.mainColStart}"`);

      console.log('\n  Direct children of main column:');
      info.children.forEach((c, i) => {
        console.log(`    [${i}] <${c.tag}> class="${c.classes}" textLen=${c.textLen}`);
        console.log(`         text[0:200]: "${c.textStart}"`);
      });

      console.log(`\n  Strategy A (p,li): len=${info.stratALen}`);
      console.log(`  Start: "${info.stratAStart}"`);

      console.log(`\n  Strategy B (body1/2/3 typography): len=${info.stratBLen}`);
      console.log(`  Start: "${info.stratBStart}"`);

      console.log(`\n  Strategy C (text walker): len=${info.stratCLen}`);
      console.log(`  Start: "${info.stratCStart}"`);

      console.log(`\n  Skills box: "${info.skillsText}"`);
    }

  } finally {
    if (browser) await browser.close().catch(() => {});
    console.log('\n✅ Investigation 2 complete.\n');
  }
}

main().catch(err => {
  console.error('\n❌ Failed:', err.message);
  process.exit(1);
});
