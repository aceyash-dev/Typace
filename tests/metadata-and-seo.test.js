import test from "node:test";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { normalize, findFont, listFonts, fontSlug } from "../api/_lib/fonts.js";
import { checkRateLimit } from "../api/_lib/rate-limit.js";
import openapiHandler from "../api/openapi.json.js";
import sitemapHandler from "../api/sitemap.js";
import commitHandler, { normalizeCommit } from "../api/commit.js";
import fontsHandler from "../api/fonts.js";
import searchHandler from "../api/search.js";
import fontHandler from "../api/font.js";
import cssHandler from "../api/css.js";
import healthHandler from "../api/health.js";
import mcpHandler from "../api/mcp.js";
import { escapeCSSString } from "../api/font-page.js";
import { safeDecodePathSegment } from "../src/lib/routes.js";
import { downloadNameFor, fontSizeLabel, fontTypeLabel, slugFor } from "../src/lib/fonts.js";
import { pickSeed, PROVIDERS } from "../src/lib/palette.js";
import { KEYLESS_PROVIDER_IDS, DIRECT_PROVIDER_IDS } from "../api/image.js";
import formatsHandler from "../api/formats.js";

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

test("font page CSS family names are safely escaped", () => {
    const hostile = 'Nice";}</style><script>alert(1)</script>\\font';
    const escaped = escapeCSSString(hostile);
    assert.doesNotMatch(escaped, /["<>]/);
    assert.match(escaped, /\\22 /);
    assert.match(escaped, /\\3c /i);
    assert.match(escaped, /\\3e /i);
    assert.match(escaped, /\\5c /i);
});

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

test("live catalog is sorted and never invents source dates", async () => {
    const fonts = await listFonts();
    assert.ok(fonts.length > 0);
    assert.equal(fonts.some(font => /misans\.ttf$/i.test(font.file)), false);
    for (const font of fonts) {
        assert.equal("category" in font, false, "font records must not carry a category");
        assert.equal(font.createdAt, null);
        assert.equal(font.updatedAt, null);
        assert.equal(typeof font.isNew, "boolean");
    }
    // The curated latest-import set remains stable until a newer batch replaces it.
    assert.equal(fonts.find(font => font.file === "Pagio.otf")?.isNew, true);
    assert.equal(fonts.find(font => font.file === "Akrobat.ttf")?.isNew, false);
    assert.equal(fonts.find(font => font.file === "Aboreto.ttf")?.isNew, false);
    assert.deepEqual(fonts.map(font => font.name), [...fonts.map(font => font.name)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })));
});

test("OpenAPI documents current API paths, schema values, and machine-client health", () => {
    const response = mockResponse();
    openapiHandler({ method: "GET" }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.openapi, "3.0.3");
    assert.equal("category" in response.body.components.schemas.Font.properties, false);
    assert.equal(response.body.paths["/api/fonts"].get.parameters.some(parameter => parameter.name === "category"), false);
    assert.equal(response.body.components.schemas.Font.properties.sizeBytes.type, "integer");
    assert.equal(response.body.components.schemas.Health.properties.catalog.properties.ageSeconds.type, "integer");
    assert.equal(response.body.components.schemas.Health.properties.catalog.properties.stale.type, "boolean");
    assert.equal(response.body.components.schemas.Health.properties.catalog.properties.issue.type, "string");
    assert.match(response.body.info.description, /60 per minute per IP by default/);
    assert.deepEqual(response.body.components.schemas.Health.properties.catalog.properties.status.enum, ["ok", "degraded"]);
    assert.ok(response.body.paths["/api/health"]);
    assert.ok(response.body.paths["/api/fonts"]);
    assert.ok(response.body.paths["/api/font"]);
    assert.ok(response.body.paths["/api/formats"]);
    assert.ok(response.body.paths["/api/faq"]);
    assert.ok(response.body.paths["/api/sitemap"]);
    assert.ok(response.body.paths["/api/search"]);
    assert.ok(response.body.tags.some(tag => tag.name === "Assets"));
    assert.ok(response.body.paths["/api/image"].get.parameters.some(parameter => parameter.name === "provider"));
    assert.ok(response.body.components.schemas.Font.properties.type.enum.includes("woff"));
    assert.ok(response.body.paths["/api/fonts"].get.parameters.find(parameter => parameter.name === "format").schema.enum.includes("woff"));
    assert.ok(response.body.paths["/api/css/{slug}"]);
    assert.ok(response.body.paths["/api/commit"]);
    assert.deepEqual(response.body.components.schemas.Commit.properties.source.enum, ["deployment", "github"]);
    assert.equal("url" in response.body.components.schemas.Commit.properties, false);
    assert.doesNotMatch(response.body.paths["/api/fonts"].get.description, /[\u00c2\u00e2][\u0080-\u00bf]/);
    assert.doesNotMatch(response.body.paths["/api/fonts"].get.responses["304"].description, /[\u00c2\u00e2][\u0080-\u00bf]/);
});

test("PWA manifest icon sizes match the actual PNG dimensions", async () => {
    const manifest = JSON.parse(await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
    assert.ok(manifest.icons.some(icon => icon.sizes === "192x192"));
    assert.ok(manifest.icons.some(icon => icon.sizes === "512x512"));
    assert.ok(manifest.icons.some(icon => icon.purpose === "maskable"));
    for (const icon of manifest.icons) {
        const bytes = await readFile(new URL(`../${icon.src.slice(1)}`, import.meta.url));
        assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
        assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
    }
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


// The stylesheet is split into modules under src/styles; read them all in load order.
async function readStyles() {
    const root = new URL("../src/styles/", import.meta.url);
    const entry = await readFile(new URL("index.css", root), "utf8");
    const modules = [...entry.matchAll(/@import "\.\/(.+?)";/g)].map((match) => match[1]);
    const order = modules.length ? modules : (await readdir(root, { recursive: true })).filter((name) => name.endsWith(".css"));
    let css = "";
    for (const name of order) {
        css += await readFile(new URL(name, root), "utf8") + "\n";
    }
    return css;
}

test("React landing focuses on the font catalog and uses the existing brand assets", async () => {
    const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
    const card = await readFile(new URL("../src/components/FontCard.jsx", import.meta.url), "utf8");
    const actions = await readFile(new URL("../src/components/FontActions.jsx", import.meta.url), "utf8");
    const preview = await readFile(new URL("../src/components/PreviewDialog.jsx", import.meta.url), "utf8");
    const styles = await readStyles();
    const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
    const footer = await readFile(new URL("../src/components/SiteFooter.jsx", import.meta.url), "utf8");
    for (const text of ["The catalog did not load.", "Try again", "PreviewDialog", "fontCssSnippet", "/api/openapi.json", 'src="/icon-192.png"']) {
        assert.ok(app.includes(text), "missing UI contract: " + text);
    }
    // The machine-readable docs link lives in the extracted footer component.
    assert.ok(footer.includes("/llms.txt"), "missing UI contract: /llms.txt");
    assert.ok(!app.includes("Revamp in Progress"), "revamp banner must stay removed");
    assert.ok(!app.includes("SCROLL TO EXPLORE"), "generic exploration copy must stay removed");
    assert.match(styles, /font-family: "Grandstander", cursive/);
    assert.match(styles, /--peacock: #ed7418/);
    assert.match(html, /\/grandstander\.css/);
    assert.match(actions, /download-button/);
    assert.match(actions, /download-size/);
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
    const css = await readStyles();
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


test("server and client font slugs stay in sync for canonical URL fixtures", () => {
    const fixtures = ["Café Font!", "Avenir Next", "École Display", "Bodoni--Moda", "東京 Gothic"];
    for (const name of fixtures) assert.equal(fontSlug(name), slugFor({ name }));
});

test("formats landing page contains valid Unicode punctuation", async () => {
    const response = mockResponse();
    await formatsHandler({ method: "GET", headers: { "x-real-ip": "198.51.100.212" } }, response);
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Font Formats — WOFF2/);
    assert.match(response.body, /<\/a> · <a href=/);
    assert.doesNotMatch(response.body, /\u00e2\u0080\u0094|\u00c2\u00b7/);
});

test("legal disclosures accurately distinguish self-hosted fonts from external icons", async () => {
    const legal = await readFile(new URL("../src/components/LegalPage.jsx", import.meta.url), "utf8");
    assert.match(legal, /serves the Grandstander typeface from its own domain/);
    assert.match(legal, /Grandstander is self-hosted by Typace/);
    assert.doesNotMatch(legal, /Grandstander font from Google Fonts|Grandstander is requested from Google Fonts/);
});

test("specimen dialog labels its preset and navigation groups", async () => {
    const dialog = await readFile(new URL("../src/components/PreviewDialog.jsx", import.meta.url), "utf8");
    assert.match(dialog, /className="preview-presets" role="group" aria-label="Specimen presets"/);
    assert.match(dialog, /className="preview-nav" role="group" aria-label="Browse typefaces"/);
});

test("primary orange controls use AA-contrast text in both themes", async () => {
    const css = await readFile(new URL("../src/styles/components/controls.css", import.meta.url), "utf8");
    assert.match(css, /\.button-primary \{padding: 13px 18px; background: var\(--accent\); color: var\(--ink\);\}/);
    assert.match(css, /\.header-cta \{gap: 12px; padding: 14px 18px; border-radius: 4px; background: var\(--accent\); color: var\(--ink\);\}/);
    assert.match(css, /\.view-switch button\.active \{background: var\(--accent\); color: var\(--ink\);\}/);
});

test("theme seed is reused on reload instead of being regenerated", () => {
    const values = new Map([["typace-theme-seed", "stable-seed"]]);
    const previous = globalThis.localStorage;
    globalThis.localStorage = {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); }
    };
    try {
        assert.equal(pickSeed(), "stable-seed");
        assert.equal(values.get("typace-theme-seed-history"), undefined);
    } finally {
        if (previous === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previous;
    }
});

async function callMcp(message, ip) {
    const response = mockResponse();
    await mcpHandler({ method: "POST", headers: { "x-real-ip": ip }, body: message }, response);
    return response;
}

test("MCP endpoint initialises, lists its tools, and calls them", async () => {
    const init = await callMcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, "198.51.100.230");
    assert.equal(init.statusCode, 200);
    assert.equal(init.body.result.protocolVersion, "2025-06-18");
    assert.ok(init.body.result.capabilities.tools);
    assert.ok(init.body.result.serverInfo.name);

    const list = await callMcp({ jsonrpc: "2.0", id: 2, method: "tools/list" }, "198.51.100.231");
    assert.deepEqual(list.body.result.tools.map(tool => tool.name),
        ["search_fonts", "list_fonts", "get_font", "get_font_css", "list_formats", "catalog_health"]);
    for (const tool of list.body.result.tools) assert.equal(tool.inputSchema.type, "object");

    const search = await callMcp({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search_fonts", arguments: { query: "grotesk" } } }, "198.51.100.232");
    const payload = JSON.parse(search.body.result.content[0].text);
    assert.ok(payload.total >= 1);
    assert.ok(payload.fonts.every(font => "url" in font && "name" in font));

    const css = await callMcp({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_font_css", arguments: { slug: "space-grotesk" } } }, "198.51.100.233");
    assert.match(css.body.result.content[0].text, /^@font-face \{/);
});

test("MCP separates tool failures from protocol errors", async () => {
    const missing = await callMcp({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_font", arguments: { slug: "not-a-font" } } }, "198.51.100.234");
    assert.equal(missing.body.result.isError, true);

    const unknownTool = await callMcp({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "nope", arguments: {} } }, "198.51.100.235");
    assert.equal(unknownTool.body.error.code, -32602);

    const unknownMethod = await callMcp({ jsonrpc: "2.0", id: 7, method: "nope" }, "198.51.100.236");
    assert.equal(unknownMethod.body.error.code, -32601);
});

test("MCP accepts notifications without a body and refuses GET", async () => {
    const notification = await callMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, "198.51.100.237");
    assert.equal(notification.statusCode, 202);

    const response = mockResponse();
    await mcpHandler({ method: "GET", headers: { "x-real-ip": "198.51.100.238" } }, response);
    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.Allow, "POST, OPTIONS");
});

test("catalog supports batch slug lookup and sparse fields", async () => {
    const batch = mockResponse();
    await fontsHandler({ method: "GET", headers: { "x-real-ip": "198.51.100.239" }, query: { slugs: "space-grotesk,not-a-font" } }, batch);
    assert.equal(batch.statusCode, 200);
    assert.equal(batch.body.length, 2);
    assert.equal(batch.body[0].name, "Space Grotesk");
    assert.equal(batch.body[1], null, "a miss must not fail the batch");
    assert.equal(batch.headers["X-Total-Count"], "1");

    const sparse = mockResponse();
    await fontsHandler({ method: "GET", headers: { "x-real-ip": "198.51.100.240" }, query: { limit: "1", fields: "name,url" } }, sparse);
    assert.deepEqual(Object.keys(sparse.body[0]), ["name", "url"]);

    const invalid = mockResponse();
    await fontsHandler({ method: "GET", headers: { "x-real-ip": "198.51.100.241" }, query: { fields: "name,bogus" } }, invalid);
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.body.code, "INVALID_FIELDS");
});

test("image providers are keyless and stay in sync across client, proxy, and OpenAPI", () => {
    // The palette extractor and the proxy must agree on the provider set, and no
    // provider may need a credential the proxy does not hold.
    const direct = PROVIDERS.filter(provider => !provider.sameOrigin).map(provider => provider.id);
    assert.deepEqual(direct, DIRECT_PROVIDER_IDS);
    assert.deepEqual(KEYLESS_PROVIDER_IDS.slice(0, DIRECT_PROVIDER_IDS.length), DIRECT_PROVIDER_IDS);
    for (const id of direct) assert.ok(KEYLESS_PROVIDER_IDS.includes(id));

    const response = mockResponse();
    openapiHandler({ method: "GET" }, response);
    const parameter = response.body.paths["/api/image"].get.parameters.find(entry => entry.name === "provider");
    assert.deepEqual(parameter.schema.enum, KEYLESS_PROVIDER_IDS);

    for (const provider of PROVIDERS) {
        const url = provider.url("test-seed", 200);
        assert.doesNotMatch(url, /api[_-]?key|access[_-]?key|client[_-]?id|authorization|token=/i,
            provider.id + " must not require a key");
    }
});

test("malformed font deep-link escapes are rejected without throwing", () => {
    assert.equal(safeDecodePathSegment("space-grotesk"), "space-grotesk");
    assert.equal(safeDecodePathSegment("%E0%A4%A"), null);
});

test("search revalidates with an ETag like the catalog does", async () => {
    const first = mockResponse();
    await searchHandler({ method: "GET", headers: { "x-real-ip": "198.51.100.220" }, query: { q: "Ace" } }, first);
    assert.equal(first.statusCode, 200);
    assert.match(first.headers.ETag, /^W\//);
    assert.match(first.headers["Cache-Control"], /max-age/);
    assert.equal(first.headers["X-Total-Count"], "1");
    assert.ok(first.headers["X-Request-Id"]);

    const revalidated = mockResponse();
    await searchHandler({ method: "GET", headers: { "x-real-ip": "198.51.100.221", "if-none-match": first.headers.ETag }, query: { q: "Ace" } }, revalidated);
    assert.equal(revalidated.statusCode, 304);
});

test("symbol-only search queries return no matches instead of the whole catalog", async () => {
    const response = mockResponse();
    await searchHandler({ method: "GET", headers: { "x-real-ip": "198.51.100.207" }, query: { q: "!!!" } }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, []);
});

test("CSS endpoint honors the If-None-Match wildcard for an existing resource", async () => {
    const response = mockResponse();
    await cssHandler({ method: "GET", headers: { "if-none-match": "*", "x-real-ip": "198.51.100.208" }, query: { slug: "Ace Script" } }, response);
    assert.equal(response.statusCode, 304);
});


test("font-card display metadata is normalized by shared helpers", () => {
    assert.equal(fontTypeLabel({ type: "woff2" }), "WOFF2");
    assert.equal(fontSizeLabel({ size: 2048 }), "2 KB");
    assert.equal(downloadNameFor({ file: "/fonts/Example.woff2" }), "Example.woff2");
    assert.equal(downloadNameFor({}), "font");
});
