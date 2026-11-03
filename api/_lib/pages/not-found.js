export default function handler(_req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(404).send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#f5f2ec">
<title>Page not found | Typace</title>
<style>

*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{scroll-behavior:smooth;overscroll-behavior-y:none;-webkit-text-size-adjust:100%}
:root{color-scheme:light;--ink:#27231f;--muted:#746c63;--paper:#f5f2ec;--accent:#9b593c}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:28px;background:var(--paper);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{width:min(100%,640px);padding:clamp(28px,7vw,64px);border:1px solid #ddd5ca;border-radius:24px;background:#fffdf9;box-shadow:0 18px 60px #27231f0d}
.eyebrow{color:var(--accent);font-size:11px;font-weight:800;letter-spacing:.22em;text-transform:uppercase}h1{margin:18px 0 12px;font-family:Georgia,serif;font-size:clamp(42px,9vw,76px);font-weight:500;letter-spacing:-.06em;line-height:.98}p{max-width:44ch;color:var(--muted);line-height:1.7}
nav{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}a{display:inline-flex;min-height:44px;align-items:center;justify-content:center;padding:0 18px;border:1px solid #d8cfc3;border-radius:999px;color:var(--ink);font-size:13px;font-weight:700;text-decoration:none}a:first-child{border-color:var(--accent);background:var(--accent);color:white}a:focus-visible{outline:3px solid #bd805f;outline-offset:3px}
</style></head><body><main><p class="eyebrow">404 / NOT FOUND</p><h1>This page isn't in the collection.</h1><p>The address may be outdated, or the page may have moved. The font library is still here, waiting patiently.</p><nav><a href="/browse">Browse the library</a><a href="/">Back home</a></nav></main></body></html>`);
}
