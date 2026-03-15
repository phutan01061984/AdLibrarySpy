// === AdLibrarySpy — Express API Routes ===
const express = require('express');
const path = require('path');
const fs = require('fs');
const { getSettings, saveSettings, THUMBNAILS_DIR } = require('./config');
const { getBrands, getBrandData, saveBrandData, deleteBrand, saveSnapshot, getSnapshots } = require('./storage');
const { scrapeFromApi, hashBrandThumbnails, importManualData } = require('./scraper');
const { analyzeBrand, getPivotData, compareBrands } = require('./analyzer');
const { hashFromUrl } = require('./hasher');

function setupRoutes(app) {

  // === Settings ===
  app.get('/api/settings', (req, res) => {
    const settings = getSettings();
    // Mask token for security
    if (settings.facebookAccessToken) {
      settings.facebookAccessTokenMasked = settings.facebookAccessToken.substring(0, 10) + '***';
    }
    res.json(settings);
  });

  app.post('/api/settings', (req, res) => {
    try {
      const updated = saveSettings(req.body);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // === Brands ===
  app.get('/api/brands', (req, res) => {
    res.json(getBrands());
  });

  app.post('/api/brands', (req, res) => {
    const { name, pageId } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const brandId = name.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
    const data = getBrandData(brandId);
    data.name = name;
    data.pageId = pageId || '';
    if (!data.ads) data.ads = [];
    saveBrandData(brandId, data);

    res.json({ brandId, name, pageId: pageId || '' });
  });

  app.delete('/api/brands/:id', (req, res) => {
    const deleted = deleteBrand(req.params.id);
    res.json({ deleted });
  });

  // === Scraping ===
  app.post('/api/scrape/:brandId', async (req, res) => {
    const { brandId } = req.params;
    const data = getBrandData(brandId);

    if (!data.pageId) {
      return res.status(400).json({ error: 'Brand has no pageId configured. Edit brand first.' });
    }

    try {
      const result = await scrapeFromApi(data.pageId, brandId, {
        country: req.body.country,
        limit: req.body.limit,
        after: req.body.after,
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Hash thumbnails for a brand
  app.post('/api/hash/:brandId', async (req, res) => {
    const { brandId } = req.params;
    const data = getBrandData(brandId);

    if (!data.ads || data.ads.length === 0) {
      return res.status(400).json({ error: 'No ads to hash. Scrape or import data first.' });
    }

    try {
      const result = await hashBrandThumbnails(brandId, data.ads);
      saveBrandData(brandId, data); // Save updated creativeIds
      res.json({ ...result, totalAds: data.ads.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Hash a single URL (for testing)
  app.post('/api/hash-url', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });

    try {
      const result = await hashFromUrl(url);
      if (result) {
        res.json({ hash: result.hash, size: result.size });
      } else {
        res.status(500).json({ error: 'Failed to hash image' });
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // === Import (manual data) ===
  app.post('/api/import/:brandId', (req, res) => {
    const { brandId } = req.params;
    const { ads } = req.body;

    if (!ads || !Array.isArray(ads)) {
      return res.status(400).json({ error: 'ads array is required' });
    }

    try {
      const result = importManualData(brandId, ads);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // === Ads Data ===
  app.get('/api/ads/:brandId', (req, res) => {
    const data = getBrandData(req.params.brandId);
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 50;
    const start = (page - 1) * pageSize;

    let ads = data.ads || [];

    // Filter by active status
    if (req.query.active === 'true') ads = ads.filter(a => a.isActive);
    if (req.query.active === 'false') ads = ads.filter(a => !a.isActive);

    // Sort
    const sortBy = req.query.sortBy || 'lastSeenAt';
    const sortOrder = req.query.sortOrder || 'desc';
    ads.sort((a, b) => {
      const aVal = a[sortBy] || '';
      const bVal = b[sortBy] || '';
      return sortOrder === 'desc'
        ? String(bVal).localeCompare(String(aVal))
        : String(aVal).localeCompare(String(bVal));
    });

    res.json({
      total: ads.length,
      page,
      pageSize,
      ads: ads.slice(start, start + pageSize),
    });
  });

  // === Pivot Table ===
  app.get('/api/pivot/:brandId', (req, res) => {
    try {
      const result = getPivotData(req.params.brandId, req.query);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // === Analysis ===
  app.get('/api/analysis/:brandId', (req, res) => {
    try {
      const result = analyzeBrand(req.params.brandId);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Compare two brands
  app.get('/api/compare', (req, res) => {
    const { brand1, brand2 } = req.query;
    if (!brand1 || !brand2) {
      return res.status(400).json({ error: 'brand1 and brand2 query params required' });
    }
    try {
      res.json(compareBrands(brand1, brand2));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // === Snapshots ===
  app.post('/api/snapshots/:brandId', (req, res) => {
    try {
      const snapshot = saveSnapshot(req.params.brandId);
      res.json(snapshot);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/snapshots/:brandId', (req, res) => {
    res.json(getSnapshots(req.params.brandId));
  });

  // === Thumbnails (serve cached images) ===
  app.use('/api/thumbnails', express.static(THUMBNAILS_DIR));

  // === Status ===
  app.get('/api/status', (req, res) => {
    const brands = getBrands();
    const settings = getSettings();
    res.json({
      status: 'ok',
      version: '1.0.0',
      brands: brands.length,
      totalAds: brands.reduce((sum, b) => sum + b.adsCount, 0),
      hasToken: !!settings.facebookAccessToken,
    });
  });
}

module.exports = { setupRoutes };
