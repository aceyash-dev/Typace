import test from "node:test";
import assert from "node:assert/strict";
import { normalize, findFont, listFonts } from "../api/_lib/fonts.js";
import handler from "../api/openapi.json.js";
import sitemapHandler from "../api/sitemap.js";
import commitHandler from "../api/commit.js";
import fontsHandler from "../api/fonts.js";
import searchHandler from "../api/search.js";
import fontHandler from "../api/fonts/[slug].js";
import cssHandler from "../api/css/[slug].js";
import { readFile } from "node:fs/promises";

test("normalize removes accents, punctuation, and supported extensions", () => {
    assert.equal(normalize("Café Font.ttf"), "cafe-font");
    assert.equal(normalize("Ace Script.woff2"), "ace-script");
});

test("findFont matches display names and safely handles malformed encoded slugs", () => {
    const fonts = [
        { name: "Ace Script", file: "fonts/Ace Script.otf", type: "otf" },
        { name: "Space Grotesk", file: "fonts/Space Grotesk.ttf", type: "ttf" }
    ];

    assert.equal(findFont(fonts, "Ace%20Script.otf").name, "Ace Script");
    assert.equal(findFont(fonts, "space-grotesk").name, "Space Grotesk");
    assert.equal(findFont(fonts, "%E0%A4%A"), null);
    assert.equal(findFont(fonts, ""), null);
});

test("live catalog uses honest categories and does not publish invented dates", async () => {
    const fonts = await listFonts();
    assert.ok(fonts.length > 0, "expected at least one published font");
    assert.equal(fonts.some(font => /misans\.ttf$/i.test(font.file)), false);
    for (const font of fonts) {
        assert.ok(["serif", "sans-serif", "unknown"].includes(font.category));
        assert.equal(font.createdAt, null);
        assert.equal(font.updatedAt, null);
    }
    assert.deepEqual(
        fonts.map(font => font.name),
        [...fonts.map(font => font.name)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    );
});

test("OpenAPI contract documents the real category values and API paths", () => {
    const response = mockResponse();
    handler({ method: "GET" }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.openapi, "3.0.3");
    assert.deepEqual(response.body.components.schemas.Font.properties.category.enum, ["serif", "sans-serif", "unknown"]);
    assert.ok(response.body.paths["/api/fonts"]);
    assert.ok(response.body.paths["/api/search"]);
    assert.ok(response.body.paths["/api/css/{slug}"]);
    assert.ok(response.body.paths["/api/commit"]);
    assert.deepEqual(response.body.components.schemas.Commit.properties.source.enum, ["deployment", "github"]);
});

test("sitemap contains canonical discovery pages, not binary font assets", () => {
    const response = mockResponse();
    sitemapHandler({ method: "GET" }, response);
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /https:\/\/typace\.ace-base\.cc\/browse/);
    assert.doesNotMatch(response.body, /<loc>[^<]*\/fonts\//);
    assert.match(response.body, /<urlset xmlns=/);
});

function mockResponse() {
    return {
        statusCode: 0,
        body: null,
        headers: {},
        setHeader(name, value) {
            this.headers[name] = value;
            return this;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
        send(body) {
            this.body = body;
            return this;
        },
        end() {
            return this;
        }
    };
}

test("commit endpoint rejects unsupported methods without a network request", async () => {
    const response = mockResponse();
    await commitHandler({ method: "POST" }, response);
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, "METHOD_NOT_ALLOWED");
    assert.equal(response.headers.Allow, "GET, OPTIONS");
});

test("commit endpoint supports CORS preflight", async () => {
    const response = mockResponse();
    await commitHandler({ method: "OPTIONS" }, response);
    assert.equal(response.statusCode, 204);
    assert.equal(response.headers["Access-Control-Allow-Methods"], "GET, OPTIONS");
});

test("catalog and search endpoints return consistent method errors", async () => {
    for (const handler of [fontsHandler, searchHandler]) {
        const response = mockResponse();
        await handler({ method: "POST", query: {} }, response);
        assert.equal(response.statusCode, 405);
        assert.equal(response.headers.Allow, "GET, OPTIONS");
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
        assert.equal(response.headers.Allow, "GET, OPTIONS");
        assert.equal(response.body.code, "METHOD_NOT_ALLOWED");
        assert.equal(response.headers["X-Content-Type-Options"], "nosniff");
    }
});

test("OpenAPI endpoint supports CORS preflight", () => {
    const response = mockResponse();
    handler({ method: "OPTIONS" }, response);
    assert.equal(response.statusCode, 204);
    assert.equal(response.headers["Access-Control-Allow-Methods"], "GET, OPTIONS");
    assert.equal(response.headers["Cache-Control"], "no-store");
});

test("date-dependent New sort and badges are not advertised without reliable dates", async () => {
    const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
    assert.doesNotMatch(html, /data-sort="new"/);
    assert.doesNotMatch(html, /isFontNew|getFontCreatedTimestamp|font-new-badge|font-old-badge/);
});
