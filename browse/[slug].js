import { listFonts } from "../api/_lib/fonts.js";

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[char]));
}

const formats = {
    woff2: ["WOFF2","woff2","Modern webfont format for browsers"],
    ttf: ["TrueType","ttf","TrueType font files"],
    otf: ["OpenType","otf","OpenType font files"]
};

export default async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).send("Method not allowed.");
    const slug = String(req.query?.slug || "").toLowerCase();
    const format = formats[slug];
    if (!format) return res.status(404).send("Font format not found.");
    try {
        const fonts = (await listFonts()).filter(font => font.type === format[1]);
        const canonical = `https://typace.ace-base.cc/browse/${slug}`;
        const items = fonts.sort((a,b)=>a.name.localeCompare(b.name)).map(font =>
            `<li><a href="/fonts/${encodeURIComponent(font.name)}"><strong>${escapeHTML(font.name)}</strong><span>${escapeHTML(font.name)} is available as a ${escapeHTML(format[0])} font file through Typace.</span></a></li>`
        ).join("");
        const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${format[0]} Fonts | Typace</title>
<meta name="description" content="Browse ${fonts.length} ${format[0]} font files available through the Typace font library.">
<link rel="canonical" href="${canonical}"><meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="website"><meta property="og:site_name" content="Typace">
<meta property="og:title" content="${format[0]} Fonts | Typace"><meta property="og:description" content="Browse ${fonts.length} ${format[0]} font files available through Typace."><meta property="og:url" content="${canonical}">
<script type="application/ld+json">${JSON.stringify({
 "@context":"https://schema.org","@type":"CollectionPage","name":`${format[0]} Fonts`,"url":canonical,
 "description":`Browse ${fonts.length} ${format[0]} font files available through Typace.`,
 "numberOfItems":fonts.length,"isPartOf":{"@type":"WebSite","name":"Typace","url":"https://typace.ace-base.cc/"}
})}</script>
<style>
body{font-family:system-ui,sans-serif;max-width:1000px;margin:auto;padding:40px 24px;line-height:1.6;color:#29251f}h1{font-size:clamp(2.2rem,7vw,5rem);line-height:1}.muted{color:#766e62}ul{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}li a{display:block;padding:16px;border:1px solid #ddd6ca;border-radius:16px;color:inherit;text-decoration:none}li a:hover{border-color:#ee6716}strong,span{display:block}span{font-size:.85rem;color:#766e62}
</style></head><body><nav><a href="/">← Typace</a> · <a href="/browse">All formats</a></nav><main>
<p>FONT FORMAT</p><h1>${format[0]} fonts</h1><p class="muted">${fonts.length} font${fonts.length===1?"":"s"} currently published in this format.</p><ul>${items || "<li>No fonts are currently published in this format.</li>"}</ul>
</main></body></html>`;
        res.setHeader("Content-Type","text/html; charset=utf-8");
        res.setHeader("Cache-Control","public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
        return res.status(200).send(html);
    } catch (error) {
        console.error("Typace format page failed:", error);
        return res.status(500).send("Unable to load font format.");
    }
}
