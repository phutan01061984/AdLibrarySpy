// === AdLibrarySpy — Creative Analyzer ===
const { getBrandData, groupByCreative, getSnapshots, getWeekId } = require('./storage');

/**
 * Analyze a brand's ad creatives and return intelligence summary.
 */
function analyzeBrand(brandId) {
  const data = getBrandData(brandId);
  const ads = data.ads || [];

  if (ads.length === 0) {
    return { brandId, totalAds: 0, message: 'No ads data. Scrape first.' };
  }

  const creatives = groupByCreative(ads);
  const activeAds = ads.filter(a => a.isActive);
  const inactiveAds = ads.filter(a => !a.isActive);

  // Top creatives by variant count (= "winning" ads)
  const topCreatives = creatives
    .sort((a, b) => b.variantsCount - a.variantsCount)
    .slice(0, 10);

  // Active creatives
  const activeCreatives = creatives.filter(c => c.isActive);

  // Recent creatives (last 7 days)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recentCreatives = creatives.filter(c => c.lastSeen > weekAgo);

  // Format distribution
  const formatDist = {};
  for (const ad of ads) {
    const fmt = ad.adFormat || 'unknown';
    formatDist[fmt] = (formatDist[fmt] || 0) + 1;
  }

  // Platform distribution
  const platformDist = {};
  for (const ad of ads) {
    for (const p of (ad.platforms || [])) {
      platformDist[p] = (platformDist[p] || 0) + 1;
    }
  }

  // Weekly trend
  const weeklyTrend = {};
  for (const ad of ads) {
    if (ad.adCreationTime) {
      const d = new Date(ad.adCreationTime);
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const wn = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
      const wk = `${d.getFullYear()}-W${String(wn).padStart(2, '0')}`;
      weeklyTrend[wk] = (weeklyTrend[wk] || 0) + 1;
    }
  }

  // Copy text analysis — most common words/phrases
  const wordFreq = {};
  for (const ad of ads) {
    if (ad.copyText) {
      const words = ad.copyText.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      for (const w of words) {
        wordFreq[w] = (wordFreq[w] || 0) + 1;
      }
    }
  }
  const topWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));

  return {
    brandId,
    brandName: data.name,
    lastScraped: data.lastScraped,
    totalAds: ads.length,
    activeAds: activeAds.length,
    inactiveAds: inactiveAds.length,
    totalCreatives: creatives.length,
    activeCreatives: activeCreatives.length,
    topCreatives,
    recentCreatives: recentCreatives.length,
    formatDistribution: formatDist,
    platformDistribution: platformDist,
    weeklyTrend,
    topWords,
    currentWeek: getWeekId(),
  };
}

/**
 * Get pivot table data with flexible grouping and sorting.
 *
 * @param {string} brandId
 * @param {object} options — { groupBy, sortBy, sortOrder, filterActive }
 */
function getPivotData(brandId, options = {}) {
  const data = getBrandData(brandId);
  let ads = data.ads || [];

  // Filter
  if (options.filterActive === 'true' || options.filterActive === true) {
    ads = ads.filter(a => a.isActive);
  }
  if (options.filterActive === 'false') {
    ads = ads.filter(a => !a.isActive);
  }

  // Text search
  if (options.search) {
    const q = options.search.toLowerCase();
    ads = ads.filter(a =>
      (a.copyText || '').toLowerCase().includes(q) ||
      (a.linkTitle || '').toLowerCase().includes(q) ||
      (a.brandName || '').toLowerCase().includes(q) ||
      (a.creativeId || '').toLowerCase().includes(q)
    );
  }

  const groupBy = options.groupBy || 'none';
  const sortBy = options.sortBy || 'adCreationTime';
  const sortOrder = options.sortOrder || 'desc';

  // Group
  if (groupBy === 'creative') {
    const groups = {};
    for (const ad of ads) {
      const key = ad.creativeId || 'ungrouped';
      if (!groups[key]) {
        groups[key] = {
          creativeId: key,
          brandName: ad.brandName,
          variantsCount: 0,
          ads: [],
          isActive: false,
          creativeUrls: [],
        };
      }
      groups[key].variantsCount++;
      groups[key].ads.push(ad);
      if (ad.isActive) groups[key].isActive = true;
      if (ad.creativeUrl) groups[key].creativeUrls.push(ad.creativeUrl);
    }

    let result = Object.values(groups);

    // Sort groups
    if (sortBy === 'variantsCount') {
      result.sort((a, b) => sortOrder === 'desc'
        ? b.variantsCount - a.variantsCount
        : a.variantsCount - b.variantsCount);
    } else if (sortBy === 'creativeId') {
      result.sort((a, b) => sortOrder === 'desc'
        ? b.creativeId.localeCompare(a.creativeId)
        : a.creativeId.localeCompare(b.creativeId));
    }

    return { groupBy, rows: result, totalGroups: result.length, totalAds: ads.length };
  }

  if (groupBy === 'week') {
    const groups = {};
    for (const ad of ads) {
      let week = 'unknown';
      if (ad.adCreationTime) {
        const d = new Date(ad.adCreationTime);
        const jan1 = new Date(d.getFullYear(), 0, 1);
        const wn = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
        week = `${d.getFullYear()}-W${String(wn).padStart(2, '0')}`;
      }
      if (!groups[week]) {
        groups[week] = { week, ads: [], count: 0 };
      }
      groups[week].ads.push(ad);
      groups[week].count++;
    }

    let result = Object.values(groups);
    result.sort((a, b) => sortOrder === 'desc'
      ? b.week.localeCompare(a.week)
      : a.week.localeCompare(b.week));

    return { groupBy, rows: result, totalGroups: result.length, totalAds: ads.length };
  }

  // No grouping — flat list
  ads.sort((a, b) => {
    const aVal = a[sortBy] || '';
    const bVal = b[sortBy] || '';
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    }
    return sortOrder === 'desc'
      ? String(bVal).localeCompare(String(aVal))
      : String(aVal).localeCompare(String(bVal));
  });

  // Pagination
  const page = parseInt(options.page) || 1;
  const pageSize = parseInt(options.pageSize) || 50;
  const start = (page - 1) * pageSize;
  const paged = ads.slice(start, start + pageSize);

  return {
    groupBy: 'none',
    rows: paged,
    total: ads.length,
    page,
    pageSize,
    totalPages: Math.ceil(ads.length / pageSize),
  };
}

/**
 * Compare two brands' ad strategies.
 */
function compareBrands(brandId1, brandId2) {
  const analysis1 = analyzeBrand(brandId1);
  const analysis2 = analyzeBrand(brandId2);

  return {
    brand1: analysis1,
    brand2: analysis2,
    comparison: {
      adCountDiff: analysis1.totalAds - analysis2.totalAds,
      creativeDiff: analysis1.totalCreatives - analysis2.totalCreatives,
      moreActive: analysis1.activeAds > analysis2.activeAds ? brandId1 : brandId2,
      topCreative1: analysis1.topCreatives?.[0]?.creativeId || null,
      topCreative2: analysis2.topCreatives?.[0]?.creativeId || null,
    },
  };
}

module.exports = {
  analyzeBrand,
  getPivotData,
  compareBrands,
};
