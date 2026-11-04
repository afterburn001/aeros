// Weather icons: every Graphics/icons/icon_*.png, found fresh on each scan (nothing hardcoded).
//
// PNG masters (rendered on black) are never changed. The UI draws copies cached in Graphics/_cache/icons/:
// background knocked out, downscaled to the exact screen pixels each icon is drawn at (so the browser
// doesn't re-soften them), then sharpened. A copy is rebuilt only when its master is newer.
const { nativeImage, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ICON_FILE = /^(icon_.+)\.png$/i;
const CSS_SIZES = { big: 96, medium: 40, small: 32 }; // .wx-icon sizes in styles.css

const WORK_SIZE = 512;     // the knockout runs at this size, before the final downscale
const BLACK_FLOOR = 14;    // at or below this brightness (0-255) is fully clear: the renders' black isn't pure
const GLOW_TOP = 70;       // at or above this brightness is fully solid; between the two the glow fades out
const SHARPEN_AMOUNT = 0.7; // unsharp mask strength

// Removes only background reachable from the image edge through dim pixels, so dark facets enclosed by
// bright edges stay solid instead of turning into holes. px = premultiplied BGRA.
function knockOut(px, size) {
  const bright = (p) => Math.max(px[p * 4], px[p * 4 + 1], px[p * 4 + 2]);
  const outside = new Uint8Array(size * size);
  const stack = [];
  const visit = (p) => {
    if (!outside[p] && bright(p) < GLOW_TOP) { outside[p] = 1; stack.push(p); }
  };
  for (let i = 0; i < size; i++) {
    visit(i);
    visit(size * (size - 1) + i);
    visit(size * i);
    visit(size * i + size - 1);
  }
  while (stack.length) {
    const p = stack.pop();
    const x = p % size;
    if (x > 0) visit(p - 1);
    if (x < size - 1) visit(p + 1);
    if (p >= size) visit(p - size);
    if (p < size * (size - 1)) visit(p + size);
  }
  for (let p = 0; p < outside.length; p++) {
    if (!outside[p]) continue;
    const t = Math.min(1, Math.max(0, (bright(p) - BLACK_FLOOR) / (GLOW_TOP - BLACK_FLOOR)));
    const alpha = Math.round(t * t * (3 - 2 * t) * 255);
    for (let c = 0; c < 3; c++) px[p * 4 + c] = Math.min(px[p * 4 + c], alpha);
    px[p * 4 + 3] = alpha;
  }
}

// Unsharp mask: original + amount * (original - 3x3 blur). Returns a new premultiplied BGRA buffer.
function sharpen(px, size) {
  const out = Buffer.from(px);
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = (y * size + x) * 4;
      for (let c = 0; c < 4; c++) {
        let blur = 0;
        for (let k = 0; k < 9; k++) {
          const nx = Math.min(size - 1, Math.max(0, x + (k % 3) - 1));
          const ny = Math.min(size - 1, Math.max(0, y + Math.floor(k / 3) - 1));
          blur += px[(ny * size + nx) * 4 + c] * kernel[k];
        }
        const value = px[p + c] + SHARPEN_AMOUNT * (px[p + c] - blur / 16);
        out[p + c] = Math.min(255, Math.max(0, Math.round(value)));
      }
      // Premultiplied colour can't exceed its alpha.
      for (let c = 0; c < 3; c++) out[p + c] = Math.min(out[p + c], out[p + 3]);
    }
  }
  return out;
}

function buildCopy(masterPath, px) {
  const master = nativeImage.createFromPath(masterPath);
  if (master.isEmpty()) return null;
  const work = Buffer.from(master.resize({ width: WORK_SIZE, height: WORK_SIZE, quality: 'best' }).toBitmap());
  knockOut(work, WORK_SIZE);
  const clean = nativeImage.createFromBitmap(work, { width: WORK_SIZE, height: WORK_SIZE });
  const small = Buffer.from(clean.resize({ width: px, height: px, quality: 'best' }).toBitmap());
  return nativeImage.createFromBitmap(sharpen(small, px), { width: px, height: px }).toPNG();
}

// -> { icon_sunny: { big: url, medium: url, small: url }, ... }. A master that can't be read is left out.
function list(graphicsDir) {
  const scale = screen.getPrimaryDisplay().scaleFactor;
  const masterDir = path.join(graphicsDir, 'icons');
  const cacheDir = path.join(graphicsDir, '_cache', 'icons');
  const result = {};
  let files = [];
  try { files = fs.readdirSync(masterDir).sort(); } catch { return result; }
  for (const name of files) {
    const m = name.match(ICON_FILE);
    if (!m) continue;
    const id = m[1].toLowerCase();
    const master = path.join(masterDir, name);
    const masterTime = fs.statSync(master).mtimeMs;
    const copies = {};
    for (const [slot, cssSize] of Object.entries(CSS_SIZES)) {
      const px = Math.round(cssSize * scale);
      const file = path.join(cacheDir, `${id}_${px}.png`);
      try {
        if (!fs.existsSync(file) || fs.statSync(file).mtimeMs < masterTime) {
          const png = buildCopy(master, px);
          if (!png) break;
          fs.mkdirSync(cacheDir, { recursive: true });
          fs.writeFileSync(file, png);
        }
      } catch {
        break; // can't convert or write the cache: leave this icon out rather than break the app
      }
      copies[slot] = `${pathToFileURL(file).href}?v=${fs.statSync(file).mtimeMs | 0}`;
    }
    if (copies.small) result[id] = copies;
  }
  return result;
}

module.exports = { list };
