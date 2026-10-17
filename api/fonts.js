import { enforceRateLimit } from "./_lib/rate-limit.js";
import { listFonts } from "./_lib/fonts.js";
import { sendJSON } from "./_lib/respond.js";

const CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=3600";
const FORMATS = new Set(["ttf", "otf", "woff2"]);
const MAX_LIMIT = 500;

export default async function handler(req, res) {
    if (req.method === "OPTIONS") return sendJSON(req, res, 204, null);
    if (req.method !== "GET" && req.method !== "HEAD") {
        return sendJSON(req, res, 405, { error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
    }
    if (!enforceRateLimit(req, res)) return;

    try {
        let fonts = await listFonts();

        const format = String(req.query?.format || "").toLowerCase();
        if (format && FORMATS.has(format)) fonts = fonts.filter((font) => font.type === format);

        const category = String(req.query?.category || "").toLowerCase();
        if (category) fonts = fonts.filter((font) => String(font.category || "").toLowerCase() === category);

        const total = fonts.length;
        const requested = Number.parseInt(req.query?.limit, 10);
        const limit = Number.isFinite(requested) ? Math.min(MAX_LIMIT, Math.max(0, requested)) : total;
        const offset = Math.max(0, Number.parseInt(req.query?.offset, 10) || 0);
        const page = offset === 0 && limit >= total ? fonts : fonts.slice(offset, offset + limit);

        res.setHeader("X-Total-Count", String(total));
        return sendJSON(req, res, 200, page, { cache: CACHE });
    } catch (error) {
        console.error("Typace font discovery failed:", error);
        return sendJSON(req, res, 500, { error: "Unable to scan the fonts directory.", code: "FONT_SCAN_FAILED" });
    }
}
