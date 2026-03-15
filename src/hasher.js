// === AdLibrarySpy — Perceptual Image Hasher ===
// Uses dHash (difference hash) to fingerprint ad creatives.
// Same visual creative → same hash, regardless of compression/resize.

let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.warn('[Hasher] sharp not available — using fallback pixel hash');
  sharp = null;
}

/**
 * Compute dHash (difference hash) for an image buffer.
 * Algorithm:
 *   1. Resize to 9×8 grayscale
 *   2. Compare each pixel with the one to its right
 *   3. Build 64-bit binary → 16-char hex string
 *
 * @param {Buffer} imageBuffer — raw image data (PNG/JPEG/WebP)
 * @returns {Promise<string>} — hex hash string (16 chars)
 */
async function dHash(imageBuffer) {
  if (!sharp) {
    // Fallback: simple content hash when sharp is unavailable
    const crypto = require('crypto');
    return crypto.createHash('md5').update(imageBuffer).digest('hex').substring(0, 16);
  }

  // Resize to 9 width × 8 height, grayscale, get raw pixel data
  const { data } = await sharp(imageBuffer)
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = data[y * 9 + x];
      const right = data[y * 9 + x + 1];
      hash += left < right ? '1' : '0';
    }
  }

  // Convert 64-bit binary to hex (16 chars)
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(hash.substring(i, i + 4), 2).toString(16);
  }

  return hex;
}

/**
 * Compute short hash for creative ID (first 6 chars of dHash).
 * Format: {brand}-{shortHash} e.g., "ILAVietnam-fffec0"
 */
async function creativeHash(imageBuffer) {
  const full = await dHash(imageBuffer);
  return full.substring(0, 6);
}

/**
 * Compute Hamming distance between two hex hashes.
 * Lower = more similar (0 = identical, 64 = completely different).
 */
function hammingDistance(hash1, hash2) {
  // Pad to same length
  const maxLen = Math.max(hash1.length, hash2.length);
  const h1 = hash1.padEnd(maxLen, '0');
  const h2 = hash2.padEnd(maxLen, '0');

  let distance = 0;
  for (let i = 0; i < maxLen; i++) {
    const n1 = parseInt(h1[i], 16);
    const n2 = parseInt(h2[i], 16);
    // XOR and count set bits
    let xor = n1 ^ n2;
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

/**
 * Check if two hashes represent the same creative (threshold-based).
 * Default threshold = 5 bits difference (out of 64).
 */
function isSameCreative(hash1, hash2, threshold = 5) {
  return hammingDistance(hash1, hash2) <= threshold;
}

/**
 * Download image from URL and compute its hash.
 */
async function hashFromUrl(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const hash = await creativeHash(buffer);
    return { hash, buffer, size: buffer.length };
  } catch (e) {
    console.error(`[Hasher] Failed to hash ${url}: ${e.message}`);
    return null;
  }
}

module.exports = {
  dHash,
  creativeHash,
  hammingDistance,
  isSameCreative,
  hashFromUrl,
};
