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

      const adCount = await page.evaluate(() => {
        const text = document.body.innerText || '';
        return (text.match(/Library ID:\s*\d+/g) || []).length;
      });
      console.log(`[WebScraper] Scroll ${i + 1}/${maxScrolls} — ${adCount} ads (by Library ID text)`);
    }

    // === Extract ads from the DOM ===
    // Strategy: DOM ancestor traversal — find container for each Library ID, 
    // then search for images WITHIN that container. This works regardless of scroll position.
    const ads = await page.evaluate((brandId, brandName) => {
      const results = [];
      const seenIds = new Set();

      // Helper: find the ad card container for a given element
      function findAdContainer(el) {
        let current = el;
        let lastGoodContainer = el;
        for (let depth = 0; depth < 30 && current && current !== document.body; depth++) {
          current = current.parentElement;
          if (!current) break;
          const w = current.offsetWidth || 0;
          const h = current.offsetHeight || 0;
          if (w > 800 && h > 1000) break;
          if (w > 200 && h > 150) {
            lastGoodContainer = current;
          }
        }
        return lastGoodContainer;
      }

      // Helper: find images within a container element
      function findImagesInContainer(container) {
        const imgs = Array.from(container.querySelectorAll('img'));
        return imgs
          .map(img => ({
            src: img.src || img.getAttribute('data-src') || img.getAttribute('srcset')?.split(' ')[0] || '',
            width: img.naturalWidth || img.width || img.offsetWidth || 0,
            height: img.naturalHeight || img.height || img.offsetHeight || 0,
          }))
          .filter(img => {
            if (!img.src) return false;
            if (img.src.includes('emoji')) return false;
            if (img.src.includes('/rsrc.php')) return false;
            if (img.src.includes('static.xx.fbcdn')) return false;
            if (img.src.includes('data:image')) return false;
            if (img.width < 40 && img.height < 40) return false;
            return true;
          })
          .sort((a, b) => (b.width * b.height) - (a.width * a.height));
      }

      // Helper: find videos within a container
      function findVideosInContainer(container) {
        return Array.from(container.querySelectorAll('video')).map(v => ({
          poster: v.poster || '',
          src: v.src || v.querySelector('source')?.src || '',
        }));
      }

      // Find all text nodes containing "Library ID:" and map to containers
      const textNodesXpath = document.evaluate(
        '//text()[contains(., "Library ID:")]',
        document.body, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
      );

      const adMap = {};
      for (let i = 0; i < textNodesXpath.snapshotLength; i++) {
        const node = textNodesXpath.snapshotItem(i);
        const text = node.textContent || '';
        const match = text.match(/Library ID:\s*(\d+)/);
        if (match && node.parentElement) {
          const libraryId = match[1];
          if (!adMap[libraryId]) {
            adMap[libraryId] = { container: findAdContainer(node.parentElement) };
          }
        }
      }

      // Use text-based parsing for metadata
      const bodyText = document.body.innerText || '';
      const adBlocks = bodyText.split(/(?=(?:Active|Inactive)\s*\n*Library ID:)/);

      for (const block of adBlocks) {
        const idMatch = block.match(/Library ID:\s*(\d+)/);
        if (!idMatch) continue;

        const libraryId = idMatch[1];
        if (seenIds.has(libraryId)) continue;
        seenIds.add(libraryId);

        const lines = block.split('\n').map(l => l.trim()).filter(Boolean);

        // Active/Inactive
        const isActive = !block.match(/^Inactive/i) && !block.includes('Inactive\nLibrary ID');

        // Date
        let adCreationTime = null;
        const dateMatch = block.match(/(\w{3}\s+\d{1,2},?\s*\d{4})\s*[-–]/);
        if (dateMatch) {
          try {
            const parsed = new Date(dateMatch[1]);
            if (!isNaN(parsed.getTime())) adCreationTime = parsed.toISOString();
          } catch {}
        }

        // Variants count
        let variantsCount = 1;
        const variantMatch = block.match(/(\d+)\s+ads?\s+use\s+this\s+creative/i);
        if (variantMatch) variantsCount = parseInt(variantMatch[1]);

        // Brand name
        let adBrandName = brandName;
        const sponsoredIdx = lines.findIndex(l => l === 'Sponsored');
        if (sponsoredIdx > 0) {
          adBrandName = lines[sponsoredIdx - 1] || brandName;
        }

        // Copy text
        const uiLabels = ['See ad details', 'See summary', 'Active', 'Inactive',
          'Library ID', 'Platforms', 'Open Dropdown', 'EU transparency',
          'Sponsored', 'ads use this creative', 'Started running'];
        
        const contentLines = lines.filter(l => {
          if (l.length < 10) return false;
          if (l.startsWith('Library ID')) return false;
          if (/^\w{3}\s+\d{1,2},\s*\d{4}/.test(l)) return false;
          return !uiLabels.some(label => l.includes(label));
        });
        const copyText = contentLines.join(' ').substring(0, 500);

        // Platforms
        const platforms = [];
        if (block.toLowerCase().includes('facebook')) platforms.push('facebook');
        if (block.toLowerCase().includes('instagram')) platforms.push('instagram');

        // === Find thumbnail using DOM container ===
        let thumbnailUrl = null;
        let adFormat = 'unknown';

        const adInfo = adMap[libraryId];
        if (adInfo && adInfo.container) {
          const containerImages = findImagesInContainer(adInfo.container);
          if (containerImages.length > 0) {
            thumbnailUrl = containerImages[0].src;
            adFormat = 'image';
          }
          const containerVideos = findVideosInContainer(adInfo.container);
          if (containerVideos.length > 0) {
            adFormat = 'video';
            if (!thumbnailUrl && containerVideos[0].poster) {
              thumbnailUrl = containerVideos[0].poster;
            }
          }
        }

        results.push({
          libraryId,
          brandName: adBrandName,
          adCreationTime,
          adFormat,
          copyText,
          thumbnailUrl,
          creativeUrl: `https://www.facebook.com/ads/library/?id=${libraryId}`,
          isActive,
          platforms,
          callToAction: '',
          creativeId: null,
          variantsCount,
          firstSeenAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        });
      }

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
