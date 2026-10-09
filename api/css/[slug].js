import { listFonts, findFont } from "../_lib/fonts.js";

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET, OPTIONS");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.status(405).json({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
    }

    try {
        const font = findFont(await listFonts(), req.query?.slug);
        if (!font) {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            return res.status(404).json({ error: "Font not found.", code: "FONT_NOT_FOUND" });
        }

        const family = JSON.stringify(font.name).slice(1, -1);
        const css = `@font-face {
  font-family: "${family}";
  src: url("${font.url}") format("${font.format}");
  font-display: swap;
}`;
        res.setHeader("Content-Type", "text/css; charset=utf-8");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
        return res.status(200).send(css);
    } catch (error) {
        console.error("Typace CSS generation failed:", error);
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.status(500).json({ error: "Unable to generate font CSS.", code: "CSS_GENERATION_FAILED" });
    }
}
