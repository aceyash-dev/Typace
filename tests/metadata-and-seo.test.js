import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Dock is available in Account and contact email is exposed", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const navStart = app.indexOf("floating-nav");
  const navEnd = app.indexOf("</nav>", navStart);
  assert.ok(navStart >= 0 && navEnd > navStart);
  const nav = app.slice(navStart, navEnd);
  const accountStart = app.indexOf("{isAccount &&");
  const accountEnd = app.indexOf("{isDevelopers &&", accountStart);
  const account = app.slice(accountStart, accountEnd);
  assert.equal(nav.includes("aero.aryankaushik.space"), false);
  assert.ok(account.includes("Aero Dock"));
  assert.ok(account.includes("mailto:hello@ace-base.cc"));
  const footer = await readFile(new URL("../src/components/SiteFooter.jsx", import.meta.url), "utf8");
  assert.ok(footer.includes("mailto:hello@ace-base.cc"));
});

test("route metadata uses unique SPA canonicals and keeps Account noindex", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.ok(app.includes('title = "Browse Fonts | Typace"'));
  assert.ok(app.includes('title = "Typace API for Developers | Font Catalog & CSS"'));
  assert.ok(app.includes('robotsText = "noindex,follow"'));
  assert.ok(app.includes('canonicalHref = base + "/browse"'));
  assert.ok(app.includes('canonicalHref = base + "/developers"'));
});

test("Vite emits SEO route snapshots and Vercel serves them", async () => {
  const vite = await readFile(new URL("../vite.config.js", import.meta.url), "utf8");
  const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.ok(vite.includes("routeShell"));
  assert.ok(vite.includes("writeFileSync"));
  for (const route of ["browse", "developers", "privacy", "terms", "cookies", "security", "account"]) {
    assert.ok(vercel.rewrites.some((item) => item.source === "/" + route && item.destination === "/" + route + ".html"));
  }
  const robots = await readFile(new URL("../robots.txt", import.meta.url), "utf8");
  assert.doesNotMatch(robots, /^Disallow: \/account\s*$/m);
});
