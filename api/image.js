import { enforceRateLimit } from "./_lib/rate-limit.js";
import { sendJSON } from "./_lib/respond.js";

// Same-origin image proxy. Re-serving provider images from this origin keeps
// canvas pixel reads available to the client-side palette extractor.
//
// Per-attempt cap, plus an overall budget for the whole rotation. The budget is
// what makes a long provider list safe: a dead source costs its slice, not the
// full request.
const PROVIDER_TIMEOUT_MS = 2500;
const TOTAL_BUDGET_MS = 6000;
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

/**
 * Providers the browser can read pixels from directly. Each one must send
 * `access-control-allow-origin`, otherwise the canvas is tainted and the
 * palette extractor cannot sample it.
 */
export const DIRECT_PROVIDER_IDS = ["picsum", "loremflickr"];

/**
 * Every keyless provider the proxy will try, in rotation order. None of these
 * require an API key, an account, or any credential: the proxy holds no
 * image-service secrets, so a provider that needed one could not be served here
 * anyway. The extra entries beyond DIRECT_PROVIDER_IDS are reached through the
 * proxy only, which is same-origin and so needs no CORS grant.
 */
export const KEYLESS_PROVIDER_IDS = [...DIRECT_PROVIDER_IDS, "cataas", "placekeanu"];

/**
 * Keep URL construction valid and seed-stable. cataas and placekeanu have no
 * seed parameter of their own; variety comes from the rotation, not the seed.
 * Every source here returns a photograph. Generated avatars and geometric
 * patterns were removed: they carry almost no colour information, so they made
 * a worse accent than the brand fallback they replaced.
 */
const PICKERS = {
  picsum: (seed) => "https://picsum.photos/seed/" + encodeURIComponent(seed) + "/240/240",
  loremflickr: (seed) => "https://loremflickr.com/240/240/abstract?lock=" + (hashSeed(seed) % 9999),
  cataas: () => "https://cataas.com/cat?width=240&height=240",
  placekeanu: () => "https://placekeanu.com/240/240",
};

function baseProviders() {
  return KEYLESS_PROVIDER_IDS.map((id) => ({ id, pick: PICKERS[id] }));
}

async function fetchImage(url, timeoutMs = PROVIDER_TIMEOUT_MS) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(Math.max(250, timeoutMs)),
    headers: { Accept: "image/*" },
  });
  if (!response.ok) {
    try { await response.body?.cancel(); } catch { /* best-effort cancellation */ }
    return null;
  }

  const type = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  // Only serve raster formats from the proxy. SVG can contain active content.
  const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);
  if (!allowedTypes.has(type)) {
    try { await response.body?.cancel(); } catch { /* best-effort cancellation */ }
    return null;
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
    try { await response.body?.cancel(); } catch { /* best-effort cancellation */ }
    return null;
  }

  // Enforce the byte cap while streaming, before a large response can consume
  // unbounded memory. Provider failures fall through to the next candidate.
  if (!response.body?.getReader) {
    try { await response.body?.cancel(); } catch { /* best-effort cancellation */ }
    return null;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    try { await reader.cancel(); } catch { /* best-effort cancellation */ }
    throw error;
  } finally {
    reader.releaseLock();
  }

  if (!total) return null;
  return { buffer: Buffer.concat(chunks, total), type };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return sendJSON(req, res, 204, null);
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    return sendJSON(req, res, 405, { error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
  }
  if (!enforceRateLimit(req, res)) return;

  const seed = cleanSeed(req.query?.seed);
  const candidates = baseProviders();
  // Rotate the first-choice source across visits. Random seeds alone are not
  // enough: free image services can return similar photos or repeat a small pool.
  // The client hint is validated against our own provider IDs; failures still
  // fall through to every other provider.
  const requestedProvider = String(req.query?.provider || "");
  const requestedIndex = candidates.findIndex((provider) => provider.id === requestedProvider);
  const start = requestedIndex >= 0 ? requestedIndex : hashSeed(seed) % candidates.length;
  const order = candidates.map((_, offset) => candidates[(start + offset) % candidates.length]);

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  for (const provider of order) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    try {
      const picked = await provider.pick(seed);
      if (!picked) continue;
      const { url, attribution } = typeof picked === "string" ? { url: picked, attribution: null } : picked;
      if (!url) continue;
      const image = await fetchImage(url, Math.min(PROVIDER_TIMEOUT_MS, remaining));
      if (!image) continue;

      res.setHeader("Content-Type", image.type);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Timing-Allow-Origin", "*");
      res.setHeader("X-Image-Provider", provider.id);
      res.setHeader("Access-Control-Expose-Headers", "X-Image-Provider, X-Image-Attribution, X-Image-Attribution-Url");
      if (attribution) {
        res.setHeader("X-Image-Attribution", attribution.name);
        res.setHeader("X-Image-Attribution-Url", attribution.url);
      }
      res.setHeader("Cache-Control", IMAGE_CACHE);
      res.setHeader("CDN-Cache-Control", "public, s-maxage=604800, stale-while-revalidate=2592000");
      if (req.method === "HEAD") return res.status(200).end();
      return res.status(200).send(image.buffer);
    } catch {
      // Provider outage, timeout, or invalid response: try the next source.
    }
  }

  return sendJSON(req, res, 502, {
    error: "No image provider is currently available.",
    code: "IMAGE_UNAVAILABLE",
  });
}
