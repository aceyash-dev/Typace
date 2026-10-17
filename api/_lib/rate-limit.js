const WINDOW_MS = 60_000;
// Generous by default (a CDN-backed public catalog), tunable via env.
const MAX_REQUESTS = Number.parseInt(process.env.TYPACE_RATE_LIMIT || "60", 10) || 60;
const MAX_KEYS = 10_000;
const buckets = new Map();

function getClientKey(req) {
    const realIp = req.headers?.["x-real-ip"];
    const forwarded = req.headers?.["x-forwarded-for"];
    const candidate = Array.isArray(realIp)
        ? realIp[0]
        : realIp || (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0]);
    const ip = String(candidate || "").trim().slice(0, 128);
    return ip || "unknown";
}

/**
 * Best-effort per-runtime sliding-window limiter for serverless deployments.
 * Use a shared edge/KV limiter for a strict global limit across instances.
 */
export function checkRateLimit(req, now = Date.now()) {
    const key = getClientKey(req);
    let timestamps = buckets.get(key) || [];
    timestamps = timestamps.filter(timestamp => now - timestamp < WINDOW_MS);

    if (timestamps.length >= MAX_REQUESTS) {
        buckets.set(key, timestamps);
        return {
            allowed: false,
            limit: MAX_REQUESTS,
            remaining: 0,
            resetAt: timestamps[0] + WINDOW_MS,
            retryAfter: Math.max(1, Math.ceil((timestamps[0] + WINDOW_MS - now) / 1000))
        };
    }

    timestamps.push(now);
    buckets.delete(key);
    buckets.set(key, timestamps);
    while (buckets.size > MAX_KEYS) buckets.delete(buckets.keys().next().value);

    return {
        allowed: true,
        limit: MAX_REQUESTS,
        remaining: Math.max(0, MAX_REQUESTS - timestamps.length),
        resetAt: timestamps[0] + WINDOW_MS,
        retryAfter: 0
    };
}

export function enforceRateLimit(req, res) {
    // Keep browser and AI clients informed even when this request is rejected.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
    res.setHeader("Access-Control-Expose-Headers", "RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After, X-API-Version");
    res.setHeader("X-API-Version", "1.1.0");
    const result = checkRateLimit(req);
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
