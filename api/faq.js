import { applyCommonHeaders } from "./_lib/respond.js";

const BASE = "https://typace.ace-base.cc";

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
}

function serializeJSONForHTML(value) {
    return JSON.stringify(value)
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/&/g, "\\u0026");
}

// Direct, self-contained answers. Each is written to be quotable on its own by
// an answer engine, without needing the surrounding page for context.
const QA = [
    ["What is Typace?",
     "Typace is a free font library and font delivery service by The Ace Base. It publishes typefaces as WOFF2, TrueType (TTF), and OpenType (OTF) files, with a live catalog API, so you can preview a font, copy its ready-to-use CSS, and download the original file."],
    ["How do I add a Typace font to my website?",
     "Fetch the catalog at https://typace.ace-base.cc/api/fonts, pick a font, then add its @font-face rule to your stylesheet and set font-family on the elements that should use it. You can copy the rule from any font page, or load it with @import or a <link> tag."],
    ["Are Typace fonts free to use?",
     "Typace delivers the files but does not change their licenses. Each typeface keeps its own license, so check the license attached to the font before embedding, modifying, redistributing, or bundling it."],
    ["What font formats does Typace support?",
     "Typace publishes WOFF2 (recommended for the web), TrueType (TTF), and OpenType (OTF). Every catalog record reports its exact format and asset URL, so you never have to guess the file type."],
    ["How do I get the CSS for a font?",
     "Open the font's page and copy the @font-face rule, or request it from the API at https://typace.ace-base.cc/api/css/{slug}. The API returns an absolute asset URL, so the generated rule works when pasted into any stylesheet."],
    ["Can I use Typace without JavaScript?",
     "Yes. Font pages, format pages, this FAQ, the catalog API, and llms.txt are plain HTML or JSON and render without JavaScript."],
    ["How many fonts does Typace have?",
     "The live catalog is the source of truth. Fetch https://typace.ace-base.cc/api/fonts to get the current count and the full list of published fonts."],
    ["Does Typace have an API?",
     "Yes. Typace exposes a public read-only API with endpoints for the catalog, search, a single font record, generated CSS, and commit metadata. See the developer guide at https://typace.ace-base.cc/developers and the OpenAPI contract at https://typace.ace-base.cc/api/openapi.json."],
    ["Can I self-host a Typace font?",
     "Yes, if the font's license allows it. Download the original file from its font page and serve it yourself; the license, not the delivery method, governs what you may do."]
];

const HOWTO = [
    "Find a font in the catalog at https://typace.ace-base.cc/browse, or fetch https://typace.ace-base.cc/api/fonts.",
    "Open the font's page and copy its @font-face rule.",
    "Paste the rule into your stylesheet.",
    "Set font-family to the font's name, with a system fallback such as system-ui, sans-serif."
];

export default function handler(req, res) {
    applyCommonHeaders(res, req);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.setHeader("Allow", "GET, HEAD, OPTIONS");
        return res.status(405).json({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
    }

    const canonical = `${BASE}/faq`;
    const description = "Answers to common questions about Typace: what it is, how to add a font to your website, supported formats, licensing, and the catalog API.";

    const graph = [
        { "@type": "WebPage", "@id": `${canonical}#page`, url: canonical, name: "Typace — frequently asked questions", description,
          isPartOf: { "@type": "WebSite", name: "Typace", url: `${BASE}/` }, breadcrumb: { "@id": `${canonical}#breadcrumb` } },
        { "@type": "BreadcrumbList", "@id": `${canonical}#breadcrumb`, itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
            { "@type": "ListItem", position: 2, name: "FAQ", item: canonical }] },
        { "@type": "FAQPage", "@id": `${canonical}#faq`, mainEntity: QA.map(([q, a]) => ({
            "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
        { "@type": "HowTo", "@id": `${canonical}#howto`, name: "How to add a Typace font to your website",
          step: HOWTO.map((text, index) => ({ "@type": "HowToStep", position: index + 1, text })) }
    ];

    const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Typace FAQ — Adding Fonts, Formats &amp; Licensing</title>
<meta name="description" content="${escapeHTML(description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<meta property="og:type" content="website"><meta property="og:site_name" content="Typace">
<meta property="og:title" content="Typace FAQ"><meta property="og:description" content="${escapeHTML(description)}"><meta property="og:url" content="${canonical}">
<script type="application/ld+json">${serializeJSONForHTML({ "@context": "https://schema.org", "@graph": graph })}</script>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:800px;margin:0 auto;padding:28px 22px 64px;line-height:1.68;color:#2c2621;background:#fffdf8}
a{color:inherit}
header{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:22px;font-size:13px}
nav.bc{font-size:12px;color:#78675a;margin-bottom:8px}nav.bc a{text-decoration:none}
h1{font-size:clamp(2rem,6.5vw,3.2rem);line-height:1.04;letter-spacing:-.02em;margin:.1em 0 .4em}
.lede{font-size:1.05rem;max-width:60ch}
h2{margin:30px 0 6px;font-size:1.16rem;letter-spacing:-.01em}
h2+p{margin:0 0 4px}
.cta{display:flex;flex-wrap:wrap;gap:10px;margin:26px 0}
.cta a{padding:10px 14px;border:1px solid #eadfd0;border-radius:999px;text-decoration:none;font-size:13px}
.cta a.primary{background:#c85c28;border-color:#c85c28;color:#fff}
footer{margin-top:40px;padding-top:18px;border-top:1px solid #eadfd0;font-size:12px;color:#78675a}
</style></head>
<body>
<header><a href="/">Typace</a> · <a href="/browse">Browse</a> · <a href="/formats">Formats</a> · <a href="/developers">Developers</a> · <a href="/llms.txt">llms.txt</a></header>
<nav class="bc" aria-label="Breadcrumb"><a href="/">Home</a> / <span>FAQ</span></nav>
<main>
<h1>Typace FAQ</h1>
<p class="lede">Short answers about the Typace font library — what it is, how to add a font to your website, which formats are published, and how licensing works.</p>
<div class="cta"><a class="primary" href="/browse">Browse the font library</a><a href="/formats">Fonts by format</a><a href="/developers">Developer guide</a></div>
${QA.map(([q, a]) => `<h2>${escapeHTML(q)}</h2>\n<p>${escapeHTML(a)}</p>`).join("\n")}
</main>
<footer><a href="/">Typace</a> · <a href="/browse">Browse</a> · <a href="/formats">Formats</a> · <a href="/developers">Developers</a> · <a href="/llms.txt">llms.txt</a></footer>
</body></html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(html);
}
