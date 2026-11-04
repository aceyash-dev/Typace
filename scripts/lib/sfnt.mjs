/**
 * Minimal sfnt reader: table directory, OS/2 and head/post/maxp fields, and a
 * codepoint test from the cmap.
 *
 * Split out of scripts/font-style-index.mjs so the parsing can be imported and
 * unit-tested (tests/sfnt.test.js) instead of only being exercised by a CI job
 * that writes a committed artifact. No dependencies; reads the bytes directly.
 *
 * Offsets below are the OpenType/TrueType table layouts, not arbitrary numbers:
 *   OS/2  usWeightClass at +4, usWidthClass at +6, fsSelection at +62
 *   head  macStyle at +44
 *   post  isFixedPitch at +12
 *   maxp  numGlyphs at +4
 */

// 0x00010000 (TrueType), 'OTTO' (CFF), 'true', 'typ1'.
const SFNT_SIGNATURES = new Set(["00010000", "4f54544f", "74727565", "74797031"]);

const OS2_WEIGHT_CLASS_OFFSET = 4;
const OS2_WIDTH_CLASS_OFFSET = 6;
const OS2_SELECTION_OFFSET = 62;
const HEAD_MAC_STYLE_OFFSET = 44;
const POST_FIXED_PITCH_OFFSET = 12;
const MAXP_GLYPHS_OFFSET = 4;

export const WEIGHT_CLASSES = Object.freeze([
    { below: 350, label: "light" },
    { below: 500, label: "regular" },
    { below: 600, label: "medium" },
    { below: 750, label: "bold" },
    { below: Infinity, label: "black" }
]);

export const WIDTH_CLASSES = Object.freeze([
    { max: 4, label: "condensed" },
    { max: 5, label: "normal" },
    { max: Infinity, label: "expanded" }
]);

export function weightLabel(weight) {
    return WEIGHT_CLASSES.find((entry) => weight < entry.below).label;
}

export function widthLabel(width) {
    return WIDTH_CLASSES.find((entry) => width <= entry.max).label;
}

/** The sfnt table directory, keyed by four-character tag. */
export function readTableDirectory(buffer) {
    const found = new Map();
    const count = buffer.readUInt16BE(4);
    for (let index = 0; index < count; index += 1) {
        const base = 12 + index * 16;
        const tag = buffer.toString("ascii", base, base + 4);
        found.set(tag, { offset: buffer.readUInt32BE(base + 8), length: buffer.readUInt32BE(base + 12) });
    }
    return found;
}

/** Minimal cmap reader: format 4 and format 12 are enough for a codepoint test. */
export function codePointTester(buffer, table) {
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

/**
 * Read a font's declared style, or null for a container we cannot read (WOFF2
 * is Brotli-compressed with per-table transforms). Parsing one as if it were
 * sfnt yields plausible-looking nonsense — weight 400, zero glyphs — which is
 * worse than saying "unknown".
 */
export function describeFont(buffer) {
    if (buffer.length < 12) return null;
    if (!SFNT_SIGNATURES.has(buffer.toString("hex", 0, 4))) return null;

    const tableDirectory = readTableDirectory(buffer);
    const os2 = tableDirectory.get("OS/2");
    const head = tableDirectory.get("head");
    const post = tableDirectory.get("post");
    const maxp = tableDirectory.get("maxp");

    const weight = os2 ? buffer.readUInt16BE(os2.offset + OS2_WEIGHT_CLASS_OFFSET) : 400;
    const width = os2 ? buffer.readUInt16BE(os2.offset + OS2_WIDTH_CLASS_OFFSET) : 5;
    const selection = os2 ? buffer.readUInt16BE(os2.offset + OS2_SELECTION_OFFSET) : 0;
    const macStyle = head ? buffer.readUInt16BE(head.offset + HEAD_MAC_STYLE_OFFSET) : 0;
    const italic = Boolean(selection & 0x01) || Boolean(macStyle & 0x02);
    const bold = Boolean(selection & 0x20) || Boolean(macStyle & 0x01);
    const fixedPitch = post ? buffer.readUInt32BE(post.offset + POST_FIXED_PITCH_OFFSET) !== 0 : false;
    const glyphs = maxp ? buffer.readUInt16BE(maxp.offset + MAXP_GLYPHS_OFFSET) : 0;

    const hasCodepoint = codePointTester(buffer, tableDirectory.get("cmap"));
    const hasLowercase = hasCodepoint(0x61);
    const hasUppercase = hasCodepoint(0x41);

    return {
        weight,
        weightClass: weightLabel(weight),
        width,
        widthClass: widthLabel(width),
        italic,
        bold,
        monospace: fixedPitch,
        allCaps: hasUppercase && !hasLowercase,
        glyphs,
    };
}
