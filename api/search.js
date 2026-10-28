import { enforceRateLimit } from "./_lib/rate-limit.js";
import { listFonts, normalize } from "./_lib/fonts.js";
import { sendJSON } from "./_lib/respond.js";

// Same cache shape as the catalog: search results are derived from it, so they
// can be revalidated just as cheaply.
const CACHE = "public, max-age=30, s-maxage=120, stale-while-revalidate=600";
const CDN = "public, s-maxage=120, stale-while-revalidate=600";

export default async function handler(req, res) {
    if (req.method === "OPTIONS") return sendJSON(req, res, 204, null);
    if (req.method !== "GET" && req.method !== "HEAD") {
        return sendJSON(req, res, 405, { error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
    }
    if (!enforceRateLimit(req, res)) return;

    try {
        const fonts = await listFonts();
        const query = String(Array.isArray(req.query?.q) ? req.query.q[0] || "" : req.query?.q || "").trim().slice(0, 200);
        if (!query) return sendJSON(req, res, 200, fonts, { cache: CACHE, cdn: CDN });

        const terms = normalize(query).split("-").filter(Boolean);
        if (!terms.length) return sendJSON(req, res, 200, [], { cache: CACHE, cdn: CDN });

        const matches = fonts.filter(font => {
            const tokens = normalize(`${font.name} ${font.file} ${font.type} ${font.format}`)
                .split("-")
                .filter(Boolean);
            return terms.every(term => tokens.some(token => token.startsWith(term)));
        });
        return sendJSON(req, res, 200, matches, { cache: CACHE, cdn: CDN });
    } catch (error) {
        console.error("Typace font search failed:", error);
        return sendJSON(req, res, 500, { error: "Unable to search fonts.", code: "FONT_SEARCH_FAILED" });
    }
}
