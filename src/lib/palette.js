// The palette is black, white, and one colour taken from a random photo.
//
// We pull a picture from Lorem Picsum (free, no key, sends
// `access-control-allow-origin: *`), read its dominant colour on a canvas, then
// derive a small accessible set of variables from it. If the photo cannot be
// read — offline, blocked, or a tainted canvas — we fall back to a deterministic
// colour from the seed so the interface still has an accent.

const PROVIDER = "https://picsum.photos";
const SEED_KEY = "typace-theme-seed";

export function imageUrl(seed, size = 200) {
  return PROVIDER + "/seed/" + encodeURIComponent(seed) + "/" + size + "/" + size;
}

function readSeed() {
  try { return localStorage.getItem(SEED_KEY) || ""; } catch { return ""; }
}
function writeSeed(value) {
  try { localStorage.setItem(SEED_KEY, value); } catch { /* storage may be blocked */ }
}

/** Stable for the session (and across reloads) so the theme does not flicker. */
export function pickSeed() {
  const existing = readSeed();
  if (existing) return existing;
  const seed = Math.random().toString(36).slice(2, 10);
  writeSeed(seed);
  return seed;
}

/** A new photo, for a "shuffle" affordance. */
export function reshuffleSeed() {
  const seed = Math.random().toString(36).slice(2, 10);
  writeSeed(seed);
  return seed;
}

function rgbToHsl(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) h = ((bn - rn) / d + 2) * 60;
    else h = ((rn - gn) / d + 4) * 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const css = (h, s, l) =>
  "hsl(" + Math.round(((h % 360) + 360) % 360) + " " +
  Math.round(clamp(s, 0, 100)) + "% " + Math.round(clamp(l, 0, 100)) + "%)";

/**
 * Weighted dominant colour of a decoded image. Near-black, near-white and
 * desaturated pixels are ignored so the result is a colour worth using, and each
 * pixel votes with its saturation so a small vivid area can win over a large
 * washed-out one.
 */
export function dominantColor(image, sampleSize = 32) {
  const canvas = document.createElement("canvas");
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, sampleSize, sampleSize);
  const { data } = context.getImageData(0, 0, sampleSize, sampleSize);

  const buckets = Array.from({ length: 12 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
  for (let index = 0; index < data.length; index += 4) {
    const r = data[index], g = data[index + 1], b = data[index + 2], a = data[index + 3];
    if (a < 128) continue;
    const { h, s, l } = rgbToHsl(r, g, b);
    if (l < 8 || l > 94 || s < 12) continue;
    const bucket = buckets[Math.floor(h / 30) % 12];
    bucket.weight += s;
    bucket.r += r * s;
    bucket.g += g * s;
    bucket.b += b * s;
  }
  const best = buckets.reduce((a, b) => (b.weight > a.weight ? b : a));
  if (!best.weight) return null;
  return { r: best.r / best.weight, g: best.g / best.weight, b: best.b / best.weight };
}

/**
 * Turn a dominant colour into theme variables. The font ink keeps the source
 * hue and moves the opposite way: a light source is tinted darker, a dark source
 * is lightened.
 */
export function themeFromColor({ r, g, b }) {
  const { h, s, l } = rgbToHsl(r, g, b);
  const isLight = l >= 58;
  const saturation = clamp(s, 36, 88);
  const accentLightness = clamp(isLight ? l - 16 : l + 10, 30, 62);
  const inkLightness = isLight ? clamp(l - 32, 18, 42) : clamp(l + 28, 62, 86);
  return {
    isLight,
    hue: Math.round(h),
    accent: css(h, saturation, accentLightness),
    accentDark: css(h, saturation, clamp(accentLightness - 14, 18, 46)),
    accentSoft: css(h, Math.max(24, saturation - 24), clamp(accentLightness + 34, 80, 95)),
    ink: css(h, saturation, inkLightness),
  };
}

/** Deterministic stand-in when the photo cannot be read. */
export function themeFromSeed(seed) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  const h = hash % 360;
  const s = 46 + (hash % 24);
  return {
    isLight: false,
    hue: h,
    accent: css(h, s, 44),
    accentDark: css(h, s, 32),
    accentSoft: css(h, Math.max(24, s - 22), 92),
    ink: css(h, s, 70),
  };
}

/** Inline custom properties on <html> override every stylesheet token. */
export function applyTheme(theme) {
  const root = document.documentElement;
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-dark", theme.accentDark);
  root.style.setProperty("--accent-soft", theme.accentSoft);
  root.style.setProperty("--peacock", theme.accent);
  root.style.setProperty("--vermilion", theme.accent);
  root.style.setProperty("--rani", theme.accent);
  root.style.setProperty("--specimen-ink", theme.ink);
  root.dataset.accent = theme.isLight ? "light" : "dark";
  root.dataset.accentHue = String(theme.hue);
}

/** Resolve a theme for a seed, never rejecting. */
export function loadImageTheme(seed) {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") { resolve(themeFromSeed(seed)); return; }
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    let settled = false;
    const finish = (theme) => { if (!settled) { settled = true; resolve(theme); } };
    const timer = setTimeout(() => finish(themeFromSeed(seed)), 6000);
    image.onload = () => {
      clearTimeout(timer);
      try {
        const color = dominantColor(image);
        finish(color ? themeFromColor(color) : themeFromSeed(seed));
      } catch {
        finish(themeFromSeed(seed));   // canvas tainted → deterministic fallback
      }
    };
    image.onerror = () => { clearTimeout(timer); finish(themeFromSeed(seed)); };
    image.src = imageUrl(seed);
  });
}
