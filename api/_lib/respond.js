import crypto from "node:crypto";

export const API_VERSION = "1.1.0";

// Shared response helpers so every endpoint sends identical CORS, versioning,
// caching and conditional-request headers.

export function applyCommonHeaders(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Timing-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
    res.setHeader("Access-Control-Expose-Headers", "RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After, X-API-Version, ETag, X-Total-Count");
    res.setHeader("X-API-Version", API_VERSION);
    res.setHeader("X-Content-Type-Options", "nosniff");
}

function weakETag(payload) {
    return 'W/"' + crypto.createHash("sha1").update(payload).digest("base64url").slice(0, 24) + '"';
}

/**
 * Send a JSON response. When `cache` is provided for a 200, an ETag is emitted
 * and a matching If-None-Match returns 304 with no body.
 */
export function sendJSON(req, res, status, data, { cache = "", cdn = "" } = {}) {
    applyCommonHeaders(res);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (status === 405) res.setHeader("Allow", "GET, HEAD, OPTIONS");

    if (status === 200 && cache) {
        res.setHeader("Cache-Control", cache);
        if (cdn) res.setHeader("CDN-Cache-Control", cdn);
        const body = JSON.stringify(data);
        const etag = weakETag(body);
        res.setHeader("ETag", etag);
        const ifNoneMatch = String(req.headers?.["if-none-match"] || "");
        if (ifNoneMatch.split(",").some((tag) => tag.trim() === etag)) {
            res.status(304).end();
            return;
        }
        res.status(200).send(body);
        return;
    }

    res.setHeader("Cache-Control", "no-store");
    if (status === 204 || req.method === "HEAD") {
        res.status(status).end();
        return;
    }
    res.status(status).json(data);
}
