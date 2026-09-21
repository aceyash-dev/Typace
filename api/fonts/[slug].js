import { listFonts, findFont } from "../_lib/fonts.js";

export default async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
    try {
        const font = findFont(await listFonts(), req.query?.slug);
        if (!font) return res.status(404).json({ error: "Font not found.", code: "FONT_NOT_FOUND" });
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=3600");
        return res.status(200).json(font);
    } catch (error) {
        console.error("Typace font lookup failed:", error);
        return res.status(500).json({ error: "Unable to load font metadata.", code: "FONT_LOOKUP_FAILED" });
    }
}
