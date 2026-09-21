import { listFonts, findFont } from "../_lib/fonts.js";

export default async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).send("Method not allowed.");
    try {
        const font = findFont(await listFonts(), req.query?.slug);
        if (!font) return res.status(404).send("Font not found.");
        const family = font.name.replace(/["\\]/g, "\\$&");
        const css = `@font-face {
  font-family: "${family}";
  src: url("${font.url}") format("${font.format}");
  font-display: swap;
}`;
        res.setHeader("Content-Type", "text/css; charset=utf-8");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
        return res.status(200).send(css);
    } catch (error) {
        console.error("Typace CSS generation failed:", error);
        return res.status(500).send("Unable to generate font CSS.");
    }
}
