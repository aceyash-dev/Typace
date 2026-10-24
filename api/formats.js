import { listFonts } from "./_lib/fonts.js";
import formatsPageHandler from "./_lib/formats-page.js";
import { applyCommonHeaders } from "./_lib/respond.js";
import { enforceRateLimit } from "./_lib/rate-limit.js";

const BASE = "https://typace.ace-base.cc";

const FORMATS = [
    ["woff2", "WOFF2", "Modern webfont format for browsers"],
    ["ttf", "TrueType", "TrueType font files"],
    ["otf", "OpenType", "OpenType font files"]
];

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
}

export default async function handler(req, res) {
    applyCommonHeaders(res, req);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.setHeader("Allow", "GET, HEAD, OPTIONS");
        return res.status(405).json({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
    }
    if (!enforceRateLimit(req, res)) return;
    // Serve /formats and /formats/:slug from one function on Vercel Hobby.
    // Keep both forms behind the same per-client request limit.
    if (req.query?.slug) return formatsPageHandler(req, res);

    try {
        const fonts = await listFonts();
        const canonical = `${BASE}/formats`;
        const description = "Browse the Typace font library by file format — WOFF2, TrueType (TTF), and OpenType (OTF) — with per-font CSS and downloads.";

        const items = FORMATS.map(([slug, label, copy]) => {
            const count = fonts.filter(font => font.type === slug).length;
            return `<li><a href="/formats/${slug}"><strong>${label} fonts</strong><span>${escapeHTML(copy)}</span><small>${count} font${count === 1 ? "" : "s"}</small></a></li>`;
        }).join("");

        const faqs = [
            ["What font formats does Typace offer?",
             "Typace publishes WOFF2 webfonts, TrueType (TTF), and OpenType (OTF) files. Every catalog record reports its exact format, so you never have to guess."],
            ["Which format should I use on the web?",
             "Prefer WOFF2 for browsers — it is the smallest and is supported everywhere modern. Use TTF or OTF when you need the original desktop file."],
            ["How do I load a Typace font?",
             "Open any font page to copy a ready-to-use @font-face rule, an @import, a <link> tag, or the plain asset URL."]
        ];

        const graph = [
            { "@type": "CollectionPage", "@id": `${canonical}#page`, url: canonical, name: "Fonts by format", description,
              isPartOf: { "@type": "WebSite", name: "Typace", url: `${BASE}/` } },
            { "@type": "ItemList", "@id": `${canonical}#list`, itemListElement: FORMATS.map(([slug, label], index) => ({
                "@type": "ListItem", position: index + 1, name: `${label} fonts`, url: `${BASE}/formats/${slug}` })) },
            { "@type": "BreadcrumbList", "@id": `${canonical}#breadcrumb`, itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
                { "@type": "ListItem", position: 2, name: "Formats", item: canonical }] },
            { "@type": "FAQPage", "@id": `${canonical}#faq`, mainEntity: faqs.map(([q, a]) => ({
                "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }
        ];

        const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Font Formats — WOFF2, TTF &amp; OTF | Typace</title>
<meta name="description" content="${escapeHTML(description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<meta property="og:type" content="website"><meta property="og:site_name" content="Typace">
<meta property="og:title" content="Font Formats | Typace"><meta property="og:description" content="${escapeHTML(description)}"><meta property="og:url" content="${canonical}">
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph })}</script>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:860px;margin:0 auto;padding:28px 22px 64px;line-height:1.65;color:#2c2621;background:#fffdf8}
a{color:inherit}header{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:24px;font-size:13px}
h1{font-size:clamp(2.1rem,7vw,3.6rem);line-height:1.03;letter-spacing:-.02em;margin:.1em 0 .3em}
.answer{font-size:1.05rem;max-width:62ch}
ul{list-style:none;padding:0;display:grid;gap:12px;margin:22px 0}
ul li a{display:block;padding:18px;border:1px solid #eadfd0;border-radius:16px;text-decoration:none}
ul li a:hover{border-color:#c85c28}
strong,span,small{display:block}span,small{color:#78675a;font-size:.88rem}small{margin-top:6px}
h2{margin-top:32px;font-size:1.3rem}h3{margin:18px 0 4px;font-size:1rem}
footer{margin-top:40px;padding-top:18px;border-top:1px solid #eadfd0;font-size:12px;color:#78675a}
</style></head>
<body>
<header><a href="/">Typace</a> · <a href="/browse">Browse</a> · <a href="/formats">Formats</a> · <a href="/developers">Developers</a></header>
<main>
<h1>Fonts by format</h1>
<p class="answer">Typace publishes fonts as WOFF2 webfonts, TrueType (TTF), and OpenType (OTF). Pick a format to browse every published file, or open a font page for ready-to-use CSS.</p>
<ul>${items}</ul>
<h2>Frequently asked questions</h2>
${faqs.map(([q, a]) => `<h3>${escapeHTML(q)}</h3><p>${escapeHTML(a)}</p>`).join("")}
</main>
<footer><a href="/">Typace</a> · <a href="/browse">Browse all fonts</a> · <a href="/llms.txt">llms.txt</a></footer>
</body></html>`;

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
        return res.status(200).send(html);
    } catch (error) {
        console.error("Typace formats page failed:", error);
        return res.status(500).send("Unable to load font formats.");
    }
}
