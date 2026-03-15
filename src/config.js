// === AdLibrarySpy — Configuration ===
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 4000);
const DATA_DIR = path.join(__dirname, '..', 'data');
const BRANDS_DIR = path.join(DATA_DIR, 'brands');
const SNAPSHOTS_DIR = path.join(DATA_DIR, 'snapshots');
const THUMBNAILS_DIR = path.join(DATA_DIR, 'thumbnails');
const SETTINGS_PATH = path.join(__dirname, '..', 'settings.json');

// Ensure data directories exist
[DATA_DIR, BRANDS_DIR, SNAPSHOTS_DIR, THUMBNAILS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Settings management
function getSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('[Config] Failed to read settings:', e.message);
  }
  return { facebookAccessToken: '', defaultCountry: 'VN', brands: [] };
}

function saveSettings(updates) {
  const current = getSettings();
  const merged = { ...current, ...updates };
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

module.exports = {
  PORT,
  DATA_DIR,
  BRANDS_DIR,
  SNAPSHOTS_DIR,
  THUMBNAILS_DIR,
  SETTINGS_PATH,
  getSettings,
  saveSettings,
};
