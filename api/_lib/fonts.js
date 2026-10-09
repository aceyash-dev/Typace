import fs from "node:fs/promises";
import path from "node:path";

export const FONT_TYPES = {
    ".ttf": { type: "ttf", format: "truetype" },
    ".otf": { type: "otf", format: "opentype" },
    ".woff": { type: "woff", format: "woff" },
    ".woff2": { type: "woff2", format: "woff2" }
};

const categoryCache = new Map();

async function readPanose(filePath) {
    if (categoryCache.has(filePath)) {
        return categoryCache.get(filePath);
    }

    const promise = (async () => {
        try {
            const buffer = await fs.readFile(filePath);

            if (buffer.length < 12 || buffer.toString("ascii", 0, 4) === "ttcf") {
                return null;
            }

            const numTables = buffer.readUInt16BE(4);

            for (let index = 0; index < numTables; index++) {
                const offset = 12 + index * 16;

                if (offset + 16 > buffer.length) {
                    break;
                }

                const tag = buffer.toString("ascii", offset, offset + 4);

                if (tag !== "OS/2") {
                    continue;
                }

                const tableOffset = buffer.readUInt32BE(offset + 8);
                const tableLength = buffer.readUInt32BE(offset + 12);

                if (tableOffset + 42 > buffer.length || tableLength < 42) {
                    return null;
                }

                const familyType = buffer[tableOffset + 32];
                const serifStyle = buffer[tableOffset + 33];

                if (familyType !== 2) {
                    return null;
                }

                if ([11, 12, 13].includes(serifStyle)) {
                    return "sans-serif";
                }

                if ([2, 3, 4, 5, 6, 7, 8, 9, 10].includes(serifStyle)) {
                    return "serif";
                }

                return null;
            }
        } catch {
            return null;
        }

        return null;
    })();

    categoryCache.set(filePath, promise);
    return promise;
}

async function getFontCategory(filePath) {
    return (await readPanose(filePath)) || "unknown";
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

async function getFontMetadata(entry) {
    const { name: fileName, relativePath, absolutePath } = entry;
    const extension = path.extname(fileName).toLowerCase();
    const metadata = FONT_TYPES[extension];
    const name = fileName.slice(0, -extension.length).trim();
    return {
        name,
        file: relativePath.split(path.sep).join("/"),
        type: metadata.type,
        format: metadata.format,
        category: await getFontCategory(absolutePath),
        url: `/fonts/${relativePath
            .split(path.sep)
            .map(encodeURIComponent)
            .join("/")}`,
        createdAt: null,
        updatedAt: null
    };
}

export async function listFonts() {
    const fontsDirectory = path.join(process.cwd(), "fonts");
    const entries = await readFontFiles(fontsDirectory);

    const fonts = await Promise.all(
        entries.map(getFontMetadata)
    );

    return fonts.sort(
        (a, b) =>
            (Date.parse(b.createdAt || "") || 0) -
            (Date.parse(a.createdAt || "") || 0)
    );
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
