import { enforceRateLimit } from "./_lib/rate-limit.js";
import { listFonts, findFont, fontFaceCss, fontFileUrl } from "./_lib/fonts.js";
import { applyCommonHeaders, weakETag, sendJSON } from "./_lib/respond.js";

const CACHE = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=86400";
const CDN = "public, s-maxage=3600, stale-while-revalidate=86400";

export default async function handler(req, res) {
    if (req.method === "OPTIONS") return sendJSON(req, res, 204, null);
    if (req.method !== "GET" && req.method !== "HEAD") {
        return sendJSON(req, res, 405, { error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
    }
    if (!enforceRateLimit(req, res)) return;

    try {
        const font = findFont(await listFonts(), req.query?.slug);
        if (!font) return sendJSON(req, res, 404, { error: "Font not found.", code: "FONT_NOT_FOUND" });

        // Canonical origin; Host and forwarded headers are request-controlled.
        const fileUrl = fontFileUrl(font);
        const css = fontFaceCss(font);

        applyCommonHeaders(res, req);
        res.setHeader("Content-Type", "text/css; charset=utf-8");
        res.setHeader("Cache-Control", CACHE);
        res.setHeader("CDN-Cache-Control", CDN);
        res.setHeader("Link", `<${fileUrl}>; rel=preload; as=font; type="font/${font.type}"; crossorigin`);

        const etag = weakETag(css);
        res.setHeader("ETag", etag);
        const ifNoneMatch = String(req.headers?.["if-none-match"] || "");
        if (ifNoneMatch.trim() === "*" || ifNoneMatch.split(",").some((tag) => tag.trim() === etag)) {
            return res.status(304).end();
        }
        if (req.method === "HEAD") return res.status(200).end();
        return res.status(200).send(css);
    } catch (error) {
        console.error("Typace CSS generation failed:", error);
        return sendJSON(req, res, 500, { error: "Unable to generate font CSS.", code: "CSS_GENERATION_FAILED" });
    }
}
