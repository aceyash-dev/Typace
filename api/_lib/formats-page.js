import { listFonts } from "./fonts.js";

const BASE = "https://typace.ace-base.cc";

const FORMATS = {
    woff2: ["WOFF2", "woff2", "Modern webfont format for browsers"],
    ttf: ["TrueType", "ttf", "TrueType font files"],
    otf: ["OpenType", "otf", "OpenType font files"]
};

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
}

function slugify(value) {
    return String(value || "")
        .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export default async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).send("Method not allowed.");

    const key = String(req.query?.slug || "").toLowerCase();
    const format = FORMATS[key];
    if (!format) return res.status(404).send("Font format not found.");

    try {
        const [label, type, copy] = format;
        const fonts = (await listFonts()).filter(font => font.type === type);
        const canonical = `${BASE}/formats/${key}`;
        const description = `Browse ${fonts.length} ${label} font ${fonts.length === 1 ? "file" : "files"} published by Typace. Each font page includes a ready-to-use CSS @font-face rule and a download link.`;

        const items = fonts
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
            .map(font => `<li><a href="/font/${slugify(font.name)}"><strong>${escapeHTML(font.name)}</strong><span>${escapeHTML(font.name)} is available as a ${escapeHTML(label)} (${escapeHTML(type.toUpperCase())}) font through Typace.</span></a></li>`)
            .join("");

        const faqs = [
            [`What are ${label} fonts?`, `${copy}. ${label} is one of the file formats Typace publishes.`],
            [`How many ${label} fonts does Typace have?`, `The live catalog currently lists ${fonts.length} ${label} ${fonts.length === 1 ? "font" : "fonts"}.`],
            [`How do I use a ${label} font?`, `Open a font page to copy the @font-face rule, an @import, or a <link> tag, then set font-family on your elements.`]
        ];

        const graph = [
            { "@type": "CollectionPage", "@id": `${canonical}#page`, url: canonical, name: `${label} fonts`, description,
              isPartOf: { "@type": "WebSite", name: "Typace", url: `${BASE}/` }, numberOfItems: fonts.length },
            { "@type": "ItemList", "@id": `${canonical}#list`, numberOfItems: fonts.length,
              itemListElement: fonts.slice(0, 100).map((font, index) => ({
                  "@type": "ListItem", position: index + 1, name: font.name, url: `${BASE}/font/${slugify(font.name)}` })) },
            { "@type": "BreadcrumbList", "@id": `${canonical}#breadcrumb`, itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
                { "@type": "ListItem", position: 2, name: "Formats", item: `${BASE}/formats` },
                { "@type": "ListItem", position: 3, name: `${label} fonts`, item: canonical }] },
            { "@type": "FAQPage", "@id": `${canonical}#faq`, mainEntity: faqs.map(([q, a]) => ({
                "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }
        ];

        const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${label} Fonts — Free Download &amp; CSS | Typace</title>
<meta name="description" content="${escapeHTML(description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<meta property="og:type" content="website"><meta property="og:site_name" content="Typace">
<meta property="og:title" content="${label} Fonts | Typace"><meta property="og:description" content="${escapeHTML(description)}"><meta property="og:url" content="${canonical}">
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph })}</script>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:960px;margin:0 auto;padding:28px 22px 64px;line-height:1.6;color:#2c2621;background:#fffdf8}
a{color:inherit}header{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:20px;font-size:13px}
nav.bc{font-size:12px;color:#78675a;margin-bottom:8px}nav.bc a{text-decoration:none}
h1{font-size:clamp(2.1rem,7vw,3.6rem);line-height:1.03;letter-spacing:-.02em;margin:.1em 0 .3em}
.answer{font-size:1.05rem;max-width:64ch}
ul{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin:22px 0}
ul li a{display:block;height:100%;padding:16px;border:1px solid #eadfd0;border-radius:16px;text-decoration:none}
ul li a:hover{border-color:#c85c28}
strong,span{display:block}span{font-size:.85rem;color:#78675a}
h2{margin-top:32px;font-size:1.3rem}h3{margin:18px 0 4px;font-size:1rem}
footer{margin-top:40px;padding-top:18px;border-top:1px solid #eadfd0;font-size:12px;color:#78675a}
</style></head>
<body>
<header><a href="/">Typace</a> · <a href="/browse">Browse</a> · <a href="/formats">Formats</a> · <a href="/developers">Developers</a></header>
<nav class="bc" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/formats">Formats</a> / <span>${label}</span></nav>
<main>
<h1>${label} fonts</h1>
<p class="answer">${fonts.length} ${label} font ${fonts.length === 1 ? "file is" : "files are"} published by Typace. Open a font page for a ready-to-use CSS @font-face rule and a direct download.</p>
<ul>${items || "<li>No fonts are currently published in this format.</li>"}</ul>
<h2>Frequently asked questions</h2>
${faqs.map(([q, a]) => `<h3>${escapeHTML(q)}</h3><p>${escapeHTML(a)}</p>`).join("")}
</main>
<footer><a href="/">Typace</a> · <a href="/browse">Browse all fonts</a> · <a href="/formats">All formats</a> · <a href="/llms.txt">llms.txt</a></footer>
</body></html>`;

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
        return res.status(200).send(html);
    } catch (error) {
        console.error("Typace format page failed:", error);
        return res.status(500).send("Unable to load font format.");
    }
}
