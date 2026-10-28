const WINDOW_MS = 60_000;
const MAX_KEYS = 10_000;

// Per-instance fallback buckets. Kept even when a shared store is configured:
// a store outage must degrade the limit, not take the API down.
const buckets = new Map();

function toLimit(value, fallback) {
    const parsed = Number.parseInt(value || "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const DEFAULT_LIMIT = toLimit(process.env.TYPACE_RATE_LIMIT, 60);

// Tool calls are cheap and an agent makes several per turn, so MCP gets its own
// budget rather than competing with page loads for the same one.
const SCOPE_LIMITS = {
    api: DEFAULT_LIMIT,
    mcp: toLimit(process.env.TYPACE_MCP_RATE_LIMIT, 120),
};

export function limitForScope(scope = "api") {
    return SCOPE_LIMITS[scope] ?? DEFAULT_LIMIT;
}

function getClientKey(req) {
    // On Vercel, x-real-ip is set by the platform. Do not trust
    // client-supplied x-forwarded-for values, which can be trivially spoofed.
    const realIp = req.headers?.["x-real-ip"];
    const candidate = Array.isArray(realIp) ? realIp[0] : realIp;
    const ip = String(candidate || "").trim().slice(0, 128);
    return ip || "unknown";
}

function outcome(count, limit, windowStart, now) {
    const allowed = count <= limit;
    return {
        allowed,
        limit,
        remaining: Math.max(0, limit - count),
        resetAt: windowStart + WINDOW_MS,
        retryAfter: allowed ? 0 : Math.max(1, Math.ceil((windowStart + WINDOW_MS - now) / 1000)),
    };
}

/**
 * Best-effort per-runtime sliding-window limiter. Correct for a single instance
 * only; prefer the shared store below when one is configured.
 */
export function checkRateLimit(req, now = Date.now(), scope = "api") {
    const key = `${scope}:${getClientKey(req)}`;
    const limit = limitForScope(scope);
    let timestamps = buckets.get(key) || [];
    timestamps = timestamps.filter(timestamp => now - timestamp < WINDOW_MS);

    if (timestamps.length >= limit) {
        buckets.set(key, timestamps);
        return {
            allowed: false,
            limit,
            remaining: 0,
            resetAt: timestamps[0] + WINDOW_MS,
            retryAfter: Math.max(1, Math.ceil((timestamps[0] + WINDOW_MS - now) / 1000)),
        };
    }

    timestamps.push(now);
    buckets.delete(key);
    buckets.set(key, timestamps);
    while (buckets.size > MAX_KEYS) buckets.delete(buckets.keys().next().value);

    return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - timestamps.length),
        resetAt: timestamps[0] + WINDOW_MS,
        retryAfter: 0,
    };
}

/**
 * Upstash-compatible Redis REST credentials, if the deployment has them.
 *
 * Vercel KV was retired and migrated to Upstash in December 2024, so which names
 * appear depends on how the database was provisioned:
 *   - Vercel Marketplace Upstash integration -> KV_REST_API_URL / KV_REST_API_TOKEN
 *   - Upstash directly (Console or CLI)       -> UPSTASH_REDIS_REST_URL / _TOKEN
 *   - anything else                           -> TYPACE_KV_REST_URL / _TOKEN
 * All three are accepted so the integration works without renaming variables.
 */
function sharedConfig() {
    const url = process.env.TYPACE_KV_REST_URL
        || process.env.KV_REST_API_URL
        || process.env.UPSTASH_REDIS_REST_URL
        || "";
    const token = process.env.TYPACE_KV_REST_TOKEN
        || process.env.KV_REST_API_TOKEN
        || process.env.UPSTASH_REDIS_REST_TOKEN
        || "";
    return url && token ? { url: String(url).replace(/\/+$/, ""), token: String(token) } : null;
}

export function sharedLimiterConfigured() {
    return Boolean(sharedConfig());
}

/**
 * Fixed-window counter in Redis: INCR the window key and set its TTL in one
 * pipeline. Fixed windows allow a burst at a boundary, which is fine here —
 * the alternative (a sorted set per client) costs far more per request.
 */
async function checkShared(req, { scope, now }) {
    const config = sharedConfig();
    if (!config) return null;

    const limit = limitForScope(scope);
    const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
    const key = `typace:ratelimit:${scope}:${getClientKey(req)}:${windowStart}`;

    const response = await fetch(`${config.url}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
        body: JSON.stringify([["INCR", key], ["EXPIRE", key, Math.ceil(WINDOW_MS / 1000), "NX"]]),
        signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) throw new Error(`rate limit store responded ${response.status}`);

    const payload = await response.json();
    const count = Number(Array.isArray(payload) ? payload[0]?.result : NaN);
    if (!Number.isFinite(count)) throw new Error("rate limit store returned no count");
    return outcome(count, limit, windowStart, now);
}

/**
 * Apply the limit for a scope. Returns true when the request may proceed, and
 * writes the 429 itself when it may not.
 */
export async function enforceRateLimit(req, res, { scope = "api", now = Date.now(), methods = "GET, HEAD, OPTIONS" } = {}) {
    // Keep browser and AI clients informed even when this request is rejected.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", methods);
    res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
    res.setHeader("Access-Control-Expose-Headers", "RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After, X-API-Version");
    res.setHeader("X-API-Version", "1.1.0");

    let result;
    try {
        result = await checkShared(req, { scope, now });
    } catch {
        // Store unreachable or misconfigured: fall back rather than fail open.
        result = null;
    }
    if (!result) result = checkRateLimit(req, now, scope);

    res.setHeader("RateLimit-Limit", String(result.limit));
    res.setHeader("RateLimit-Remaining", String(result.remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
    if (result.allowed) return true;

    res.setHeader("Retry-After", String(result.retryAfter));
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(429).json({
        error: `Too many requests. Limit is ${result.limit} requests per minute per IP.`,
        code: "RATE_LIMIT_EXCEEDED",
        limit: result.limit,
        windowSeconds: 60,
        retryAfter: result.retryAfter
    });
    return false;
}
