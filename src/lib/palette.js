// The palette is black, white, and one colour taken from a random photo.
//
// We pull a picture from Lorem Picsum (free, no key, sends
// `access-control-allow-origin: *`), read its dominant colour on a canvas, then
// derive a small accessible set of variables from it. If the photo cannot be
// read — offline, blocked, or a tainted canvas — we fall back to a deterministic
// colour from the seed so the interface still has an accent.

const SEED_KEY = "typace-theme-seed";

// FNV-1a with a murmur3-style finaliser: the finaliser matters because we index
// providers (and hues) off the low bits, which FNV-1a alone distributes poorly.
function hashSeed(seed) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * Independent free image sources, each CORS-enabled so the canvas stays
 * readable. They are tried in a seed-rotated order: any one of them failing
 * (outage, block, tainted canvas) simply moves on to the next, and if all of
 * them fail we still resolve a palette locally without touching the network.
 */
export const PROVIDERS = [
  {
    id: "picsum",
    label: "Lorem Picsum",
    url: (seed, size) =>
      "https://picsum.photos/seed/" + encodeURIComponent(seed) + "/" + size + "/" + size,
  },
  {
    id: "loremflickr",
    label: "LoremFlickr",
    url: (seed, size) =>
      "https://loremflickr.com/" + size + "/" + size + "/abstract?lock=" + (hashSeed(seed) % 9999),
  },
  {
    id: "dicebear",
    label: "DiceBear",
    url: (seed, size) =>
      "https://api.dicebear.com/9.x/shapes/png?seed=" + encodeURIComponent(seed) + "&size=" + size,
  },
  {
    id: "robohash",
    label: "Robohash",
    url: (seed, size) =>
      "https://robohash.org/" + encodeURIComponent(seed) + ".png?size=" + size + "x" + size,
  },
  {
    // Same-origin proxy. Not subject to CORS, so it is the one source that can
    // never be blocked by the browser — and it is where the keyed providers
    // (Unsplash, Pexels) live, since those cannot be called from a page at all.
    // Always tried last, after every direct provider.
    id: "typace",
    label: "Typace image proxy",
    sameOrigin: true,
    url: (seed) => "/api/image?seed=" + encodeURIComponent(seed),
  },
];

/** The default (first-tried) provider, kept for callers that want one URL. */
export function imageUrl(seed, size = 200) {
  return PROVIDERS[0].url(seed, size);
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
export function themeFromColor({ r, g, b }, provider = "brand", image = "") {
  const { h, s, l } = rgbToHsl(r, g, b);
  const isLight = l >= 58;
  const saturation = clamp(s, 36, 88);
  const accentLightness = clamp(isLight ? l - 16 : l + 10, 30, 62);
  const inkLightness = isLight ? clamp(l - 32, 18, 42) : clamp(l + 28, 62, 86);
  return {
    isLight,
    hue: Math.round(h),
    provider,
    image,
    accent: css(h, saturation, accentLightness),
    accentDark: css(h, saturation, clamp(accentLightness - 14, 18, 46)),
    accentSoft: css(h, Math.max(24, saturation - 24), clamp(accentLightness + 34, 80, 95)),
    ink: css(h, saturation, inkLightness),
  };
}

/**
 * The brand palette (milk + orange), used whenever no photo can be read. This is
 * deliberately NOT a hash-derived colour: an unreadable image must leave the
 * interface exactly as designed, never some arbitrary hue.
 */
export function brandTheme() {
  return {
    isLight: false,
    hue: 26,
    provider: "brand",
    image: "",
    accent: "#ed7418",
    accentDark: "#b94b08",
    accentSoft: "#ffead6",
    ink: "#b94b08",
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
  if (theme.provider) root.dataset.accentProvider = theme.provider;
  // The photo itself is exposed as a background so the preview can show it.
  if (theme.image) {
    root.style.setProperty("--theme-image", 'url("' + theme.image.replace(/"/g, "%22") + '")');
    root.dataset.imageReady = "true";
  } else {
    root.style.removeProperty("--theme-image");
    root.dataset.imageReady = "false";
  }
}

/**
 * Resolve a theme for a seed. Never rejects and never hangs: providers are tried
 * in a seed-rotated order, each with its own timeout, and a local palette is the
 * guaranteed final answer.
 */
export function loadImageTheme(seed, { size = 200, providerTimeout = 4500 } = {}) {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") { resolve(brandTheme()); return; }

    // The same-origin proxy is tried FIRST. That ordering is the whole point: a
    // cross-origin image whose final response omits access-control-allow-origin
    // taints the canvas, so getImageData throws and every direct provider is
    // skipped — which is how an unreadable photo used to end up as an arbitrary
    // hash-derived colour. Our own origin can never taint, so the pixel read is
    // guaranteed. Direct providers follow as a fast fallback if the proxy is down.
    const proxied = PROVIDERS.filter((provider) => provider.sameOrigin);
    const direct = PROVIDERS.filter((provider) => !provider.sameOrigin);
    const start = hashSeed(seed) % direct.length;
    const order = proxied.concat(
      direct.map((_, offset) => direct[(start + offset) % direct.length])
    );
    let index = 0;
    let settled = false;

    const finish = (theme) => { if (!settled) { settled = true; resolve(theme); } };

    const tryNext = () => {
      if (settled) return;
      const provider = order[index];
      index += 1;
      if (!provider) { finish(brandTheme()); return; }

      const image = new Image();
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      let done = false;

      const advance = () => {
        if (done || settled) return;
        done = true;
        clearTimeout(timer);
        tryNext();
      };

      const timer = setTimeout(() => {
        // A slow provider must not hold up the palette.
        try { image.src = ""; } catch { /* ignore */ }
        advance();
      }, providerTimeout);

      image.onload = () => {
        if (done || settled) return;
        try {
          const color = dominantColor(image);
          if (color) {
            done = true;
            clearTimeout(timer);
            finish(themeFromColor(color, provider.id, provider.url(seed, size)));
            return;
          }
        } catch {
          // Tainted canvas or unreadable pixels — fall through to the next source.
        }
        advance();
      };
      image.onerror = advance;

      try {
        image.src = provider.url(seed, size);
      } catch {
        advance();
      }
    };

    tryNext();
  });
}
