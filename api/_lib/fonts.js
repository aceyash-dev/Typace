import fs from "node:fs/promises";
import path from "node:path";

export const FONT_TYPES = {
    ".ttf": { type: "ttf", format: "truetype" },
    ".otf": { type: "otf", format: "opentype" },
    ".woff": { type: "woff", format: "woff" },
    ".woff2": { type: "woff2", format: "woff2" }
};

const categoryCache = new Map();
const CATALOG_CACHE_TTL_MS = 30_000;
let cachedCatalog = null;
let cachedCatalogAt = 0;
let catalogPromise = null;

async function readPanose(filePath) {
    if (categoryCache.has(filePath)) return categoryCache.get(filePath);

    const promise = (async () => {
        let handle;
        try {
            handle = await fs.open(filePath, "r");
            const header = Buffer.alloc(12);
            const firstRead = await handle.read(header, 0, header.length, 0);
            if (firstRead.bytesRead !== header.length) return null;

            const signature = header.toString("hex", 0, 4);
            if (!["00010000", "4f54544f", "74727565", "74797031"].includes(signature)) return null;

            const tableCount = header.readUInt16BE(4);
            if (tableCount < 1 || tableCount > 4096) return null;

            const directory = Buffer.alloc(tableCount * 16);
            const directoryRead = await handle.read(directory, 0, directory.length, 12);
            if (directoryRead.bytesRead !== directory.length) return null;

            for (let index = 0; index < tableCount; index++) {
                const offset = index * 16;
                if (directory.toString("ascii", offset, offset + 4) !== "OS/2") continue;

                const tableOffset = directory.readUInt32BE(offset + 8);
                const tableLength = directory.readUInt32BE(offset + 12);
                if (tableLength < 42 || tableOffset + 42 > 0xffffffff) return null;

                const os2 = Buffer.alloc(42);
                const tableRead = await handle.read(os2, 0, os2.length, tableOffset);
                if (tableRead.bytesRead !== os2.length) return null;

                if (os2[32] !== 2) return null;
                const serifStyle = os2[33];
                if ([11, 12, 13].includes(serifStyle)) return "sans-serif";
                if ([2, 3, 4, 5, 6, 7, 8, 9, 10].includes(serifStyle)) return "serif";
                return null;
            }
        } catch {
            return null;
        } finally {
            if (handle) await handle.close().catch(() => {});
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

async function buildCatalog() {
    const fontsDirectory = path.join(process.cwd(), "fonts");
    const entries = await readFontFiles(fontsDirectory);
    const fonts = [];
    const batchSize = 16;

    for (let index = 0; index < entries.length; index += batchSize) {
        const batch = entries.slice(index, index + batchSize);
        fonts.push(...await Promise.all(batch.map(getFontMetadata)));
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
                return fonts;
            })
            .catch(error => {
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
