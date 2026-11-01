import { enforceRateLimit, sharedLimiterConfigured } from "./_lib/rate-limit.js";
import { KEYLESS_PROVIDER_IDS } from "./image.js";
import { listFonts, getCatalogStatus } from "./_lib/fonts.js";

function setHeaders(res, status = 200) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
    res.setHeader("Access-Control-Expose-Headers", "RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After, X-API-Version");
    res.setHeader("X-API-Version", "1.1.0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", status === 200 ? "public, max-age=10, s-maxage=30, stale-while-revalidate=60" : "no-store");
}

function sendJSON(res, status, payload) {
    setHeaders(res, status);
    if (status === 405) res.setHeader("Allow", "GET, HEAD, OPTIONS");
    return res.status(status).json(payload);
}

export default async function handler(req, res) {
    setHeaders(res, req.method === "OPTIONS" ? 204 : 200);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET" && req.method !== "HEAD") {
        return sendJSON(res, 405, { error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
    }
    if (!(await enforceRateLimit(req, res))) return;

    try {
        const fonts = await listFonts();
        const catalog = getCatalogStatus();
        return sendJSON(res, 200, {
            status: catalog.issue ? "degraded" : "ok",
            service: "typace-api",
            apiVersion: "1.1.0",
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
        return sendJSON(res, 503, {
            status: "degraded",
            service: "typace-api",
            apiVersion: "1.1.0",
            error: "The font catalog is unavailable.",
            code: "CATALOG_UNAVAILABLE"
        });
    }
}
