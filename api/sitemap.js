import { listFonts } from "./_lib/fonts.js";

export default async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).send("Method not allowed.");

    try {
        const fonts = await listFonts();
        const urls = [
            `  <url><loc>https://typace.ace-base.cc/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
            `  <url><loc>https://typace.ace-base.cc/browse</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>`,
            `  <url><loc>https://typace.ace-base.cc/browse/woff2</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
            `  <url><loc>https://typace.ace-base.cc/browse/woff</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
            `  <url><loc>https://typace.ace-base.cc/browse/ttf</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
            `  <url><loc>https://typace.ace-base.cc/browse/otf</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
            `  <url><loc>https://typace.ace-base.cc/developers</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>`,
            ...fonts.map(font =>
                `  <url><loc>https://typace.ace-base.cc/fonts/${encodeURIComponent(font.name)}</loc><lastmod>${font.updatedAt || font.createdAt || new Date().toISOString()}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`
            )
        ];
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
        res.setHeader("Content-Type", "application/xml; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
        return res.status(200).send(xml);
    } catch (error) {
        console.error("Typace sitemap generation failed:", error);
        return res.status(500).send("Unable to generate sitemap.");
    }
}
