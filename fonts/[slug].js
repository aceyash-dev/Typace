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
        const description = `Use ${font.name} from Typace as a ${font.type.toUpperCase()} web font. Download or use the generated CSS declaration from the Typace API.`;
        const canonical = `https://typace.ace-base.cc/fonts/${encodeURIComponent(font.name)}`;
        const fileURL = `https://typace.ace-base.cc${font.url}`;
        const cssURL = `https://typace.ace-base.cc/api/css/${encodeURIComponent(font.name)}`;

        const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${name} · Typace</title>
<meta name="description" content="${escapeHTML(description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Typace">
<meta property="og:title" content="${name} · Typace">
<meta property="og:description" content="${escapeHTML(description)}">
<meta property="og:url" content="${canonical}">
<script type="application/ld+json">${JSON.stringify({
    "@context":"https://schema.org",
    "@type":"CreativeWork",
    name:font.name,
    url:canonical,
    description,
    encodingFormat:font.format,
    contentUrl:fileURL,
    isPartOf:{"@type":"CollectionPage",name:"Typace Font Library",url:"https://typace.ace-base.cc/"}
})}</script>
<style>
body{font-family:system-ui,sans-serif;max-width:900px;margin:0 auto;padding:48px 24px;line-height:1.6}
h1{font-size:clamp(2.5rem,8vw,6rem);margin:.2em 0}
.meta{display:flex;gap:12px;flex-wrap:wrap}.meta span{padding:6px 10px;border:1px solid #ddd;border-radius:999px}
a{color:inherit}
</style>
</head>
<body>
<header><a href="/">Typace</a></header>
<main>
<p>Font</p>
<h1>${name}</h1>
<p>${escapeHTML(description)}</p>
<div class="meta"><span>${escapeHTML(font.type.toUpperCase())}</span><span>${escapeHTML(font.format)}</span></div>
<p><a href="${fileURL}" download>Download font</a> · <a href="${cssURL}">Get CSS</a></p>
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
