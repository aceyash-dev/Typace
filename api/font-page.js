import { listFonts, findFont, fontSlug } from "./_lib/fonts.js";
import { applyCommonHeaders } from "./_lib/respond.js";
import { enforceRateLimit } from "./_lib/rate-limit.js";

const BASE = "https://typace.ace-base.cc";

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
}

export function escapeCSSString(value = "") {
    // Escape CSS string delimiters, HTML style-tag delimiters, and control characters.
    return String(value).replace(/[\0-\x1f\x7f"\\<>]/g, char => `\\${char.codePointAt(0).toString(16)} `);
}

function serializeJSONForHTML(value) {
    // Prevent data inside script elements from being parsed as HTML markup.
    return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function formatLabel(font) {
    if (font.format === "truetype") return "TrueType";
    if (font.format === "opentype") return "OpenType";
    return String(font.format || font.type || "").toUpperCase();
}

function sizeLabel(bytes) {
    const value = Number(bytes);
    if (!(value > 0)) return null;
    return value < 1024 * 1024
        ? Math.round(value / 1024) + " KB"
        : (value / (1024 * 1024)).toFixed(2) + " MB";
}

export default async function handler(req, res) {
    applyCommonHeaders(res, req);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.setHeader("Allow", "GET, HEAD, OPTIONS");
        return res.status(405).json({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
    }
    if (!enforceRateLimit(req, res)) return;

    try {
        const font = findFont(await listFonts(), req.query?.slug);
        if (!font) {
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            return res.status(404).send("Font not found.");
        }

        const name = escapeHTML(font.name);
        const cssFamily = escapeCSSString(font.name);
        const slug = fontSlug(font.name);
        const type = String(font.type || "").toUpperCase();
        const typeSlug = String(font.type || "").toLowerCase();
        const label = formatLabel(font);
        const size = sizeLabel(font.sizeBytes);
        const canonical = `${BASE}/font/${slug}`;
        const fileURL = `${BASE}${font.url}`;
        const cssURL = `${BASE}/api/css/${encodeURIComponent(font.name)}`;
        const apiURL = `${BASE}/api/fonts/${encodeURIComponent(font.name)}`;
        const specimenURL = `${BASE}/browse/font/${slug}`;
        const formatURL = `${BASE}/formats/${typeSlug}`;
        const description = `${font.name} is a ${label} (${type}) font available from Typace. Preview it, copy the ready-to-use CSS @font-face rule, or download the original file.`;

        const cssRule = `@font-face {\n  font-family: "${cssFamily}";\n  src: url("${fileURL}") format("${font.format}");\n  font-display: swap;\n}`;

        const faqs = [
            [`How do I use ${font.name} in CSS?`,
             `Add the @font-face rule on this page to your stylesheet, then set font-family: "${font.name}" on the elements that should use it. Include a system fallback, for example: font-family: "${font.name}", system-ui, sans-serif.`],
            [`What format is ${font.name}?`,
             `${font.name} is published as a ${label} file (.${typeSlug}). The catalog reports the exact asset URL and CSS format so you never have to guess the file type.`],
            [`Can I download ${font.name}?`,
             `Yes. Download the original ${type} file directly, or copy the generated @font-face CSS to load it over HTTPS without self-hosting.`],
            [`Is ${font.name} free to use?`,
             `Typace delivers the file but does not change its license. Check the license attached to this typeface before embedding, modifying, redistributing, or bundling it.`]
        ];

        const facts = [["Format", type], ["CSS format", font.format], ["Category", font.category || "unknown"]];
        if (size) facts.push(["File size", size]);

        const graph = [
            {
                "@type": "WebPage",
                "@id": `${canonical}#page`,
                url: canonical,
                name: `${font.name} font`,
                description,
                isPartOf: { "@type": "WebSite", name: "Typace", url: `${BASE}/` },
                breadcrumb: { "@id": `${canonical}#breadcrumb` }
            },
            {
                "@type": "CreativeWork",
                "@id": `${canonical}#font`,
                name: font.name,
                url: canonical,
                description,
                encodingFormat: label,
                contentUrl: fileURL,
                isPartOf: { "@type": "CollectionPage", name: "Typace Font Library", url: `${BASE}/` },
                publisher: { "@type": "Organization", name: "The Ace Base", url: "https://ace-base.cc/" }
            },
            {
                "@type": "BreadcrumbList",
                "@id": `${canonical}#breadcrumb`,
                itemListElement: [
                    { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
                    { "@type": "ListItem", position: 2, name: "Fonts", item: `${BASE}/browse` },
                    { "@type": "ListItem", position: 3, name: font.name, item: canonical }
                ]
            },
            {
                "@type": "FAQPage",
                "@id": `${canonical}#faq`,
                mainEntity: faqs.map(([question, answer]) => ({
                    "@type": "Question", name: question,
                    acceptedAnswer: { "@type": "Answer", text: answer }
                }))
            },
            {
                "@type": "HowTo",
                "@id": `${canonical}#howto`,
                name: `How to use ${font.name} in CSS`,
                step: [
                    { "@type": "HowToStep", position: 1, text: `Copy the @font-face rule for ${font.name}.` },
                    { "@type": "HowToStep", position: 2, text: "Paste the rule into your stylesheet." },
                    { "@type": "HowToStep", position: 3, text: `Set font-family: \"${font.name}\" on the elements that should use it.` },
                    { "@type": "HowToStep", position: 4, text: "Include a system fallback so text stays readable if the file cannot load." }
                ]
            }
        ];

        const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${name} Font — Download, Preview &amp; CSS | Typace</title>
<meta name="description" content="${escapeHTML(description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<meta property="og:type" content="website"><meta property="og:site_name" content="Typace">
<meta property="og:title" content="${name} Font | Typace"><meta property="og:description" content="${escapeHTML(description)}"><meta property="og:url" content="${canonical}">
<script type="application/ld+json">${serializeJSONForHTML({ "@context": "https://schema.org", "@graph": graph })}</script>
<style>
@font-face{font-family:"${cssFamily}";src:url("${fileURL}") format("${font.format}");font-display:swap}
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:860px;margin:0 auto;padding:28px 22px 64px;line-height:1.65;color:#2c2621;background:#fffdf8}
a{color:inherit}
header{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:24px;font-size:13px}
nav.bc{font-size:12px;color:#78675a;margin-bottom:8px}
nav.bc a{text-decoration:none}
h1{font-size:clamp(2.1rem,7vw,3.8rem);line-height:1.03;letter-spacing:-.02em;margin:.1em 0 .35em}
.answer{font-size:1.05rem;max-width:62ch}
.specimen{font-family:"${cssFamily}",system-ui,sans-serif;font-size:clamp(1.9rem,9vw,4.4rem);line-height:1.12;margin:22px 0;padding:22px;border:1px solid #eadfd0;border-radius:16px;background:#fff7e9;overflow-wrap:anywhere}
ul.facts{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}
ul.facts li{border:1px solid #eadfd0;border-radius:999px;padding:6px 12px;font-size:12px}
pre{padding:16px;background:#f4efe7;border-radius:14px;overflow:auto;font-size:12.5px}
.cta{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0 8px}
.cta a{padding:10px 14px;border:1px solid #eadfd0;border-radius:999px;text-decoration:none;font-size:13px}
.cta a.primary{background:#c85c28;border-color:#c85c28;color:#fff}
h2{margin-top:32px;font-size:1.3rem}
h3{margin:18px 0 4px;font-size:1rem}
.muted{color:#78675a;font-size:12.5px}
footer{margin-top:40px;padding-top:18px;border-top:1px solid #eadfd0;font-size:12px;color:#78675a}
</style></head>
<body>
<header><a href="/">Typace</a> · <a href="/browse">Browse</a> · <a href="/formats">Formats</a> · <a href="/developers">Developers</a></header>
<nav class="bc" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/browse">Fonts</a> / <span>${name}</span></nav>
<main>
<h1>${name} font</h1>
<p class="answer">${name} is a ${label} (${type}) typeface available from Typace. Use it on the web with the CSS below, or download the original file.</p>
<div class="specimen" aria-label="${name} specimen">${name} — Aa Bb Cc 0123</div>
<ul class="facts">${facts.map(([k, v]) => `<li><strong>${escapeHTML(k)}:</strong> ${escapeHTML(String(v))}</li>`).join("")}</ul>
<h2>Use ${name} in CSS</h2>
<pre>${escapeHTML(cssRule)}</pre>
<div class="cta">
<a class="primary" href="${specimenURL}">Open the interactive preview</a>
<a href="${fileURL}" download>Download ${name}</a>
<a href="${cssURL}">Generated CSS</a>
<a href="${apiURL}">Font API record</a>
</div>
<h2>Frequently asked questions</h2>
${faqs.map(([q, a]) => `<h3>${escapeHTML(q)}</h3><p>${escapeHTML(a)}</p>`).join("")}
<h2>More ${type} fonts</h2>
<p><a href="${formatURL}">Browse all ${type} fonts</a></p>
<p class="muted">Typace is a font library and font delivery service by The Ace Base. Check the font's license before redistributing or embedding it.</p>
</main>
<footer><a href="/">Typace</a> · <a href="/browse">Browse all fonts</a> · <a href="/formats">Formats</a> · <a href="/faq">FAQ</a> · <a href="/llms.txt">llms.txt</a></footer>
</body></html>`;

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        // Early hint: let the browser start the font fetch before it parses the body.
        res.setHeader("Link", `<${fileURL}>; rel=preload; as=font; type="font/${font.type}"; crossorigin`);
        res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=86400");
        res.setHeader("CDN-Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
        return res.status(200).send(html);
    } catch (error) {
        console.error("Typace font page failed:", error);
        return res.status(500).send("Unable to load font page.");
    }
}
