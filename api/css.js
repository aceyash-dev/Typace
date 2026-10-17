import { enforceRateLimit } from "./_lib/rate-limit.js";
import { listFonts, findFont } from "./_lib/fonts.js";
import { weakETag } from "./_lib/respond.js";

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Expose-Headers", "RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After, X-API-Version");
    res.setHeader("X-API-Version", "1.1.0");    res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (req.method === "OPTIONS") {
        res.setHeader("Cache-Control", "no-store");
        return res.status(204).end();
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.setHeader("Allow", "GET, HEAD, OPTIONS");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.status(405).json({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
    }
    if (!enforceRateLimit(req, res)) return;

    try {
        const font = findFont(await listFonts(), req.query?.slug);
        if (!font) {
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            return res.status(404).json({ error: "Font not found.", code: "FONT_NOT_FOUND" });
        }

        const family = JSON.stringify(font.name).slice(1, -1);
        // Absolute file URL so the generated CSS works when pasted anywhere.
        const protocol = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
        const host = req.headers.host || "typace.ace-base.cc";
        const fileUrl = `${protocol}://${host}${font.url}`;
        const css = `@font-face {
  font-family: "${family}";
  src: url("${fileUrl}") format("${font.format}");
  font-display: swap;
}`;
        res.setHeader("Content-Type", "text/css; charset=utf-8");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=86400");
        res.setHeader("CDN-Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
        res.setHeader("Link", `<${fileUrl}>; rel=preload; as=font; type="font/${font.type}"; crossorigin`);
        const etag = weakETag(css);
        res.setHeader("ETag", etag);
        if (String(req.headers["if-none-match"] || "").split(",").some((tag) => tag.trim() === etag)) return res.status(304).end();
        if (req.method === "HEAD") return res.status(200).end();
        return res.status(200).send(css);
    } catch (error) {
        console.error("Typace CSS generation failed:", error);
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.status(500).json({ error: "Unable to generate font CSS.", code: "CSS_GENERATION_FAILED" });
    }
}
