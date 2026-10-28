import { enforceRateLimit } from "./_lib/rate-limit.js";
import { listFonts, findFont } from "./_lib/fonts.js";
import { sendJSON } from "./_lib/respond.js";

const CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=3600, stale-if-error=86400";
const CDN = "public, s-maxage=300, stale-while-revalidate=3600";

export default async function handler(req, res) {
    if (req.method === "OPTIONS") return sendJSON(req, res, 204, null);
    if (req.method !== "GET" && req.method !== "HEAD") {
        return sendJSON(req, res, 405, { error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
    }
    if (!(await enforceRateLimit(req, res))) return;

    try {
        const font = findFont(await listFonts(), req.query?.slug);
        if (!font) return sendJSON(req, res, 404, { error: "Font not found.", code: "FONT_NOT_FOUND" });
        return sendJSON(req, res, 200, font, { cache: CACHE, cdn: CDN });
    } catch (error) {
        console.error("Typace font lookup failed:", error);
        return sendJSON(req, res, 500, { error: "Unable to load font metadata.", code: "FONT_LOOKUP_FAILED" });
    }
}
