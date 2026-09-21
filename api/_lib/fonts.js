import fs from "node:fs/promises";
import path from "node:path";

export const FONT_TYPES = {
    ".ttf": { type: "ttf", format: "truetype" },
    ".otf": { type: "otf", format: "opentype" },
    ".woff": { type: "woff", format: "woff" },
    ".woff2": { type: "woff2", format: "woff2" }
};

const NEW_FONT_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;
const GITHUB_REPOSITORY = "aceyash-dev/Typace";
const historyCache = new Map();

function inferCategory(name) {
    const value = String(name).toLowerCase();

    if (/(^|[^a-z])(mono|monospace|typewriter|terminal|code)([^a-z]|$)/.test(value)) {
        return "monospace";
    }

    if (/(^|[^a-z])(script|hand|handwritten|handwriting|brush|calligraphy|signature|marker|cursive)([^a-z]|$)/.test(value)) {
        return "handwritten";
    }

    if (/(^|[^a-z])(serif|slab|roman|bookman|antiqua)([^a-z]|$)/.test(value)) {
        return "serif";
    }

    if (/(^|[^a-z])(sans|grotesk|grotesque|humanist|geometric)([^a-z]|$)/.test(value)) {
        return "sans-serif";
    }

    return "display";
}

function githubHeaders() {
    const token = process.env.GITHUB_TOKEN;

    return {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
}

async function getGitHubFontDate(file) {
    if (historyCache.has(file)) {
        return historyCache.get(file);
    }

    const promise = (async () => {
        const encodedPath = file
            .split("/")
            .map(encodeURIComponent)
            .join("/");

        const url =
            `https://api.github.com/repos/${GITHUB_REPOSITORY}/commits?path=fonts/${encodedPath}&per_page=1`;

        const response = await fetch(url, {
            headers: githubHeaders(),
            cache: "no-store"
        });

        if (!response.ok) {
            return null;
        }

        const commits = await response.json();
        const commit = Array.isArray(commits) ? commits[0] : null;

        return (
            commit?.commit?.author?.date ||
            commit?.commit?.committer?.date ||
            null
        );
    })().catch(() => null);

    historyCache.set(file, promise);
    return promise;
}

export function normalize(value = "") {
    return String(value)
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\\u0300-\\u036f]/g, "")
        .replace(/\\.(ttf|otf|woff2?|)$/i, "")
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
    const stats = await fs.stat(absolutePath);

    const filesystemCreated = Number.isFinite(stats.birthtimeMs)
        ? stats.birthtimeMs
        : 0;

    const filesystemUpdated = Number.isFinite(stats.mtimeMs)
        ? stats.mtimeMs
        : 0;

    const githubDate = await getGitHubFontDate(relativePath);
    const githubTime = githubDate ? Date.parse(githubDate) : 0;

    const updatedTime =
        githubTime ||
        filesystemUpdated ||
        filesystemCreated;

    const createdTime =
        githubTime ||
        filesystemCreated ||
        filesystemUpdated;

    const isNew =
        createdTime > 0 &&
        Date.now() - createdTime <= NEW_FONT_WINDOW_MS;

    return {
        name,
        file: relativePath.split(path.sep).join("/"),
        type: metadata.type,
        format: metadata.format,
        category: inferCategory(name),
        url: `/fonts/${relativePath
            .split(path.sep)
            .map(encodeURIComponent)
            .join("/")}`,
        createdAt: createdTime
            ? new Date(createdTime).toISOString()
            : null,
        updatedAt: updatedTime
            ? new Date(updatedTime).toISOString()
            : null,
        ...(isNew ? { isNew: true } : {})
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
    const target = normalize(
        decodeURIComponent(slug || "")
    );

    return (
        fonts.find(font =>
            normalize(font.name) === target ||
            normalize(font.file) === target ||
            normalize(
                font.file.replace(/\\.[^.]+$/, "")
            ) === target
        ) || null
    );
}
