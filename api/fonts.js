import { enforceRateLimit } from "./_lib/rate-limit.js";
import { listFonts } from "./_lib/fonts.js";

function sendJSON(res, status, data) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Expose-Headers", "RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After, X-API-Version");
    res.setHeader("X-API-Version", "1.1.0");    res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", status === 200 ? "public, max-age=60, s-maxage=300, stale-while-revalidate=3600" : "no-store");
    if (status === 405) res.setHeader("Allow", "GET, OPTIONS");
    return res.status(status).json(data);
}

export default async function handler(req, res) {
    if (req.method === "OPTIONS") return sendJSON(res, 204, null);
    if (req.method !== "GET") return sendJSON(res, 405, { error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
    if (!enforceRateLimit(req, res)) return;
    try {
        return sendJSON(res, 200, await listFonts());
    } catch (error) {
        console.error("Typace font discovery failed:", error);
        return sendJSON(res, 500, { error: "Unable to scan the fonts directory.", code: "FONT_SCAN_FAILED" });
    }
}
