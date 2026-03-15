// === AdLibrarySpy — JSON File Storage ===
const fs = require('fs');
const path = require('path');
const { BRANDS_DIR, SNAPSHOTS_DIR, THUMBNAILS_DIR } = require('./config');

// --- Brand data ---

/**
 * Get all tracked brands.
 */
function getBrands() {
  if (!fs.existsSync(BRANDS_DIR)) return [];
  return fs.readdirSync(BRANDS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(BRANDS_DIR, f), 'utf8'));
        return {
          id: f.replace('.json', ''),
          name: data.name,
          pageId: data.pageId,
          adsCount: (data.ads || []).length,
          creativesCount: new Set((data.ads || []).map(a => a.creativeId).filter(Boolean)).size,
          lastScraped: data.lastScraped || null,
        };
      } catch { return null; }
    })
    .filter(Boolean);
}

/**
 * Get or create brand data file.
 */
function getBrandData(brandId) {
  const filePath = path.join(BRANDS_DIR, `${brandId}.json`);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return { name: brandId, pageId: '', ads: [], lastScraped: null };
}

/**
 * Save brand data.
 */
function saveBrandData(brandId, data) {
  const filePath = path.join(BRANDS_DIR, `${brandId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * Delete brand data.
 */
function deleteBrand(brandId) {
  const filePath = path.join(BRANDS_DIR, `${brandId}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

/**
 * Add or update ads for a brand. Merges by library_id.
 */
function upsertAds(brandId, newAds) {
  const data = getBrandData(brandId);
  const existing = new Map((data.ads || []).map(a => [a.libraryId, a]));

  for (const ad of newAds) {
    const prev = existing.get(ad.libraryId);
    if (prev) {
      // Update: keep first_seen, update last_seen
      existing.set(ad.libraryId, {
        ...prev,
        ...ad,
        firstSeenAt: prev.firstSeenAt || ad.firstSeenAt,
        lastSeenAt: ad.lastSeenAt || new Date().toISOString(),
      });
    } else {
      existing.set(ad.libraryId, {
        ...ad,
        firstSeenAt: ad.firstSeenAt || new Date().toISOString(),
        lastSeenAt: ad.lastSeenAt || new Date().toISOString(),
      });
    }
  }

  data.ads = Array.from(existing.values());
  data.lastScraped = new Date().toISOString();
  saveBrandData(brandId, data);

  return { total: data.ads.length, new: newAds.length - [...existing.keys()].filter(k => data.ads.find(a => a.libraryId === k)).length };
}

// --- Snapshots (weekly tracking) ---

/**
 * Save a snapshot of current state for a brand.
 */
function saveSnapshot(brandId) {
  const data = getBrandData(brandId);
  const week = getWeekId();
  const snapPath = path.join(SNAPSHOTS_DIR, `${brandId}_${week}.json`);

  const snapshot = {
    brandId,
    week,
    timestamp: new Date().toISOString(),
    totalAds: data.ads.length,
    activeAds: data.ads.filter(a => a.isActive).length,
    creatives: groupByCreative(data.ads),
  };

  fs.writeFileSync(snapPath, JSON.stringify(snapshot, null, 2));
  return snapshot;
}

/**
 * Get all snapshots for a brand.
 */
function getSnapshots(brandId) {
  if (!fs.existsSync(SNAPSHOTS_DIR)) return [];
  return fs.readdirSync(SNAPSHOTS_DIR)
    .filter(f => f.startsWith(`${brandId}_`) && f.endsWith('.json'))
    .map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR, f), 'utf8'));
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => a.week.localeCompare(b.week));
}

// --- Helpers ---

function getWeekId() {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((now - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Group ads by creativeId and count variants.
 */
function groupByCreative(ads) {
  const groups = {};
  for (const ad of ads) {
    const cid = ad.creativeId || 'unknown';
    if (!groups[cid]) {
      groups[cid] = {
        creativeId: cid,
        variantsCount: 0,
        ads: [],
        isActive: false,
        firstSeen: null,
        lastSeen: null,
      };
    }
    groups[cid].variantsCount++;
    groups[cid].ads.push(ad.libraryId);
    if (ad.isActive) groups[cid].isActive = true;
    if (!groups[cid].firstSeen || ad.firstSeenAt < groups[cid].firstSeen) {
      groups[cid].firstSeen = ad.firstSeenAt;
    }
    if (!groups[cid].lastSeen || ad.lastSeenAt > groups[cid].lastSeen) {
      groups[cid].lastSeen = ad.lastSeenAt;
    }
  }
  return Object.values(groups);
}

// --- Thumbnail cache ---

function saveThumbnail(brandId, hash, buffer) {
  const dir = path.join(THUMBNAILS_DIR, brandId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${hash}.jpg`);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, buffer);
  }
  return filePath;
}

function getThumbnailPath(brandId, hash) {
  return path.join(THUMBNAILS_DIR, brandId, `${hash}.jpg`);
}

module.exports = {
  getBrands,
  getBrandData,
  saveBrandData,
  deleteBrand,
  upsertAds,
  saveSnapshot,
  getSnapshots,
  groupByCreative,
  saveThumbnail,
  getThumbnailPath,
  getWeekId,
};
