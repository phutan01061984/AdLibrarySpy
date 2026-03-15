// === AdLibrarySpy — Configuration (Vercel-compatible) ===
const fs = require('fs');
const path = require('path');

// On Vercel, filesystem is read-only except /tmp
const IS_VERCEL = !!process.env.VERCEL;
const ROOT = IS_VERCEL ? '/tmp/adlibraryspy' : process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const BRANDS_DIR = path.join(DATA_DIR, 'brands');
const SNAPSHOTS_DIR = path.join(DATA_DIR, 'snapshots');
const THUMBNAILS_DIR = path.join(DATA_DIR, 'thumbnails');
const SETTINGS_PATH = path.join(ROOT, 'settings.json');

// Ensure data directories exist
[DATA_DIR, BRANDS_DIR, SNAPSHOTS_DIR, THUMBNAILS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Settings management — prefers env vars (Vercel), falls back to settings.json (local)
function getSettings() {
  // Environment variables take priority (for Vercel)
  const envSettings = {
    facebookAccessToken: process.env.FACEBOOK_ACCESS_TOKEN || '',
    defaultCountry: process.env.DEFAULT_COUNTRY || 'VN',
  };

  // Try reading settings.json for local dev
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const fileSettings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
      return {
        ...fileSettings,
        // Env vars override file settings
        facebookAccessToken: envSettings.facebookAccessToken || fileSettings.facebookAccessToken || '',
        defaultCountry: envSettings.defaultCountry || fileSettings.defaultCountry || 'VN',
      };
    }
  } catch (e) {
    console.error('[Config] Failed to read settings:', e.message);
  }

  return { ...envSettings, brands: [] };
}

function saveSettings(updates) {
  const current = getSettings();
  const merged = { ...current, ...updates };
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2));
  } catch (e) {
    console.error('[Config] Failed to save settings:', e.message);
  }
  return merged;
}

module.exports = {
  IS_VERCEL,
  DATA_DIR,
  BRANDS_DIR,
  SNAPSHOTS_DIR,
  THUMBNAILS_DIR,
  SETTINGS_PATH,
  getSettings,
  saveSettings,
};
