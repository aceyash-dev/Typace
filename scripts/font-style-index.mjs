#!/usr/bin/env node
/**
 * Build fonts/style-index.json from the font binaries.
 *
 * "Searchable by feel" needs attributes the catalogue does not have: there is no
 * designer, foundry, or category metadata, and guessing a category from PANOSE
 * proved unreliable. What a font *is* can still be read from its own tables —
 * weight, width, italic, monospace and case coverage are declared by the file,
 * not inferred from its name.
 *
 * Run from the repository root. No dependencies: reads sfnt tables directly.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const FONT_EXTENSIONS = new Set([".ttf", ".otf", ".woff", ".woff2"]);
const root = process.cwd();
const fontsDir = path.join(root, "fonts");

function tables(buffer) {
    const found = new Map();
    const count = buffer.readUInt16BE(4);
    for (let index = 0; index < count; index += 1) {
        const base = 12 + index * 16;
        const tag = buffer.toString("ascii", base, base + 4);
        found.set(tag, { offset: buffer.readUInt32BE(base + 8), length: buffer.readUInt32BE(base + 12) });
    }
    return found;
}

function weightLabel(weight) {
    if (weight < 350) return "light";
    if (weight < 500) return "regular";
    if (weight < 600) return "medium";
    if (weight < 750) return "bold";
    return "black";
}

function widthLabel(width) {
    if (width <= 4) return "condensed";
    if (width === 5) return "normal";
    return "expanded";
}

/** Minimal cmap reader: format 4 and format 12 are enough for a codepoint test. */
function codePointTester(buffer, table) {
    if (!table) return () => false;
    const base = table.offset;
    const count = buffer.readUInt16BE(base + 2);
    let best = null;
    for (let index = 0; index < count; index += 1) {
        const record = base + 4 + index * 8;
        const platform = buffer.readUInt16BE(record);
        const encoding = buffer.readUInt16BE(record + 2);
        const offset = base + buffer.readUInt32BE(record + 4);
        const format = buffer.readUInt16BE(offset);
        // Prefer a full Unicode table, then a BMP Unicode one.
        const rank = (platform === 3 && encoding === 10) ? 3 : (platform === 3 && encoding === 1) ? 2 : (platform === 0) ? 1 : 0;
        if (rank && (format === 4 || format === 12) && (!best || rank > best.rank)) {
            best = { rank, offset, format };
        }
    }
    if (!best) return () => false;

    if (best.format === 12) {
        const groups = buffer.readUInt32BE(best.offset + 12);
        return (codePoint) => {
            for (let index = 0; index < groups; index += 1) {
                const group = best.offset + 16 + index * 12;
                const start = buffer.readUInt32BE(group);
                const end = buffer.readUInt32BE(group + 4);
                if (codePoint >= start && codePoint <= end) return true;
            }
            return false;
        };
    }

    const segments = buffer.readUInt16BE(best.offset + 6) / 2;
    const ends = best.offset + 14;
    const starts = ends + segments * 2 + 2;
    return (codePoint) => {
        for (let index = 0; index < segments; index += 1) {
            const end = buffer.readUInt16BE(ends + index * 2);
            if (codePoint > end) continue;
            const start = buffer.readUInt16BE(starts + index * 2);
            return codePoint >= start;
        }
        return false;
    };
}

const SFNT_SIGNATURES = new Set(["00010000", "4f54544f", "74727565", "74797031"]);

/**
 * Returns null for a container we cannot read (WOFF2 is Brotli-compressed with
 * per-table transforms). Parsing one as if it were sfnt yields plausible-looking
 * nonsense — weight 400, zero glyphs — which is worse than saying "unknown".
 */
function describe(buffer) {
    if (buffer.length < 12) return null;
    if (!SFNT_SIGNATURES.has(buffer.toString("hex", 0, 4))) return null;

    const map = tables(buffer);
    const os2 = map.get("OS/2");
    const head = map.get("head");
    const post = map.get("post");
    const maxp = map.get("maxp");

    const weight = os2 ? buffer.readUInt16BE(os2.offset + 4) : 400;
    const width = os2 ? buffer.readUInt16BE(os2.offset + 6) : 5;
    const selection = os2 ? buffer.readUInt16BE(os2.offset + 62) : 0;
    const macStyle = head ? buffer.readUInt16BE(head.offset + 44) : 0;
    const italic = Boolean(selection & 0x01) || Boolean(macStyle & 0x02);
    const bold = Boolean(selection & 0x20) || Boolean(macStyle & 0x01);
    const fixedPitch = post ? buffer.readUInt32BE(post.offset + 12) !== 0 : false;
    const glyphs = maxp ? buffer.readUInt16BE(maxp.offset + 4) : 0;

    const has = codePointTester(buffer, map.get("cmap"));
    const lower = has(0x61);
    const upper = has(0x41);

    return {
        weight,
        weightClass: weightLabel(weight),
        width,
        widthClass: widthLabel(width),
        italic,
        bold,
        monospace: fixedPitch,
        allCaps: upper && !lower,
        glyphs,
    };
}

const files = readdirSync(fontsDir)
    .filter((name) => FONT_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

const fonts = {};
const unsupported = [];
for (const file of files) {
    let described = null;
    try {
        described = describe(readFileSync(path.join(fontsDir, file)));
    } catch {
        described = null;
    }
    if (described) fonts[file] = described;
    else unsupported.push(file);
}

const manifestPath = path.join(fontsDir, "style-index.json");
let previous = null;
try { previous = JSON.parse(readFileSync(manifestPath, "utf8")); } catch { /* first run */ }
const unchanged = previous && JSON.stringify(previous.fonts) === JSON.stringify(fonts) && JSON.stringify(previous.unsupported) === JSON.stringify(unsupported);

const output = {
    generatedAt: unchanged ? previous.generatedAt : new Date().toISOString(),
    note: "Generated by scripts/font-style-index.mjs from sfnt tables. Do not edit by hand. Files listed in 'unsupported' are compressed containers whose tables cannot be read without a WOFF2 decoder, so they carry no style data.",
    fonts,
    unsupported,
};
const serialised = JSON.stringify(output, null, 2) + "\n";
if (serialised === (previous ? JSON.stringify(previous, null, 2) + "\n" : "")) {
    console.log(`fonts/style-index.json already current — ${Object.keys(fonts).length} fonts.`);
} else {
    writeFileSync(manifestPath, serialised, "utf8");
    console.log(`Wrote fonts/style-index.json — ${Object.keys(fonts).length} parsed, ${unsupported.length} unsupported.`);
    if (unsupported.length) console.log("unsupported:", unsupported.join(", "));
}
