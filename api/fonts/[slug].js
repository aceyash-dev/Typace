import { enforceRateLimit } from "../_lib/rate-limit.js";
import { listFonts, findFont } from "../_lib/fonts.js";

function sendJSON(res, status, data) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", status === 200 ? "public, max-age=60, s-maxage=300, stale-while-revalidate=3600" : "no-store");
    return res.status(status).json(data);
}

export default async function handler(req, res) {
    if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        return res.status(204).end();
    }
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET, OPTIONS");
        return sendJSON(res, 405, { error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
    if (!enforceRateLimit(req, res)) return;
    }

    try {
        const font = findFont(await listFonts(), req.query?.slug);
        if (!font) return sendJSON(res, 404, { error: "Font not found.", code: "FONT_NOT_FOUND" });
        res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=3600");
        return sendJSON(res, 200, font);
    } catch (error) {
        console.error("Typace font lookup failed:", error);
        return sendJSON(res, 500, { error: "Unable to load font metadata.", code: "FONT_LOOKUP_FAILED" });
    }
}
