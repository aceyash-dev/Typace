import test from "node:test";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalize, findFont, listFonts } from "../api/_lib/fonts.js";
import { checkRateLimit } from "../api/_lib/rate-limit.js";
import openapiHandler from "../api/openapi.json.js";
import sitemapHandler from "../api/sitemap.js";
import commitHandler, { normalizeCommit } from "../api/commit.js";
import fontsHandler from "../api/fonts.js";
import searchHandler from "../api/search.js";
import fontHandler from "../api/font.js";
import cssHandler from "../api/css.js";
import healthHandler from "../api/health.js";

function mockResponse() {
    return {
        statusCode: 0,
        body: null,
        headers: {},
        setHeader(name, value) { this.headers[name] = value; return this; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        send(body) { this.body = body; return this; },
        end() { return this; }
    };
}

test("font normalization removes accents, punctuation, and supported extensions", () => {
    assert.equal(normalize("Café Font.ttf"), "cafe-font");
    assert.equal(normalize("Ace Script.woff2"), "ace-script");
});

test("font lookup matches display names and safely rejects malformed slugs", () => {
    const fonts = [
        { name: "Ace Script", file: "fonts/Ace Script.otf", type: "otf" },
        { name: "Space Grotesk", file: "fonts/Space Grotesk.ttf", type: "ttf" }
    ];
    assert.equal(findFont(fonts, "Ace%20Script.otf").name, "Ace Script");
    assert.equal(findFont(fonts, "space-grotesk").name, "Space Grotesk");
    assert.equal(findFont(fonts, "%E0%A4%A"), null);
    assert.equal(findFont(fonts, ""), null);
});

test("live catalog is sorted and never invents classifications or source dates", async () => {
    const fonts = await listFonts();
    assert.ok(fonts.length > 0);
    assert.equal(fonts.some(font => /misans\.ttf$/i.test(font.file)), false);
    for (const font of fonts) {
        assert.ok(["serif", "sans-serif", "unknown"].includes(font.category));
        assert.equal(font.createdAt, null);
        assert.equal(font.updatedAt, null);
        assert.equal(typeof font.isNew, "boolean");
    }
    const batchAge = Date.now() - Date.parse("2026-10-09T18:20:59Z");
    const batchIsRecent = batchAge >= 0 && batchAge < 7 * 24 * 60 * 60 * 1000;
    assert.equal(fonts.find(font => font.file === "Akrobat.ttf")?.isNew, batchIsRecent);
    assert.equal(fonts.find(font => font.file === "Aboreto.ttf")?.isNew, false);
    assert.deepEqual(fonts.map(font => font.name), [...fonts.map(font => font.name)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })));
});

test("OpenAPI documents current API paths, schema values, and machine-client health", () => {
    const response = mockResponse();
    openapiHandler({ method: "GET" }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.openapi, "3.0.3");
    assert.deepEqual(response.body.components.schemas.Font.properties.category.enum, ["serif", "sans-serif", "unknown"]);
    assert.ok(response.body.paths["/api/health"]);
    assert.ok(response.body.paths["/api/fonts"]);
    assert.ok(response.body.paths["/api/search"]);
    assert.ok(response.body.paths["/api/css/{slug}"]);
    assert.ok(response.body.paths["/api/commit"]);
    assert.deepEqual(response.body.components.schemas.Commit.properties.source.enum, ["deployment", "github"]);
    assert.equal("url" in response.body.components.schemas.Commit.properties, false);
});

test("sitemap exposes canonical discovery pages, not binary font assets", async () => {
    const response = mockResponse();
    await sitemapHandler({ method: "GET" }, response);
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /https:\/\/typace\.ace-base\.cc\/browse/);
    assert.doesNotMatch(response.body, /<loc>[^<]*\/fonts\//);
    assert.match(response.body, /<urlset xmlns=/);
});

test("health endpoint returns catalog diagnostics and machine-readable headers", async () => {
    const response = mockResponse();
    await healthHandler({ method: "GET", headers: { "x-real-ip": "198.51.100.201" } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, "ok");
    assert.equal(response.body.service, "typace-api");
    assert.ok(response.body.catalog.count > 0);
    assert.equal(response.headers["X-API-Version"], "1.1.0");
    assert.match(response.headers["Access-Control-Expose-Headers"], /Retry-After/);
});

test("health endpoint supports CORS preflight without a body", async () => {
    const response = mockResponse();
    await healthHandler({ method: "OPTIONS" }, response);
    assert.equal(response.statusCode, 204);
    assert.equal(response.headers["Access-Control-Allow-Origin"], "*");
    assert.equal(response.headers["Cache-Control"], "no-store");
});

test("health endpoint rejects unsupported methods", async () => {
    const response = mockResponse();
    await healthHandler({ method: "POST", headers: { "x-real-ip": "198.51.100.202" } }, response);
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, "METHOD_NOT_ALLOWED");
    assert.equal(response.headers.Allow, "GET, HEAD, OPTIONS");
});

test("commit endpoint rejects unsupported methods without a network request", async () => {
    const response = mockResponse();
    await commitHandler({ method: "POST" }, response);
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, "METHOD_NOT_ALLOWED");
    assert.equal(response.headers.Allow, "GET, HEAD, OPTIONS");
});

test("commit endpoint supports CORS preflight", async () => {
    const response = mockResponse();
    await commitHandler({ method: "OPTIONS" }, response);
    assert.equal(response.statusCode, 204);
    assert.equal(response.headers["Access-Control-Allow-Methods"], "GET, HEAD, OPTIONS");
});

test("catalog and search endpoints reject unsupported methods consistently", async () => {
    for (const handler of [fontsHandler, searchHandler]) {
        const response = mockResponse();
        await handler({ method: "POST", query: {} }, response);
        assert.equal(response.statusCode, 405);
        assert.equal(response.headers.Allow, "GET, HEAD, OPTIONS");
        assert.equal(response.body.code, "METHOD_NOT_ALLOWED");
        assert.equal(response.headers["X-Content-Type-Options"], "nosniff");
        assert.equal(response.headers["Cache-Control"], "no-store");
    }
});

test("font metadata and CSS endpoints reject unsupported methods consistently", async () => {
    for (const handler of [fontHandler, cssHandler]) {
        const response = mockResponse();
        await handler({ method: "POST", query: { slug: "test" } }, response);
        assert.equal(response.statusCode, 405);
        assert.equal(response.headers.Allow, "GET, HEAD, OPTIONS");
        assert.equal(response.body.code, "METHOD_NOT_ALLOWED");
        assert.equal(response.headers["X-Content-Type-Options"], "nosniff");
    }
});

test("OpenAPI endpoint supports CORS preflight", () => {
    const response = mockResponse();
    openapiHandler({ method: "OPTIONS" }, response);
    assert.equal(response.statusCode, 204);
    assert.equal(response.headers["Access-Control-Allow-Methods"], "GET, HEAD, OPTIONS");
    assert.equal(response.headers["Cache-Control"], "no-store");
});

test("commit metadata normalizes valid timestamps and rejects invalid dates", () => {
    const valid = normalizeCommit({
        sha: "0123456789abcdef0123456789abcdef01234567",
        message: "Release\nAdditional details",
        date: "2026-10-09T12:00:00Z"
    }, "deployment");
    assert.equal(valid.shortSha, "0123456");
    assert.equal(valid.message, "Release");
    assert.equal(valid.date, "2026-10-09T12:00:00.000Z");
    assert.equal("url" in valid, false);
    const invalid = normalizeCommit({
        sha: "0123456789abcdef0123456789abcdef01234567",
        message: "Release",
        date: "not-a-date"
    }, "deployment");
    assert.equal(invalid.date, null);
});

test("search matches token prefixes rather than arbitrary substrings", async () => {
    const response = mockResponse();
    await searchHandler({ method: "GET", headers: { "x-real-ip": "198.51.100.203" }, query: { q: "Ace" } }, response);
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.some(font => font.name === "Ace Script"));
    assert.equal(response.body.some(font => font.name === "Space Grotesk"), false);
});

test("rate limiter allows sixty requests per IP and blocks the sixty-first", () => {
    const req = { headers: { "x-real-ip": "198.51.100.204" } };
    const start = 1_800_000_000_000;
    for (let index = 0; index < 60; index++) {
        const result = checkRateLimit(req, start + index);
        assert.equal(result.allowed, true);
        assert.equal(result.limit, 60);
    }
    const blocked = checkRateLimit(req, start + 60);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.equal(blocked.retryAfter, 60);
    assert.equal(checkRateLimit(req, start + 60_001).allowed, true);
});

test("catalog endpoint returns 429 after the per-minute limit from one IP", async () => {
    const ip = "198.51.100.205";
    let response;
    for (let index = 0; index < 61; index++) {
        response = mockResponse();
        await fontsHandler({ method: "GET", headers: { "x-real-ip": ip }, query: {} }, response);
    }
    assert.equal(response.statusCode, 429);
    assert.equal(response.body.code, "RATE_LIMIT_EXCEEDED");
    assert.equal(response.headers["RateLimit-Limit"], "60");
    assert.equal(response.headers["RateLimit-Remaining"], "0");
    assert.ok(Number(response.headers["Retry-After"]) >= 1);
    assert.equal(response.headers["X-API-Version"], "1.1.0");
    assert.match(response.headers["Access-Control-Expose-Headers"], /Retry-After/);
});

test("React shell keeps Grandstander and Hugeicons and removes the legacy inline app", async () => {
    const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
    assert.match(html, /href="\/grandstander\.css"/);
    assert.match(html, /rel="preload" as="font"/);
    assert.match(html, /use\.hugeicons\.com\/font\/icons\.css/);
    assert.match(html, /src="\/src\/main\.jsx"/);
    assert.match(html, /id="root"/);
    assert.match(html, /property="og:image" content="https:\/\/typace\.ace-base\.cc\/og-image\.png"/);
    assert.doesNotMatch(html, /function loadFonts\(\)|let previewRequestId/);
});

test("React landing focuses on the font catalog and uses the existing brand assets", async () => {
    const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
    const card = await readFile(new URL("../src/components/FontCard.jsx", import.meta.url), "utf8");
    const preview = await readFile(new URL("../src/components/PreviewDialog.jsx", import.meta.url), "utf8");
    const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
    const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
    const footer = await readFile(new URL("../src/components/SiteFooter.jsx", import.meta.url), "utf8");
    for (const text of ["The catalog did not load.", "Try again", "PreviewDialog", "fontCssSnippet", "/api/openapi.json", 'src="/icon.png"']) {
        assert.ok(app.includes(text), "missing UI contract: " + text);
    }
    // The machine-readable docs link lives in the extracted footer component.
    assert.ok(footer.includes("/llms.txt"), "missing UI contract: /llms.txt");
    assert.ok(!app.includes("Revamp in Progress"), "revamp banner must stay removed");
    assert.ok(!app.includes("SCROLL TO EXPLORE"), "generic exploration copy must stay removed");
    assert.match(styles, /font-family: "Grandstander", cursive/);
    assert.match(styles, /--peacock: #ed7418/);
    assert.match(html, /\/grandstander\.css/);
    assert.match(card, /download-button/);
    assert.match(card, /download-size/);
    assert.match(card, /motion\.article/);
    assert.match(preview, /onCopy/);
  assert.doesNotMatch(preview, /API record|size-slider/);
    assert.match(app, /aria-live="polite"/);
    assert.match(app, /aria-pressed=/);
});

test("React UI behavior is separated into reusable components, hooks, and utilities", async () => {
    const icon = await readFile(new URL("../src/components/Icon.jsx", import.meta.url), "utf8");
    const hook = await readFile(new URL("../src/hooks/useVisibleFont.js", import.meta.url), "utf8");
    const utilities = await readFile(new URL("../src/lib/fonts.js", import.meta.url), "utf8");
    assert.match(icon, /export default function Icon/);
    assert.match(hook, /IntersectionObserver/);
    assert.match(utilities, /export function usableFont/);
    assert.match(utilities, /export async function copyText/);
});

test("React styles are responsive, accessible, and honor reduced-motion preferences", async () => {
    const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
    assert.match(css, /@media \(max-width: 700px\)/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /--display-font: "Grandstander"/);
    assert.match(css, /:focus-visible/);
});

test("Vite build scripts and modern React dependencies are configured", async () => {
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(pkg.scripts.build, "vite build");
    assert.equal(pkg.scripts.test, "node --test");
    assert.ok(pkg.dependencies.react);
    assert.ok(pkg.dependencies["react-dom"]);
    assert.ok(pkg.dependencies.motion);
    assert.ok(pkg.devDependencies.vite);
    assert.ok(pkg.devDependencies["@vitejs/plugin-react"]);
});

test("Vite build preserves the existing font binaries without modifying them", async () => {
    const config = await readFile(new URL("../vite.config.js", import.meta.url), "utf8");
    assert.match(config, /cpSync\(fontSource, resolve\(dist, "fonts"\)/);
    const sourcePath = new URL("../fonts/Aboreto.ttf", import.meta.url);
    const outputPath = new URL("../dist/fonts/Aboreto.ttf", import.meta.url);
    if (existsSync(outputPath)) {
        assert.deepEqual(await readFile(outputPath), await readFile(sourcePath));
    }
});

test("AI documentation describes health, OpenAPI, rate limits, and honest font metadata", async () => {
    const llms = await readFile(new URL("../llms.txt", import.meta.url), "utf8");
    const full = await readFile(new URL("../llms-full.txt", import.meta.url), "utf8");
    assert.match(llms, /\/api\/health/);
    assert.match(llms, /\/api\/openapi\.json/);
    assert.match(llms, /Retry-After/);
    assert.match(full, /Do not retry 429 responses in a tight loop/);
    assert.match(full, /licensing/);
});


test("landing page showcases six representative fonts and separates the full library", async () => {
    const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
    assert.match(app, /const isBrowse = window\.location\.pathname === "\/browse"/);
    assert.match(app, /const featuredFonts = useMemo/);
    assert.match(app, /filtered\.slice\(0, visibleCount\) : featuredFonts/);
    assert.match(app, /href="\/browse"/);
    assert.match(app, /CURATED SPECIMENS \/ 06/);
});

test("optional analytics is gated behind explicit cookie consent", async () => {
    const consent = await readFile(new URL("../src/components/CookieConsent.jsx", import.meta.url), "utf8");
    const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
    assert.match(consent, /Reject optional/);
    assert.match(consent, /Accept analytics/);
    assert.match(consent, /typace-cookie-consent-v1/);
    assert.match(consent, /activateAnalytics\(\)/);
    assert.match(consent, /googletagmanager\.com\/gtm\.js/);
    assert.doesNotMatch(html, /googletagmanager\.com\/gtm\.js/, "analytics must not load from the HTML shell before consent");
});

test("privacy, terms, cookie, security, and disclosure files are present", async () => {
    const legal = await readFile(new URL("../src/components/LegalPage.jsx", import.meta.url), "utf8");
    const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
    const vite = await readFile(new URL("../vite.config.js", import.meta.url), "utf8");
    const security = await readFile(new URL("../security.txt", import.meta.url), "utf8");
    const sitemap = await readFile(new URL("../api/sitemap.js", import.meta.url), "utf8");
    for (const page of ["privacy", "terms", "cookies", "security"]) {
        assert.match(legal, new RegExp(page + ":"));
        assert.match(app, new RegExp('"/' + page + '"'));
        assert.match(sitemap, new RegExp('path: "/' + page + '"'));
    }
    assert.match(vite, /security\.txt/);
    assert.match(security, /Canonical: https:\/\/typace\.ace-base\.cc\/.well-known\/security\.txt/);
    assert.match(security, /Policy: https:\/\/typace\.ace-base\.cc\/security/);
});
