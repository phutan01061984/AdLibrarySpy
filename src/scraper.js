// === AdLibrarySpy — Meta Ad Library Scraper ===
const { getSettings } = require('./config');
const { hashFromUrl } = require('./hasher');
const { upsertAds, saveThumbnail } = require('./storage');

const GRAPH_API_BASE = 'https://graph.facebook.com/v19.0';

/**
 * Scrape ads from Meta Ad Library API for a given page.
 *
 * @param {string} pageId — Facebook Page ID
 * @param {string} brandId — Internal brand identifier
 * @param {object} options — { country, limit, after }
 * @returns {Promise<{ ads: Array, paging: object }>}
 */
async function scrapeFromApi(pageId, brandId, options = {}) {
  const settings = getSettings();
  const token = settings.facebookAccessToken;

  if (!token) {
    throw new Error('Facebook Access Token is not configured. Go to Settings → paste your token.');
  }

  const country = options.country || settings.defaultCountry || 'VN';
  const limit = options.limit || 200;

  const params = new URLSearchParams({
    access_token: token,
    search_page_ids: pageId,
    ad_reached_countries: country,
    ad_type: 'ALL',
    fields: [
      'id',
      'ad_snapshot_url',
      'ad_creation_time',
      'ad_creative_bodies',
      'ad_creative_link_captions',
      'ad_creative_link_descriptions',
      'ad_creative_link_titles',
      'page_name',
      'publisher_platforms',
      'estimated_audience_size',
      'languages',
      'impressions',
      'spend',
      'currency',
      'bylines',
    ].join(','),
    limit: String(limit),
  });

  if (options.after) {
    params.set('after', options.after);
  }

  const url = `${GRAPH_API_BASE}/ads_archive?${params}`;
  console.log(`[Scraper] Fetching ads for page ${pageId} (brand: ${brandId})...`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'AdLibrarySpy/1.0',
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Scraper] API error ${response.status}:`, errorBody);
    throw new Error(`Facebook API returned ${response.status}: ${errorBody.substring(0, 200)}`);
  }

  const result = await response.json();
  const rawAds = result.data || [];
  const paging = result.paging || {};

  console.log(`[Scraper] Got ${rawAds.length} ads from API`);

  // Transform and hash each ad
  const processedAds = [];
  let hashSuccessCount = 0;

  for (const raw of rawAds) {
    const ad = {
      libraryId: raw.id,
      brandName: raw.page_name || brandId,
      adCreationTime: raw.ad_creation_time || null,
      adFormat: detectFormat(raw),
      adSnapshotUrl: raw.ad_snapshot_url || null,
      callToAction: extractCta(raw),
      copyText: (raw.ad_creative_bodies || []).join(' ') || '',
      linkTitle: (raw.ad_creative_link_titles || []).join(' ') || '',
      linkCaption: (raw.ad_creative_link_captions || []).join(' ') || '',
      linkDescription: (raw.ad_creative_link_descriptions || []).join(' ') || '',
      platforms: raw.publisher_platforms || [],
      estimatedAudience: raw.estimated_audience_size || null,
      languages: raw.languages || [],
      impressions: raw.impressions || null,
      spend: raw.spend || null,
      currency: raw.currency || null,
      thumbnailUrl: null, // Will be set if we can extract from snapshot
      creativeId: null,   // Will be set after hashing
      creativeUrl: `https://www.facebook.com/ads/library/?id=${raw.id}`,
      isActive: true,     // Assume active when scraping from API
      firstSeenAt: null,  // Set by storage.upsertAds
      lastSeenAt: null,   // Set by storage.upsertAds
    };

    processedAds.push(ad);
  }

  // Save to storage
  if (processedAds.length > 0) {
    const result = upsertAds(brandId, processedAds);
    console.log(`[Scraper] Saved ${result.total} total ads for ${brandId}`);
  }

  return {
    ads: processedAds,
    count: processedAds.length,
    hasMore: !!paging.next,
    afterCursor: paging.cursors?.after || null,
    hashSuccess: hashSuccessCount,
  };
}

/**
 * Hash thumbnails for all unhashed ads of a brand.
 * Called separately because hashing is slow (network + CPU).
 */
async function hashBrandThumbnails(brandId, ads) {
  let hashed = 0;
  let failed = 0;

  for (const ad of ads) {
    if (ad.creativeId) continue; // Already hashed
    if (!ad.thumbnailUrl && !ad.adSnapshotUrl) continue; // No image to hash

    const urlToHash = ad.thumbnailUrl || ad.adSnapshotUrl;

    try {
      const result = await hashFromUrl(urlToHash);
      if (result) {
        ad.creativeId = `${brandId}-${result.hash}`;
        saveThumbnail(brandId, result.hash, result.buffer);
        hashed++;
      } else {
        failed++;
      }
    } catch (e) {
      console.error(`[Scraper] Hash failed for ${ad.libraryId}: ${e.message}`);
      failed++;
    }

    // Rate limit: 100ms between requests
    await new Promise(r => setTimeout(r, 100));
  }

  return { hashed, failed };
}

/**
 * Import ads manually from JSON data (e.g., copy-pasted from browser).
 * Supports the format from the screenshot's pivot table.
 */
function importManualData(brandId, adsData) {
  const processed = adsData.map(ad => ({
    libraryId: ad.library_id || ad.libraryId || extractIdFromUrl(ad.creative_url || ad.creativeUrl) || `manual-${Date.now()}`,
    brandName: ad.brand_name || ad.brandName || brandId,
    adCreationTime: ad.ad_creation_time || ad.adCreationTime || null,
    adFormat: ad.ad_format || ad.adFormat || 'unknown',
    adSnapshotUrl: ad.ad_snapshot_url || ad.adSnapshotUrl || null,
    callToAction: ad.call_to_action || ad.callToAction || '',
    copyText: ad.copy_text || ad.copyText || '',
    thumbnailUrl: ad.thumbnail_url || ad.thumbnailUrl || null,
    creativeId: ad.creative_id || ad.creativeId || null,
    creativeUrl: ad.creative_url || ad.creativeUrl || null,
    isActive: ad.is_active !== undefined ? ad.is_active : true,
    firstSeenAt: ad.first_seen_at || ad.firstSeenAt || new Date().toISOString(),
    lastSeenAt: ad.last_seen_at || ad.lastSeenAt || new Date().toISOString(),
  }));

  return upsertAds(brandId, processed);
}

// --- Helpers ---

function detectFormat(raw) {
  if (raw.ad_creative_link_titles?.length) return 'link';
  if (raw.ad_creative_bodies?.length) return 'image';
  return 'unknown';
}

function extractCta(raw) {
  // CTA is not directly in the API response; check link descriptions
  const desc = (raw.ad_creative_link_descriptions || []).join(' ').toLowerCase();
  if (desc.includes('shop now')) return 'SHOP_NOW';
  if (desc.includes('learn more')) return 'LEARN_MORE';
  if (desc.includes('sign up')) return 'SIGN_UP';
  if (desc.includes('contact us')) return 'CONTACT_US';
  if (desc.includes('book now')) return 'BOOK_NOW';
  if (desc.includes('download')) return 'DOWNLOAD';
  return '';
}

function extractIdFromUrl(url) {
  if (!url) return null;
  const match = url.match(/[?&]id=(\d+)/);
  return match ? match[1] : null;
}

module.exports = {
  scrapeFromApi,
  hashBrandThumbnails,
  importManualData,
};
