import { enforceRateLimit } from "./_lib/rate-limit.js";
import { listFonts, normalize, parseFields, selectFields } from "./_lib/fonts.js";
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
    if (!(await enforceRateLimit(req, res))) return;

    try {
        const fonts = await listFonts();
        let fields;
        try {
            fields = parseFields(req.query?.fields);
        } catch (error) {
            return sendJSON(req, res, 400, { error: error.message, code: error.code, allowed: error.allowed });
        }
        const query = String(Array.isArray(req.query?.q) ? req.query.q[0] || "" : req.query?.q || "").trim().slice(0, 200);
        if (!query) return sendJSON(req, res, 200, selectFields(fonts, fields), {
            cache: CACHE, cdn: CDN, headers: { "X-Total-Count": String(fonts.length) },
        });

        const terms = normalize(query).split("-").filter(Boolean);
        if (!terms.length) return sendJSON(req, res, 200, [], {
            cache: CACHE, cdn: CDN, headers: { "X-Total-Count": "0" },
        });

        const matches = fonts.filter(font => {
            const tokens = normalize(`${font.name} ${font.file} ${font.type} ${font.format}`)
                .split("-")
                .filter(Boolean);
            return terms.every(term => tokens.some(token => token.startsWith(term)));
        });
        return sendJSON(req, res, 200, selectFields(matches, fields), {
            cache: CACHE, cdn: CDN, headers: { "X-Total-Count": String(matches.length) },
        });
    } catch (error) {
        console.error("Typace font search failed:", error);
        return sendJSON(req, res, 500, { error: "Unable to search fonts.", code: "FONT_SEARCH_FAILED" });
    }
}
