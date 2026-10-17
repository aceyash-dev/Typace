import { enforceRateLimit } from "./_lib/rate-limit.js";
import { listFonts } from "./_lib/fonts.js";

const BASE_URL = "https://typace.ace-base.cc";

const pages = [
    { path: "/", changefreq: "weekly", priority: "1.0" },
    { path: "/browse", changefreq: "weekly", priority: "0.9" },
    { path: "/formats", changefreq: "weekly", priority: "0.8" },
    { path: "/formats/woff2", changefreq: "weekly", priority: "0.8" },
    { path: "/formats/ttf", changefreq: "weekly", priority: "0.8" },
    { path: "/formats/otf", changefreq: "weekly", priority: "0.8" },
    { path: "/faq", changefreq: "monthly", priority: "0.6" },
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

// Kept in sync with slugFor() in src/lib/fonts.js so sitemap URLs match the
// shareable specimen deep links the app generates.
function slugify(value) {
    return String(value || "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export default async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.setHeader("Allow", "GET, HEAD, OPTIONS");
        return res.status(405).send("Method not allowed.");
    }
    if (!enforceRateLimit(req, res)) return;

    let fontPages = [];
    try {
        const fonts = await listFonts();
        fontPages = fonts
            .map(font => ({ path: `/font/${slugify(font.name)}`, changefreq: "monthly", priority: "0.7" }))
            .filter(page => page.path !== "/font/");
    } catch {
        // The sitemap still lists the static pages if the catalog is unavailable.
    }

    const urls = [...pages, ...fontPages].map(page =>
        `  <url><loc>${escapeXml(BASE_URL + page.path)}</loc><changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority></url>`
    );
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(xml);
}
