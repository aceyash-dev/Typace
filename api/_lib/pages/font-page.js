import { listFonts, findFont, fontSlug } from "../fonts.js";
import { applyCommonHeaders } from "../respond.js";
import notFound from "./not-found.js";
import { enforceRateLimit } from "../rate-limit.js";

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
    if (!(await enforceRateLimit(req, res, { scope: "pages" }))) return;

    try {
        const font = findFont(await listFonts(), req.query?.slug);
        // One 404 implementation: the shared page sets no-store, noindex and
        // the site's own styling, which the bare text response did not.
        if (!font) return notFound(req, res);

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

        const facts = [["Format", type], ["CSS format", font.format]];
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
:root{--bg:#fbf5e9;--surface:#fffdf8;--surface-muted:#f3e7d4;--text:#30251f;--muted:#78685b;--line:#e7d8c3;--accent:#ed7418;--accent-dark:#b94b08;--accent-soft:#ffead6;--display:"Grandstander",ui-rounded,system-ui,sans-serif;--body:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;--radius:18px}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{scroll-behavior:smooth;overscroll-behavior-y:none;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--body);line-height:1.65;-webkit-font-smoothing:antialiased}
a{color:inherit}
.wrap{max-width:860px;margin:0 auto;padding:max(18px,env(safe-area-inset-top)) 20px calc(56px + env(safe-area-inset-bottom))}
.top{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 0 18px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.brand{display:inline-flex;align-items:center;gap:9px;font-family:var(--display);font-size:19px;font-weight:700;text-decoration:none}
.brand i{display:block;width:30px;height:30px;border-radius:9px;background:var(--accent);box-shadow:inset 0 0 0 2px var(--surface)}
.top nav{display:flex;gap:16px;font-size:12.5px;color:var(--muted)}
.top nav a{text-decoration:none}
.top nav a:hover{color:var(--accent-dark)}
nav.bc{font-size:12px;color:var(--muted);margin:14px 0 4px}
nav.bc a{text-decoration:none}
h1{font-family:var(--display);font-size:clamp(2rem,6.5vw,3.4rem);line-height:1.04;letter-spacing:-.02em;margin:.2em 0 .3em}
.answer{font-size:1.02rem;max-width:62ch;color:var(--muted);margin:0 0 18px}
ul.facts{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:8px;margin:0 0 26px}
ul.facts li{border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:12px;background:var(--surface)}
ul.facts strong{font-weight:700}
/* Preview screen: the specimen in three sizes, the way the app shows it. */
.preview{border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);box-shadow:0 10px 30px rgba(65,42,24,.055);overflow:hidden;margin:0 0 26px}
.preview-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 18px;border-bottom:1px solid var(--line);background:var(--surface-muted)}
.preview-eyebrow{font-size:10.5px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--accent-dark)}
.preview-ramp{font-size:11px;color:var(--muted);letter-spacing:.06em}
.preview-body{padding:20px 18px 24px;font-family:"${cssFamily}",ui-sans-serif,sans-serif;color:var(--accent-dark);overflow-wrap:anywhere}
.preview-body p{margin:0 0 14px}
.preview-body p:last-child{margin-bottom:0}
.s-xl{font-size:clamp(2.4rem,11vw,5rem);line-height:1.02}
.s-lg{font-size:clamp(1.5rem,5vw,2.4rem);line-height:1.14}
.s-md{font-size:clamp(1.05rem,3.2vw,1.35rem);line-height:1.4}
.s-sm{font-size:clamp(.92rem,2.6vw,1.05rem);line-height:1.5;color:var(--text)}
.preview-body .sample{color:var(--text)}
pre{padding:16px;background:var(--surface-muted);border:1px solid var(--line);border-radius:14px;overflow:auto;font-size:12.5px;line-height:1.6}
.cta{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0 10px}
.cta a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border:1px solid var(--line);border-radius:999px;text-decoration:none;font-size:13px;font-weight:650;background:var(--surface)}
.cta a.primary{background:var(--accent);border-color:var(--accent);color:#fffaf2}
.cta a:hover{border-color:var(--accent-dark)}
h2{font-family:var(--display);margin:34px 0 10px;font-size:1.32rem;letter-spacing:-.01em}
h3{margin:18px 0 4px;font-size:.98rem}
.muted{color:var(--muted);font-size:12.5px}
footer{margin-top:42px;padding-top:18px;border-top:1px solid var(--line);font-size:12px;color:var(--muted);display:flex;gap:14px;flex-wrap:wrap}
footer a{text-decoration:none}
</style></head>
<body>
<div class="wrap">
<header class="top">
  <a class="brand" href="/"><i aria-hidden="true"></i>Typace</a>
  <nav aria-label="Site"><a href="/browse">Browse</a><a href="/formats">Formats</a><a href="/developers">Developers</a><a href="/llms.txt">llms.txt</a></nav>
</header>
<nav class="bc" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/browse">Fonts</a> / <span>${name}</span></nav>
<main>
<h1>${name}</h1>
<p class="answer">${name} is a ${label} (${type}) typeface available from Typace. Preview it below, copy the ready-to-use CSS, or download the original file.</p>
<ul class="facts">${facts.map(([k, v]) => `<li><strong>${escapeHTML(k)}:</strong> ${escapeHTML(String(v))}</li>`).join("")}</ul>

<section class="preview" aria-label="${name} specimen preview">
  <div class="preview-head"><span class="preview-eyebrow">Specimen</span><span class="preview-ramp">${type.toUpperCase()} · ${escapeHTML(String(facts.find(([k]) => /size/i.test(k))?.[1] || "")) || "web"}</span></div>
  <div class="preview-body">
    <p class="s-xl">${name}</p>
    <p class="s-lg sample">The quick brown fox jumps over the lazy dog.</p>
    <p class="s-md">Aa Bb Cc Dd Ee Ff Gg Hh Ii Jj Kk</p>
    <p class="s-sm">0123456789 !?&amp;@#% — set with ${name} in your own project.</p>
  </div>
</section>

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
<footer><a href="/">Typace</a><a href="/browse">Browse all fonts</a><a href="/formats">Formats</a><a href="/faq">FAQ</a><a href="/llms.txt">llms.txt</a></footer>
</div>
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
