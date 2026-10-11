import { enforceRateLimit } from "./_lib/rate-limit.js";
const BASE_URL = "https://typace.ace-base.cc";

const pages = [
    { path: "/", changefreq: "weekly", priority: "1.0" },
    { path: "/browse", changefreq: "weekly", priority: "0.9" },
    { path: "/browse/woff2", changefreq: "weekly", priority: "0.8" },
    { path: "/browse/woff", changefreq: "weekly", priority: "0.8" },
    { path: "/browse/ttf", changefreq: "weekly", priority: "0.8" },
    { path: "/browse/otf", changefreq: "weekly", priority: "0.8" },
    { path: "/developers", changefreq: "monthly", priority: "0.8" },
    { path: "/privacy", changefreq: "yearly", priority: "0.3" },
    { path: "/terms", changefreq: "yearly", priority: "0.3" },
    { path: "/cookies", changefreq: "yearly", priority: "0.3" },
    { path: "/security", changefreq: "yearly", priority: "0.3" }
];

function escapeXml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

export default function handler(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).send("Method not allowed.");
    }
    if (!enforceRateLimit(req, res)) return;

    const urls = pages.map(page =>
        `  <url><loc>${escapeXml(BASE_URL + page.path)}</loc><changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority></url>`
    );
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(xml);
}
