import { listFonts } from "../api/_lib/fonts.js";

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[char]));
}

export default async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).send("Method not allowed.");
    try {
        const fonts = await listFonts();
        const formats = [
            ["woff2","WOFF2","Modern webfont format for browsers"],
            ["ttf","TrueType","TrueType font files"],
            ["otf","OpenType","OpenType font files"]
        ];
        const cards = formats.map(([slug,label,copy]) => {
            const count = fonts.filter(font => font.type === slug).length;
            return `<li><a href="/browse/${slug}"><strong>${label}</strong><span>${escapeHTML(copy)}</span><small>${count} font${count===1?"":"s"}</small></a></li>`;
        }).join("");
        const canonical = "https://typace.ace-base.cc/browse";
        const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Browse Fonts by Format | Typace</title>
<meta name="description" content="Browse the Typace font library by webfont and font file format, including WOFF2, TrueType, and OpenType.">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="website"><meta property="og:site_name" content="Typace">
<meta property="og:title" content="Browse Fonts by Format | Typace"><meta property="og:description" content="Browse Typace fonts by supported font format.">
<meta property="og:url" content="${canonical}">
<script type="application/ld+json">${JSON.stringify({
 "@context":"https://schema.org","@type":"CollectionPage","name":"Browse Fonts by Format","url":canonical,
 "description":"Browse the Typace font library by supported font format.",
 "isPartOf":{"@type":"WebSite","name":"Typace","url":"https://typace.ace-base.cc/"},
 "publisher":{"@type":"Organization","name":"The Ace Base","url":"https://ace-base.cc/"}
})}</script>
<style>
body{font-family:system-ui,sans-serif;max-width:900px;margin:auto;padding:48px 24px;line-height:1.6;color:#29251f}
h1{font-size:clamp(2.4rem,8vw,5rem);line-height:1;margin:.2em 0}.lead{color:#766e62;max-width:700px}
ul{list-style:none;padding:0;display:grid;gap:14px}li a{display:block;padding:20px;border:1px solid #ddd6ca;border-radius:18px;text-decoration:none;color:inherit}li a:hover{border-color:#ee6716}strong,span,small{display:block}span,small{color:#766e62;font-size:.9rem}small{margin-top:6px}
nav{margin-bottom:40px}nav a{color:inherit}
</style></head><body><nav><a href="/">← Typace</a></nav><main>
<p>FONT LIBRARY</p><h1>Browse fonts</h1><p class="lead">Explore the Typace catalog by file format. Each format page links to individual font pages with downloads, CSS, metadata, and API references.</p>
<ul>${cards}</ul>
</main></body></html>`;
        res.setHeader("Content-Type","text/html; charset=utf-8");
        res.setHeader("Cache-Control","public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
        return res.status(200).send(html);
    } catch (error) {
        console.error("Typace browse page failed:", error);
        return res.status(500).send("Unable to load font browser.");
    }
}
