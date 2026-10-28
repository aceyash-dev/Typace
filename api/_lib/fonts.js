import fs from "node:fs/promises";
import path from "node:path";

export const FONT_TYPES = {
    ".ttf": { type: "ttf", format: "truetype" },
    ".otf": { type: "otf", format: "opentype" },
    ".woff": { type: "woff", format: "woff" },
    ".woff2": { type: "woff2", format: "woff2" }
};

const CATALOG_CACHE_TTL_MS = 30_000;

// How long an addition counts as "new". A window rather than a fixed batch list:
// the manifest carries real add dates, so this decays on its own and nobody has
// to remember to update a set when fonts are added.
const NEW_WINDOW_DAYS = Number.parseInt(process.env.TYPACE_NEW_WINDOW_DAYS || "14", 10) || 14;
const NEW_WINDOW_MS = NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const MANIFEST_TTL_MS = 30_000;

let manifestCache = null;
let manifestCachedAt = 0;

/**
 * fonts/manifest.json, generated from git history by scripts/font-manifest.mjs.
 * Absent manifest means every date is unknown, which degrades to createdAt null
 * and nothing flagged new — never to a guess.
 */
async function readManifest() {
    const now = Date.now();
    if (manifestCache && now - manifestCachedAt < MANIFEST_TTL_MS) return manifestCache;
    try {
        const raw = await fs.readFile(path.join(process.cwd(), "fonts", "manifest.json"), "utf8");
        const parsed = JSON.parse(raw);
        manifestCache = parsed && typeof parsed === "object" && parsed.fonts && typeof parsed.fonts === "object"
            ? parsed.fonts
            : {};
    } catch {
        manifestCache = {};
    }
    manifestCachedAt = now;
    return manifestCache;
}

export function isRecentlyAdded(addedAt, now = Date.now()) {
    const timestamp = Date.parse(String(addedAt || ""));
    if (!Number.isFinite(timestamp)) return false;
    const age = now - timestamp;
    // Tolerate a small clock skew so a just-committed font is not "from the future".
    return age <= NEW_WINDOW_MS && age > -24 * 60 * 60 * 1000;
}

let cachedCatalog = null;
let cachedCatalogAt = 0;
let catalogPromise = null;
let lastGoodCatalog = null;
let catalogBuiltAt = 0;
let catalogIssue = null;

// A hung filesystem read must not hang the function until the platform kills it.
const CATALOG_BUILD_TIMEOUT_MS = 8_000;
const STALE_RETRY_MS = 5_000;

function withTimeout(promise, ms, label) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(label + " timed out after " + ms + "ms")), ms);
        })
    ]).finally(() => clearTimeout(timer));
}

/** Canonical URL slug shared by font pages, format listings, and the sitemap. */
/** Canonical origin for absolute asset URLs in generated CSS. */
export const CANONICAL_ORIGIN = "https://typace.ace-base.cc";

/** Absolute URL for a font file, resolved against the canonical origin. */
export function fontFileUrl(font) {
    return new URL(font.url, CANONICAL_ORIGIN).href;
}

/** The ready-to-paste @font-face rule for a font. */
export function fontFaceCss(font) {
    const family = JSON.stringify(font.name).slice(1, -1);
    return `@font-face {
  font-family: "${family}";
  src: url("${fontFileUrl(font)}") format("${font.format}");
  font-display: swap;
}`;
}

/** Fields a client may request through ?fields=. */
export const FONT_FIELDS = ["name", "file", "type", "format", "url", "sizeBytes", "createdAt", "updatedAt", "isNew"];

/**
 * Parse ?fields= into a validated list. Returns null when the parameter is
 * absent. Unknown names are rejected rather than ignored, so a typo surfaces
 * instead of silently returning full records.
 */
export function parseFields(value) {
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw === undefined || raw === null || String(raw).trim() === "") return null;
    const requested = String(raw).split(",").map((name) => name.trim()).filter(Boolean);
    if (!requested.length) return null;
    const unknown = requested.filter((name) => !FONT_FIELDS.includes(name));
    if (unknown.length) {
        const error = new Error("Unknown field(s): " + unknown.join(", "));
        error.code = "INVALID_FIELDS";
        error.allowed = FONT_FIELDS;
        throw error;
    }
    return [...new Set(requested)];
}

/** Apply a ?fields= selection, preserving the requested order. */
export function selectFields(records, fields) {
    if (!fields) return records;
    return records.map((record) => {
        if (record === null) return null;
        const out = {};
        for (const name of fields) out[name] = record[name];
        return out;
    });
}

/** Parse ?slugs= into a bounded, de-duplicated list. */
export function parseSlugs(value, max = 25) {
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw === undefined || raw === null || String(raw).trim() === "") return null;
    const slugs = [...new Set(String(raw).split(",").map((slug) => slug.trim()).filter(Boolean))];
    if (!slugs.length) return null;
    if (slugs.length > max) {
        const error = new Error(`Too many slugs; the limit is ${max}.`);
        error.code = "TOO_MANY_SLUGS";
        error.limit = max;
        throw error;
    }
    return slugs;
}

export function fontSlug(value = "") {
    return String(value || "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export function normalize(value = "") {
    return String(value)
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\.(ttf|otf|woff2?)$/i, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

async function readFontFiles(directory, relativeDirectory = "") {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const absolutePath = path.join(directory, entry.name);
        const relativePath = relativeDirectory
            ? path.join(relativeDirectory, entry.name)
            : entry.name;

        if (entry.isDirectory()) {
            files.push(...await readFontFiles(absolutePath, relativePath));
            continue;
        }

        if (!entry.isFile()) {
            continue;
        }

        const extension = path.extname(entry.name).toLowerCase();

        if (FONT_TYPES[extension]) {
            files.push({
                name: entry.name,
                relativePath,
                absolutePath
            });
        }
    }

    return files;
}

async function getFontMetadata(entry, manifest = {}) {
    const { name: fileName, relativePath, absolutePath } = entry;
    const extension = path.extname(fileName).toLowerCase();
    const metadata = FONT_TYPES[extension];
    const name = fileName.slice(0, -extension.length).trim();
    let sizeBytes = null;
    try { sizeBytes = (await fs.stat(absolutePath)).size; } catch { /* Metadata remains usable if stat is unavailable. */ }
    return {
        name,
        file: relativePath.split(path.sep).join("/"),
        type: metadata.type,
        format: metadata.format,
        sizeBytes,
        url: `/fonts/${relativePath
            .split(path.sep)
            .map(encodeURIComponent)
            .join("/")}`,
        createdAt: manifest[fileName]?.addedAt || null,
        updatedAt: manifest[fileName]?.updatedAt || null,
        isNew: isRecentlyAdded(manifest[fileName]?.addedAt)
    };
}

async function buildCatalog() {
    const fontsDirectory = path.join(process.cwd(), "fonts");
    let entries;
    try {
        entries = await withTimeout(readFontFiles(fontsDirectory), CATALOG_BUILD_TIMEOUT_MS, "font scan");
    } catch (error) {
        if (error && error.code === "ENOENT") {
            // A missing directory is a deployment problem, not a valid empty catalog.
            // Throw so listFonts() can retain the last known-good snapshot.
            catalogIssue = "fonts-directory-missing";
            throw error;
        }
        throw error;
    }
    catalogIssue = null;
    const manifest = await readManifest();
    const fonts = [];
    const batchSize = 16;

    for (let index = 0; index < entries.length; index += batchSize) {
        const batch = entries.slice(index, index + batchSize);
        fonts.push(...await Promise.all(batch.map((entry) => getFontMetadata(entry, manifest))));
    }

    return fonts.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export async function listFonts() {
    if (cachedCatalog && Date.now() - cachedCatalogAt < CATALOG_CACHE_TTL_MS) {
        return cachedCatalog;
    }

    if (!catalogPromise) {
        catalogPromise = buildCatalog()
            .then(fonts => {
                cachedCatalog = fonts;
                cachedCatalogAt = Date.now();
                lastGoodCatalog = fonts;
                catalogBuiltAt = Date.now();
                return fonts;
            })
            .catch(error => {
                // Reliability first: never fail a request while a usable snapshot
                // is still held. Serve it and retry the rebuild shortly.
                if (lastGoodCatalog) {
                    catalogIssue = "serving-stale-snapshot";
                    cachedCatalog = lastGoodCatalog;
                    cachedCatalogAt = Date.now() - CATALOG_CACHE_TTL_MS + STALE_RETRY_MS;
                    return lastGoodCatalog;
                }
                cachedCatalog = null;
                cachedCatalogAt = 0;
                throw error;
            })
            .finally(() => {
                catalogPromise = null;
            });
    }

    return catalogPromise;
}

/** Operational view of the catalog for /api/health. Never throws. */
export function getCatalogStatus() {
    return {
        cached: Boolean(cachedCatalog),
        stale: Boolean(cachedCatalog) && Date.now() - cachedCatalogAt >= CATALOG_CACHE_TTL_MS,
        ageSeconds: catalogBuiltAt ? Math.round((Date.now() - catalogBuiltAt) / 1000) : null,
        issue: catalogIssue
    };
}

export function findFont(fonts, slug) {
    let decoded = "";
    try {
        decoded = decodeURIComponent(Array.isArray(slug) ? slug[0] || "" : slug || "");
    } catch {
        return null;
    }

    const target = normalize(decoded);
    if (!target) return null;

    return fonts.find(font => {
        const filename = String(font.file || "").split("/").pop() || "";
        return normalize(font.name) === target ||
            normalize(filename) === target ||
            normalize(font.file) === target;
    }) || null;
}
