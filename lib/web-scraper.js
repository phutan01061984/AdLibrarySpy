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
    // Strategy: Use both text parsing AND DOM traversal to capture images
    const ads = await page.evaluate((brandId, brandName) => {
      const results = [];
      const seenIds = new Set();

      // First, collect all images on the page with their positions
      const allImages = Array.from(document.querySelectorAll('img')).map(img => ({
        src: img.src || img.getAttribute('data-src') || '',
        rect: img.getBoundingClientRect(),
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0,
      })).filter(img => {
        // Filter out tiny icons, avatars, logos
        if (!img.src) return false;
        if (img.src.includes('emoji') || img.src.includes('rsrc') || img.src.includes('static')) return false;
        if (img.width < 50 && img.height < 50) return false;
        return true;
      });

      // Also find video elements
      const allVideos = Array.from(document.querySelectorAll('video')).map(v => ({
        poster: v.poster || '',
        src: v.src || v.querySelector('source')?.src || '',
        rect: v.getBoundingClientRect(),
      }));

      // Find all elements that contain "Library ID:" text
      const bodyText = document.body.innerText || '';
      const adBlocks = bodyText.split(/(?=(?:Active|Inactive)\s*\n*Library ID:)/);

      // Also try to find ad card containers
      // Facebook Ad Library uses specific data attributes and class patterns
      const adContainers = document.querySelectorAll('[class*="x1lliihq"], [class*="xjbqb8w"]');
      
      // Build a map of Library ID -> DOM element position
      const idPositions = {};
      const allTextNodes = document.evaluate(
        '//text()[contains(., "Library ID:")]',
        document.body, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
      );
      
      for (let i = 0; i < allTextNodes.snapshotLength; i++) {
        const node = allTextNodes.snapshotItem(i);
        const text = node.textContent || '';
        const match = text.match(/Library ID:\s*(\d+)/);
        if (match) {
          const el = node.parentElement;
          if (el) {
            const rect = el.getBoundingClientRect();
            idPositions[match[1]] = { y: rect.top, el };
          }
        }
      }

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

        // === Find thumbnail image for this ad ===
        let thumbnailUrl = null;
        let adFormat = 'unknown';
        
        const pos = idPositions[libraryId];
        if (pos) {
          const adY = pos.y;
          
          // Find images within ~600px above this Library ID position
          // (ad image is usually above the Library ID text)
          const nearbyImages = allImages.filter(img => {
            const imgCenter = img.rect.top + img.rect.height / 2;
            return imgCenter > (adY - 600) && imgCenter < adY &&
                   img.rect.width > 80 && img.rect.height > 80;
          });

          if (nearbyImages.length > 0) {
            // Pick the largest image closest to the ad
            nearbyImages.sort((a, b) => {
              const aSize = a.width * a.height;
              const bSize = b.width * b.height;
              return bSize - aSize;
            });
            thumbnailUrl = nearbyImages[0].src;
            adFormat = 'image';
          }

          // Check for videos near this ad
          const nearbyVideos = allVideos.filter(v => {
            const vCenter = v.rect.top + v.rect.height / 2;
            return vCenter > (adY - 600) && vCenter < adY;
          });

          if (nearbyVideos.length > 0) {
            adFormat = 'video';
            if (!thumbnailUrl && nearbyVideos[0].poster) {
              thumbnailUrl = nearbyVideos[0].poster;
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
