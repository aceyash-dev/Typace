/** Minimal OpenType/sfnt readers shared by the font build scripts. */
const SFNT_SIGNATURES = new Set(["00010000", "4f54544f", "74727565", "74797031"]);
const OS2 = Object.freeze({ WEIGHT_CLASS: 4, WIDTH_CLASS: 6, SELECTION: 62 });
const HEAD = Object.freeze({ MAC_STYLE: 44 });
const POST = Object.freeze({ FIXED_PITCH: 12 });
const MAXP = Object.freeze({ NUM_GLYPHS: 4 });

export function readTableDirectory(buffer) {
    if (buffer.length < 12) throw new RangeError("Truncated sfnt header");
    const count = buffer.readUInt16BE(4);
    if (12 + count * 16 > buffer.length) throw new RangeError("Truncated sfnt table directory");
    const directory = new Map();
    for (let index = 0; index < count; index += 1) {
        const recordOffset = 12 + index * 16;
        const tag = buffer.toString("ascii", recordOffset, recordOffset + 4);
        const offset = buffer.readUInt32BE(recordOffset + 8);
        const length = buffer.readUInt32BE(recordOffset + 12);
        if (offset + length > buffer.length) throw new RangeError(`Table ${tag} extends beyond the font buffer`);
        directory.set(tag, { offset, length });
    }
    return directory;
}

const weightLabels = [[350, "light"], [500, "regular"], [600, "medium"], [750, "bold"], [Infinity, "black"]];
const widthLabels = new Map([[1, "condensed"], [2, "condensed"], [3, "condensed"], [4, "condensed"], [5, "normal"]]);
export function weightLabel(weight) { return weightLabels.find(([limit]) => weight < limit)[1]; }
export function widthLabel(width) { return widthLabels.get(width) || (width <= 4 ? "condensed" : "expanded"); }

/** Return a predicate for Unicode cmap format 4 or 12; unsupported tables return false. */
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
        const rank = platform === 3 && encoding === 10 ? 3 : platform === 3 && encoding === 1 ? 2 : platform === 0 ? 1 : 0;
        if (rank && (format === 4 || format === 12) && (!best || rank > best.rank)) best = { rank, offset, format };
    }
    if (!best) return () => false;
    if (best.format === 12) {
        const groups = buffer.readUInt32BE(best.offset + 12);
        return (codePoint) => {
            let low = 0, high = groups - 1;
            while (low <= high) {
                const middle = (low + high) >> 1;
                const group = best.offset + 16 + middle * 12;
                const start = buffer.readUInt32BE(group), end = buffer.readUInt32BE(group + 4);
                if (codePoint < start) high = middle - 1;
                else if (codePoint > end) low = middle + 1;
                else return true;
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
            return codePoint >= buffer.readUInt16BE(starts + index * 2);
        }
        return false;
    };
}

/** Return null for WOFF/WOFF2 containers; throw for malformed sfnt data. */
export function describeFont(buffer) {
    if (buffer.length < 4 || !SFNT_SIGNATURES.has(buffer.toString("hex", 0, 4))) return null;
    const directory = readTableDirectory(buffer);
    const os2 = directory.get("OS/2"), head = directory.get("head");
    const post = directory.get("post"), maxp = directory.get("maxp");
    const readField = (table, offset, method = "readUInt16BE") => table ? buffer[method](table.offset + offset) : 0;
    const weight = os2 ? readField(os2, OS2.WEIGHT_CLASS) : 400;
    const width = os2 ? readField(os2, OS2.WIDTH_CLASS) : 5;
    const selection = readField(os2, OS2.SELECTION);
    const macStyle = readField(head, HEAD.MAC_STYLE);
    const hasCodepoint = codePointTester(buffer, directory.get("cmap"));
    const hasLowercase = hasCodepoint(0x61), hasUppercase = hasCodepoint(0x41);
    return {
        weight, weightClass: weightLabel(weight), width, widthClass: widthLabel(width),
        italic: Boolean(selection & 0x01) || Boolean(macStyle & 0x02),
        bold: Boolean(selection & 0x20) || Boolean(macStyle & 0x01),
        monospace: Boolean(readField(post, POST.FIXED_PITCH, "readUInt32BE")),
        allCaps: hasUppercase && !hasLowercase,
        glyphs: readField(maxp, MAXP.NUM_GLYPHS),
    };
}
