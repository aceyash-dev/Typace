import { enforceRateLimit } from "./_lib/rate-limit.js";
import { listFonts, findFont, parseFields, parseSlugs, selectFields } from "./_lib/fonts.js";
import { sendJSON } from "./_lib/respond.js";

const CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=3600, stale-if-error=86400";
const CDN = "public, s-maxage=300, stale-while-revalidate=3600";
const FORMATS = new Set(["ttf", "otf", "woff", "woff2"]);
const MAX_LIMIT = 500;

export default async function handler(req, res) {
    if (req.method === "OPTIONS") return sendJSON(req, res, 204, null);
    if (req.method !== "GET" && req.method !== "HEAD") {
        return sendJSON(req, res, 405, { error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
    }
    if (!(await enforceRateLimit(req, res))) return;

    try {
        let fonts = await listFonts();
        let fields;
        try {
            fields = parseFields(req.query?.fields);
        } catch (error) {
            return sendJSON(req, res, 400, { error: error.message, code: error.code, allowed: error.allowed });
        }

        // Batch lookup: resolves each slug in request order and returns null for
        // misses, so one bad slug cannot fail a whole comparison. Takes
        // precedence over format/limit/offset.
        let slugs;
        try {
            slugs = parseSlugs(req.query?.slugs);
        } catch (error) {
            return sendJSON(req, res, 400, { error: error.message, code: error.code, limit: error.limit });
        }
        if (slugs) {
            const matches = slugs.map((slug) => findFont(fonts, slug) || null);
            const found = matches.filter(Boolean).length;
            return sendJSON(req, res, 200, selectFields(matches, fields), {
                cache: CACHE, cdn: CDN, headers: { "X-Total-Count": String(found) },
            });
        }

        const format = String(req.query?.format || "").toLowerCase();
        if (format && !FORMATS.has(format)) {
            return sendJSON(req, res, 400, { error: "Unsupported font format.", code: "INVALID_FORMAT", allowed: [...FORMATS] });
        }
        if (format) fonts = fonts.filter((font) => font.type === format);

        const total = fonts.length;
        const rawLimit = req.query?.limit;
        if (rawLimit !== undefined && rawLimit !== null && rawLimit !== "") {
            const value = Array.isArray(rawLimit) ? rawLimit[0] : rawLimit;
            if (typeof value !== "string" && typeof value !== "number") {
                return sendJSON(req, res, 400, { error: "Limit must be a positive integer.", code: "INVALID_LIMIT" });
            }
            const text = String(value);
            if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text))) {
                return sendJSON(req, res, 400, { error: "Limit must be a positive integer.", code: "INVALID_LIMIT" });
            }
        }
        const requested = rawLimit === undefined || rawLimit === null || rawLimit === ""
            ? total
            : Number(Array.isArray(rawLimit) ? rawLimit[0] : rawLimit);
        const limit = Math.min(MAX_LIMIT, requested);
        const offset = Math.max(0, Number.parseInt(req.query?.offset, 10) || 0);
        const page = offset === 0 && limit >= total ? fonts : fonts.slice(offset, offset + limit);

        return sendJSON(req, res, 200, selectFields(page, fields), {
            cache: CACHE, cdn: CDN, headers: { "X-Total-Count": String(total) },
        });
    } catch (error) {
        console.error("Typace font discovery failed:", error);
        return sendJSON(req, res, 500, { error: "Unable to scan the fonts directory.", code: "FONT_SCAN_FAILED" });
    }
}
