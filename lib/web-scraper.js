// === AdLibrarySpy — Web Scraper (No API Token Needed) ===
// Scrapes facebook.com/ads/library using headless browser
// Works on both LOCAL (puppeteer) and VERCEL (@sparticuz/chromium + puppeteer-core)
const { upsertAds } = require('./storage');

const IS_VERCEL = !!process.env.VERCEL;

/**
 * Get the browser instance — auto-detects environment.
 * - Vercel: uses @sparticuz/chromium (serverless-compatible Chromium)
 * - Local: uses regular puppeteer
 */
async function launchBrowser(headless = true) {
  if (IS_VERCEL) {
    // Vercel serverless: use @sparticuz/chromium
    const chromium = require('@sparticuz/chromium');
    const puppeteerCore = require('puppeteer-core');

    chromium.setHeadlessMode = true;
    chromium.setGraphicsMode = false;

    return puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: { width: 1400, height: 900 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }

  // Local: use full puppeteer
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    try {
      puppeteer = require('puppeteer-core');
    } catch {
      throw new Error(
        'Puppeteer not installed. Run: npm install puppeteer'
      );
    }
  }

  return puppeteer.launch({
    headless: headless ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1400,900',
    ],
  });
}

const AD_LIBRARY_BASE = 'https://www.facebook.com/ads/library/';

/**
 * Scrape ads from the public Ad Library page.
 * No Facebook token required — uses headless browser.
 *
 * @param {string} brandName — Search term (brand name)
 * @param {string} brandId — Internal brand identifier
 * @param {object} options — { country, pageId, maxScrolls, headless }
 */
async function scrapeAdLibraryPage(brandName, brandId, options = {}) {
  const {
    country = 'VN',
    pageId = null,
    maxScrolls = IS_VERCEL ? 5 : 15, // Vercel has timeout limits, scroll less
    headless = true,
  } = options;

  // Build Ad Library URL
  const params = new URLSearchParams({
    active_status: 'all',
    ad_type: 'all',
    country: country,
    search_type: 'keyword_unordered',
  });

  if (pageId) {
    params.set('view_all_page_id', pageId);
    params.delete('search_type');
  } else {
    params.set('q', brandName);
  }

  const url = `${AD_LIBRARY_BASE}?${params}`;
  console.log(`[WebScraper] Opening: ${url}`);
  console.log(`[WebScraper] Environment: ${IS_VERCEL ? 'Vercel' : 'Local'}, maxScrolls: ${maxScrolls}`);

  const browser = await launchBrowser(headless);

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    // Navigate
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    console.log('[WebScraper] Page loaded, waiting for ads to render...');
    await new Promise(r => setTimeout(r, 4000));

    // Debug: log what page we actually got
    const pageTitle = await page.title();
    const pageUrl = page.url();
    const debugInfo = await page.evaluate(() => {
      const body = document.body;
      return {
        htmlLength: document.documentElement.outerHTML.length,
        bodyText: (body.innerText || '').substring(0, 800),
        allLinksCount: document.querySelectorAll('a').length,
        adLinksCount: document.querySelectorAll('a[href*="/ads/library/?id="]').length,
        hasLoginForm: !!document.querySelector('form[action*="login"]'),
        hasSearchBox: !!document.querySelector('input[type="search"]') || !!document.querySelector('input[placeholder*="Search"]'),
        divCount: document.querySelectorAll('div').length,
      };
    });
    console.log(`[WebScraper] Page title: "${pageTitle}"`);
    console.log(`[WebScraper] Debug:`, JSON.stringify(debugInfo));

    // Dismiss cookie consent if present
    try {
      const cookieBtn = await page.$('button[data-cookiebanner="accept_button"]');
      if (cookieBtn) {
        await cookieBtn.click();
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch {}

    // Click "See all" / "See results" buttons
    try {
      const buttons = await page.$$('div[role="button"]');
      for (const btn of buttons) {
        const text = await btn.evaluate(el => el.textContent);
        if (text && (text.includes('See all') || text.includes('results'))) {
          await btn.click();
          await new Promise(r => setTimeout(r, 3000));
          break;
        }
      }
    } catch {}

    // Scroll to load more ads
    let previousHeight = 0;
    let noChangeCount = 0;

    for (let i = 0; i < maxScrolls; i++) {
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);

      if (currentHeight === previousHeight) {
        noChangeCount++;
        if (noChangeCount >= 3) {
          console.log('[WebScraper] No more content to load, stopping.');
          break;
        }
      } else {
        noChangeCount = 0;
      }

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
      previousHeight = currentHeight;

      const adCount = await page.evaluate(() =>
        document.querySelectorAll('a[href*="/ads/library/?id="]').length
      );
      console.log(`[WebScraper] Scroll ${i + 1}/${maxScrolls} — ${adCount} ad links found`);
    }

    // === Extract ads from the DOM ===
    const ads = await page.evaluate((brandId, brandName) => {
      const results = [];
      const seenIds = new Set();

      const adLinks = document.querySelectorAll('a[href*="/ads/library/?id="]');

      adLinks.forEach(link => {
        const href = link.getAttribute('href') || '';
        const idMatch = href.match(/[?&]id=(\d+)/);
        if (!idMatch) return;

        const libraryId = idMatch[1];
        if (seenIds.has(libraryId)) return;
        seenIds.add(libraryId);

        // Walk up to find ad card container
        let container = link;
        for (let i = 0; i < 20; i++) {
          if (!container.parentElement) break;
          container = container.parentElement;
          const rect = container.getBoundingClientRect();
          if (rect.height > 200 && container.children.length >= 2) break;
        }

        const textContent = container.innerText || '';
        const lines = textContent.split('\n').map(l => l.trim()).filter(Boolean);

        // Extract copy text (longest meaningful lines)
        const uiLabels = ['See ad details', 'Active', 'Inactive', 'Started running on',
          'About this ad', 'See why', 'Social issues', 'Disclaimer', 'See summary',
          'Library ID', 'Platforms', 'Facebook', 'Instagram', 'Messenger'];

        const contentLines = lines.filter(line =>
          line.length >= 10 && !uiLabels.some(label => line.startsWith(label))
        );

        const copyText = contentLines
          .sort((a, b) => b.length - a.length)
          .slice(0, 3)
          .join(' ')
          .substring(0, 500);

        // Extract date
        let adCreationTime = null;
        const datePatterns = [
          /Started running on\s+(\w+ \d{1,2},?\s*\d{4})/i,
          /Started running on\s+(\d{1,2}\s+\w+\s+\d{4})/i,
        ];
        for (const pattern of datePatterns) {
          const match = textContent.match(pattern);
          if (match) {
            try {
              const parsed = new Date(match[1].trim());
              if (!isNaN(parsed.getTime())) {
                adCreationTime = parsed.toISOString();
                break;
              }
            } catch {}
          }
        }

        // Active/Inactive
        const isActive = !textContent.toLowerCase().includes('inactive');

        // Thumbnail
        const imgs = container.querySelectorAll('img');
        let thumbnailUrl = null;
        for (const img of imgs) {
          const src = img.getAttribute('src') || '';
          if ((src.includes('scontent') || src.includes('fbcdn')) &&
              !src.includes('emoji') && img.width > 50) {
            thumbnailUrl = src;
            break;
          }
        }

        // Platforms
        const platforms = [];
        const lower = textContent.toLowerCase();
        if (lower.includes('facebook')) platforms.push('facebook');
        if (lower.includes('instagram')) platforms.push('instagram');
        if (lower.includes('messenger')) platforms.push('messenger');

        // Ad format
        const hasVideo = container.querySelector('video') !== null;
        const adFormat = hasVideo ? 'video' : thumbnailUrl ? 'image' : 'text';

        results.push({
          libraryId,
          brandName,
          adCreationTime,
          adFormat,
          copyText,
          thumbnailUrl,
          creativeUrl: `https://www.facebook.com/ads/library/?id=${libraryId}`,
          isActive,
          platforms,
          callToAction: '',
          creativeId: null,
          firstSeenAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        });
      });

      return results;
    }, brandId, brandName);

    console.log(`[WebScraper] ✅ Extracted ${ads.length} unique ads`);

    if (ads.length > 0) {
      const result = upsertAds(brandId, ads);
      return {
        ads, count: ads.length, total: result.total,
        method: 'web-scrape', url, pageTitle, pageUrl,
      };
    }

    return {
      ads: [], count: 0, total: 0,
      method: 'web-scrape', url,
      debug: { pageTitle, pageUrl, env: IS_VERCEL ? 'vercel' : 'local', ...debugInfo },
    };

  } finally {
    await browser.close();
  }
}

/**
 * Check if web scraping is available
 */
function isWebScrapeAvailable() {
  if (IS_VERCEL) {
    try { require.resolve('@sparticuz/chromium'); return true; } catch { return false; }
  }
  try { require.resolve('puppeteer'); return true; } catch {
    try { require.resolve('puppeteer-core'); return true; } catch { return false; }
  }
}

module.exports = {
  scrapeAdLibraryPage,
  isWebScrapeAvailable,
};
