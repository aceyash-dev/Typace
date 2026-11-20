import { enforceRateLimit, sharedLimiterConfigured } from "./_lib/rate-limit.js";
import { API_VERSION, applyCommonHeaders } from "./_lib/respond.js";
import { KEYLESS_PROVIDER_IDS } from "./image.js";
import { listFonts, getCatalogStatus } from "./_lib/fonts.js";

// The shared helper emits the common contract (CORS, X-API-Version, a traceable
// X-Request-Id, nosniff); health only adds its own content type and caching.
function setHeaders(res, req, status = 200) {
    applyCommonHeaders(res, req);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", status === 200 ? "public, max-age=10, s-maxage=30, stale-while-revalidate=60" : "no-store");
}

function sendJSON(req, res, status, payload) {
    setHeaders(res, req, status);
    if (status === 405) res.setHeader("Allow", "GET, HEAD, OPTIONS");
    return res.status(status).json(payload);
}

export default async function handler(req, res) {
    setHeaders(res, req, req.method === "OPTIONS" ? 204 : 200);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET" && req.method !== "HEAD") {
        return sendJSON(req, res, 405, { error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
    }
    if (!(await enforceRateLimit(req, res))) return;

    try {
        const fonts = await listFonts();
        const catalog = getCatalogStatus();
        return sendJSON(req, res, 200, {
            status: catalog.issue ? "degraded" : "ok",
            service: "typace-api",
            apiVersion: API_VERSION,
            checkedAt: new Date().toISOString(),
            catalog: {
                status: catalog.issue ? "degraded" : "ok",
                count: fonts.length,
                ageSeconds: catalog.ageSeconds,
                stale: catalog.stale,
                issue: catalog.issue
            },
            // P3 readiness: this reports whether the shared limiter is actually
            // wired, which the rate-limit headers alone cannot tell you.
            rateLimit: {
                mode: sharedLimiterConfigured() ? "shared" : "per-instance",
                note: sharedLimiterConfigured()
                    ? "One global quota across instances."
                    : "Best-effort per instance. Set Upstash REST credentials for a global quota."
            },
            image: { providers: KEYLESS_PROVIDER_IDS },
            links: {
                catalog: "/api/fonts",
                search: "/api/search",
                openapi: "/api/openapi.json",
                llms: "/llms.txt",
                mcp: "/mcp"
            }
        });
    } catch (error) {
        console.error("Typace health check failed:", error);
        return sendJSON(req, res, 503, {
            status: "degraded",
            service: "typace-api",
            apiVersion: API_VERSION,
            error: "The font catalog is unavailable.",
            code: "CATALOG_UNAVAILABLE"
        });
    }
}
