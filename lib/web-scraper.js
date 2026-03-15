// === AdLibrarySpy — Web Scraper (No API Token Needed) ===
// Scrapes facebook.com/ads/library directly using headless browser
const { upsertAds } = require('./storage');

let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch {
  try {
    puppeteer = require('puppeteer-core');
  } catch {
    // Not installed
  }
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
  if (!puppeteer) {
    throw new Error(
      'Puppeteer not installed. Run: npm install puppeteer\n' +
      'Note: Web scraping only works locally, not on Vercel.'
    );
  }

  const {
    country = 'VN',
    pageId = null,
    maxScrolls = 15,
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
  console.log(`[WebScraper] Will scroll ${maxScrolls} times to load ads...`);

  const browser = await puppeteer.launch({
    headless: headless ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1400,900',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    });
    // Mimic real browser
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    // Navigate
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Wait for content to render
    console.log('[WebScraper] Page loaded, waiting for ads to render...');
    await new Promise(r => setTimeout(r, 4000));

    // Check if we got a cookie consent dialog and dismiss it
    try {
      const cookieBtn = await page.$('button[data-cookiebanner="accept_button"]');
      if (cookieBtn) {
        await cookieBtn.click();
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch {}

    // Check for "See all" or "See results" button and click
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
          console.log('[WebScraper] No more content to load, stopping scroll.');
          break;
        }
      } else {
        noChangeCount = 0;
      }

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
      previousHeight = currentHeight;

      // Count current ads
      const adCount = await page.evaluate(() => {
        return document.querySelectorAll('a[href*="/ads/library/?id="]').length;
      });
      console.log(`[WebScraper] Scroll ${i + 1}/${maxScrolls} — ${adCount} ad links found`);

      // Click "See more" buttons if any
      try {
        const seeMoreBtns = await page.$$('div[role="button"]');
        for (const btn of seeMoreBtns) {
          const text = await btn.evaluate(el => el.textContent?.trim());
          if (text === 'See more') {
            await btn.click().catch(() => {});
          }
        }
      } catch {}
    }

    // === Extract ads from the DOM ===
    const ads = await page.evaluate((brandId, brandName) => {
      const results = [];
      const seenIds = new Set();

      // Strategy: Find all links to individual ad pages → each link = one ad
      const adLinks = document.querySelectorAll('a[href*="/ads/library/?id="]');

      adLinks.forEach(link => {
        const href = link.getAttribute('href') || '';
        const idMatch = href.match(/[?&]id=(\d+)/);
        if (!idMatch) return;

        const libraryId = idMatch[1];
        if (seenIds.has(libraryId)) return;
        seenIds.add(libraryId);

        // Walk up to find the ad card container (try to find a good ancestor)
        let container = link;
        for (let i = 0; i < 20; i++) {
          if (!container.parentElement) break;
          container = container.parentElement;
          // Stop at a reasonable container (has multiple children, significant height)
          const rect = container.getBoundingClientRect();
          if (rect.height > 200 && container.children.length >= 2) break;
        }

        const textContent = container.innerText || '';
        const lines = textContent.split('\n').map(l => l.trim()).filter(Boolean);

        // === Extract copy text ===
        // Usually the longest text block, excluding dates and UI labels
        const uiLabels = ['See ad details', 'Active', 'Inactive', 'Started running on',
          'About this ad', 'See why', 'Social issues', 'Disclaimer', 'See summary',
          'Library ID', 'Platforms', 'Facebook', 'Instagram', 'Messenger'];

        const contentLines = lines.filter(line => {
          if (line.length < 10) return false;
          return !uiLabels.some(label => line.startsWith(label));
        });

        const copyText = contentLines
          .sort((a, b) => b.length - a.length)
          .slice(0, 3)
          .join(' ')
          .substring(0, 500);

        // === Extract date ===
        let adCreationTime = null;
        const datePatterns = [
          /Started running on\s+(\w+ \d{1,2},?\s*\d{4})/i,
          /Started running on\s+(\d{1,2}\s+\w+\s+\d{4})/i,
          /(\w{3}\s+\d{1,2},?\s*\d{4})/,
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

        // === Detect active/inactive ===
        const isActive = !textContent.toLowerCase().includes('inactive');

        // === Find thumbnail ===
        const imgs = container.querySelectorAll('img');
        let thumbnailUrl = null;
        for (const img of imgs) {
          const src = img.getAttribute('src') || '';
          // Skip profile pics (usually small) and icons
          if ((src.includes('scontent') || src.includes('fbcdn')) &&
              !src.includes('emoji') && img.width > 50) {
            thumbnailUrl = src;
            break;
          }
        }

        // === Detect platforms ===
        const platforms = [];
        const lowerText = textContent.toLowerCase();
        if (lowerText.includes('facebook')) platforms.push('facebook');
        if (lowerText.includes('instagram')) platforms.push('instagram');
        if (lowerText.includes('messenger')) platforms.push('messenger');
        if (lowerText.includes('audience network')) platforms.push('audience_network');

        // === Detect ad format ===
        const hasVideo = container.querySelector('video') !== null;
        const hasCarousel = textContent.includes('carousel') ||
          container.querySelectorAll('img[src*="scontent"]').length > 2;
        const adFormat = hasVideo ? 'video' : hasCarousel ? 'carousel' : thumbnailUrl ? 'image' : 'text';

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
          creativeId: null, // Set after hashing
          firstSeenAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        });
      });

      return results;
    }, brandId, brandName);

    console.log(`[WebScraper] ✅ Extracted ${ads.length} unique ads`);

    // Save to storage
    if (ads.length > 0) {
      const result = upsertAds(brandId, ads);
      console.log(`[WebScraper] Saved → ${result.total} total ads for ${brandId}`);
      return {
        ads,
        count: ads.length,
        total: result.total,
        method: 'web-scrape',
        url,
      };
    }

    return { ads: [], count: 0, total: 0, method: 'web-scrape', url };

  } finally {
    await browser.close();
    console.log('[WebScraper] Browser closed.');
  }
}

/**
 * Check if web scraping is available (Puppeteer installed)
 */
function isWebScrapeAvailable() {
  return !!puppeteer;
}

module.exports = {
  scrapeAdLibraryPage,
  isWebScrapeAvailable,
};
