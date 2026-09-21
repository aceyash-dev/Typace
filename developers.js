export default function handler(req, res) {
    if (req.method !== "GET") return res.status(405).send("Method not allowed.");
    const canonical = "https://typace.ace-base.cc/developers";
    const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Typace for Developers | Webfont CDN & API</title>
<meta name="description" content="Use Typace fonts in websites and applications with CSS @font-face, the dynamic font catalog API, generated CSS, and OpenAPI documentation.">
<link rel="canonical" href="${canonical}"><meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="website"><meta property="og:site_name" content="Typace"><meta property="og:title" content="Typace for Developers | Webfont CDN & API"><meta property="og:description" content="Use Typace fonts with CSS, the dynamic catalog API, generated CSS, and OpenAPI."><meta property="og:url" content="${canonical}">
<script type="application/ld+json">${JSON.stringify({
 "@context":"https://schema.org","@type":"TechArticle","headline":"Typace for Developers","url":canonical,
 "description":"Developer documentation for Typace webfont delivery and APIs.",
 "about":{"@type":"SoftwareApplication","name":"Typace","url":"https://typace.ace-base.cc/"},
 "publisher":{"@type":"Organization","name":"The Ace Base","url":"https://ace-base.cc/"}
})}</script>
<style>
body{font-family:system-ui,sans-serif;max-width:900px;margin:auto;padding:48px 24px;line-height:1.7;color:#29251f}h1{font-size:clamp(2.4rem,8vw,5rem);line-height:1}.lead{font-size:1.1rem;color:#766e62}section{border-top:1px solid #ddd6ca;padding:22px 0}a{color:inherit}code{background:#f4efe7;padding:3px 6px;border-radius:6px}
</style></head><body><nav><a href="/">← Typace</a> · <a href="https://docs.ace-base.cc/projects/typace">Documentation</a></nav><main>
<p>DEVELOPER RESOURCE</p><h1>Typace for developers</h1><p class="lead">Typace provides webfont assets and a dynamic API for discovering font files and generating CSS integration snippets.</p>
<section><h2>CSS font delivery</h2><p>Use a Typace font asset with a standard CSS <code>@font-face</code> declaration. Font files are served over HTTPS from the Typace domain.</p><p><a href="/api/fonts">View the live font catalog →</a></p></section>
<section><h2>API</h2><p><a href="/api/fonts">Font catalog</a> · <a href="/api/search?q=Spectral">Search</a> · <a href="/api/fonts/Spectral">Font metadata</a> · <a href="/api/css/Spectral">Generated CSS</a> · <a href="/api/openapi.json">OpenAPI</a></p></section>
<section><h2>Frameworks</h2><p>Typace uses standard webfont delivery, so it can be integrated into HTML, CSS, React, Vue, Next.js, Vite, and other web applications without a framework-specific package.</p></section>
<section><h2>Authoritative references</h2><p><a href="/llms.txt">LLM documentation</a> · <a href="https://docs.ace-base.cc/projects/typace-api">API reference</a> · <a href="https://docs.ace-base.cc/projects/typace">Project guide</a></p></section>
</main></body></html>`;
    res.setHeader("Content-Type","text/html; charset=utf-8");
    res.setHeader("Cache-Control","public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(html);
}
