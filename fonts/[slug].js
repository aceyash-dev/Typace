import { listFonts, findFont } from "../api/_lib/fonts.js";

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
}

export default async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).send("Method not allowed.");

    try {
        const font = findFont(await listFonts(), req.query?.slug);
        if (!font) return res.status(404).send("Font not found.");

        const name = escapeHTML(font.name);
        const description = `Download ${font.name} from Typace or use it on the web with a generated CSS @font-face declaration. This ${font.type.toUpperCase()} font is part of the Typace font library by The Ace Base.`;
        const canonical = `https://typace.ace-base.cc/fonts/${encodeURIComponent(font.name)}`;
        const fileURL = `https://typace.ace-base.cc${font.url}`;
        const cssURL = `https://typace.ace-base.cc/api/css/${encodeURIComponent(font.name)}`;
        const apiURL = `https://typace.ace-base.cc/api/fonts/${encodeURIComponent(font.name)}`;
        const formatLabel = font.format === "truetype" ? "TrueType" : font.format === "opentype" ? "OpenType" : String(font.format || font.type).toUpperCase();

        const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${name} Font | Download & CSS | Typace</title>
<meta name="description" content="${escapeHTML(description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Typace">
<meta property="og:title" content="${name} Font | Download & CSS | Typace">
<meta property="og:description" content="${escapeHTML(description)}">
<meta property="og:url" content="${canonical}">
<script type="application/ld+json">${JSON.stringify({
    "@context":"https://schema.org",
    "@graph":[
        {"@type":"WebPage","name":`${font.name} Font`,"url":canonical,"description":description,"isPartOf":{"@type":"WebSite","name":"Typace","url":"https://typace.ace-base.cc/"}},
        {"@type":"CreativeWork","name":font.name,"url":canonical,"description":description,"encodingFormat":formatLabel,"contentUrl":fileURL,"isPartOf":{"@type":"CollectionPage","name":"Typace Font Library","url":"https://typace.ace-base.cc/"},"publisher":{"@type":"Organization","name":"The Ace Base","url":"https://ace-base.cc/"}}
    ]
})}</script>
<style>
body{font-family:system-ui,sans-serif;max-width:900px;margin:0 auto;padding:48px 24px;line-height:1.6;color:#29251f}
h1{font-size:clamp(2.5rem,8vw,6rem);margin:.2em 0;line-height:1}
.meta{display:flex;gap:12px;flex-wrap:wrap}.meta span{padding:6px 10px;border:1px solid #ddd;border-radius:999px}
.links{display:flex;gap:10px;flex-wrap:wrap;margin:24px 0}.links a{padding:10px 14px;border:1px solid #ddd;border-radius:999px;color:inherit;text-decoration:none}.links a:hover{border-color:#ee6716}
pre{padding:18px;background:#f4efe7;border-radius:14px;overflow:auto}a{color:inherit}.muted{color:#766e62}
</style>
</head>
<body>
<header><a href="/">Typace</a> · <a href="/browse">Browse fonts</a> · <a href="/developers">Developers</a></header>
<main>
<p>FONT</p>
<h1>${name}</h1>
<p>${escapeHTML(description)}</p>
<div class="meta"><span>${escapeHTML(font.type.toUpperCase())}</span><span>${escapeHTML(formatLabel)}</span><span>Webfont</span></div>
<div class="links"><a href="${fileURL}" download>Download font</a><a href="${cssURL}">Get CSS</a><a href="${apiURL}">Font API</a></div>
<h2>Use ${name} on the web</h2>
<pre>@font-face {
  font-family: "${escapeHTML(font.name)}";
  src: url("${fileURL}") format("${escapeHTML(font.format)}");
  font-display: swap;
}</pre>
<p class="muted">Typace is a font library and font delivery service by The Ace Base. Check the font's license before redistributing or embedding it in a project.</p>
</main>
</body>
</html>`;

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
        return res.status(200).send(html);
    } catch (error) {
        console.error("Typace font page failed:", error);
        return res.status(500).send("Unable to load font page.");
    }
}
