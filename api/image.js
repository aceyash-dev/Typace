import { enforceRateLimit } from "./_lib/rate-limit.js";
import { sendJSON } from "./_lib/respond.js";

// Same-origin image proxy.
//
// CORS is the reason this exists: a browser can only read pixels from an image
// it is allowed to read, so any provider that does not send
// `access-control-allow-origin` is invisible to the client-side canvas — and
// keyed providers (Unsplash, Pexels) can never be called from the browser at
// all. This endpoint runs server-side, where neither constraint applies, tries
// every configured provider in turn, and re-serves the winning image
// same-origin so the canvas read always succeeds.

const PROVIDER_TIMEOUT_MS = 6000;
const MAX_BYTES = 3 * 1024 * 1024;
const IMAGE_CACHE = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000, stale-if-error=2592000";

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

function cleanSeed(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "typace";
}

/** Providers that need no credentials, always available. */
function baseProviders() {
  return [
    { id: "picsum", pick: (seed) => "https://picsum.photos/seed/" + seed + "/240/240" },
    { id: "loremflickr", pick: (seed) => "https://loremflickr.com/240/240/abstract" + (hashSeed(seed) % 9999) },
    { id: "dicebear", pick: (seed) => "https://api.dicebear.com/9.x/shapes/png" + seed + "&size=240" },
    { id: "robohash", pick: (seed) => "https://robohash.org/" + seed + ".png?size=240x240" },
  ];
}

/**
 * Providers unlocked by environment variables. Each is skipped silently when its
 * key is absent, so the endpoint works out of the box and gets better as keys
 * are added.
 */
function keyedProviders() {
  const providers = [];

  const unsplash = process.env.UNSPLASH_ACCESS_KEY;
  if (unsplash) {
    providers.push({
      id: "unsplash",
      async pick() {
        const response = await fetch(
          "https://api.unsplash.com/photos/random" + encodeURIComponent(unsplash),
          { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) }
        );
        if (!response.ok) return null;
        const data = await response.json();
        const url = data?.urls?.small || data?.urls?.regular;
        if (!url) return null;
        // Unsplash's API guidelines require crediting the photographer, so the
        // credit travels back with the image instead of being dropped here.
        return {
          url,
          attribution: {
            name: data?.user?.name || "Unsplash",
            url: (data?.user?.links?.html || "https://unsplash.com") + "?utm_source=typace&utm_medium=referral",
          },
        };
      },
    });
  }

  const pexels = process.env.PEXELS_API_KEY;
  if (pexels) {
    providers.push({
      id: "pexels",
      async pick(seed) {
        const page = (hashSeed(seed) % 20) + 1;
        const response = await fetch(
          "https://api.pexels.com/v1/curated" + page,
          { headers: { Authorization: pexels }, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) }
        );
        if (!response.ok) return null;
        const data = await response.json();
        const photo = data?.photos?.[0];
        const url = photo?.src?.small;
        if (!url) return null;
        return {
          url,
          attribution: { name: photo?.photographer || "Pexels", url: photo?.url || "https://www.pexels.com" },
        };
      },
    });
  }

  return providers;
}

async function fetchImage(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    headers: { Accept: "image/*" },
  });
  if (!response.ok) return null;
  const type = String(response.headers.get("content-type") || "").split(";")[0].trim();
  if (!type.startsWith("image/")) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_BYTES) return null;
  return { buffer, type };
}

export default async function handler(req, res) {
    if (req.method === "OPTIONS") return sendJSON(req, res, 204, null);
    if (req.method !== "GET" && req.method !== "HEAD") {
        return sendJSON(req, res, 405, { error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
    }
    if (!enforceRateLimit(req, res)) return;

    const seed = cleanSeed(req.query?.seed);
    const candidates = [...baseProviders(), ...keyedProviders()];
    const start = hashSeed(seed) % candidates.length;
    const order = candidates.map((_, offset) => candidates[(start + offset) % candidates.length]);

    for (const provider of order) {
        try {
            const picked = await provider.pick(seed);
            if (!picked) continue;
            const { url, attribution } = typeof picked === "string" ? { url: picked, attribution: null } : picked;
            if (!url) continue;
            const image = await fetchImage(url);
            if (!image) continue;

            res.setHeader("Content-Type", image.type);
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Timing-Allow-Origin", "*");
            res.setHeader("X-Image-Provider", provider.id);
            res.setHeader("Access-Control-Expose-Headers", "X-Image-Provider, X-Image-Attribution, X-Image-Attribution-Url");
            if (attribution) {
                // Surfaced so the credit can be shown wherever the photo appears.
                res.setHeader("X-Image-Attribution", attribution.name);
                res.setHeader("X-Image-Attribution-Url", attribution.url);
            }
            res.setHeader("Cache-Control", IMAGE_CACHE);
            res.setHeader("CDN-Cache-Control", "public, s-maxage=604800, stale-while-revalidate=2592000");
            if (req.method === "HEAD") return res.status(200).end();
            return res.status(200).send(image.buffer);
        } catch {
            // Provider unreachable or returned something unusable — try the next one.
        }
    }

    return sendJSON(req, res, 502, {
        error: "No image provider is currently available.",
        code: "IMAGE_UNAVAILABLE",
    });
}
