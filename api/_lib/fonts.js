import fs from "node:fs/promises";
import path from "node:path";

export const FONT_TYPES = {
    ".ttf": { type: "ttf", format: "truetype" },
    ".otf": { type: "otf", format: "opentype" },
    ".woff": { type: "woff", format: "woff" },
    ".woff2": { type: "woff2", format: "woff2" }
};

const NEW_FONT_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;

function inferFontMetadata(name) {
    const value = String(name).toLowerCase();
    let weight = "400";
    const numeric = value.match(/(?:^|[^0-9])(100|200|300|400|500|600|700|800|900)(?:[^0-9]|$)/);
    if (numeric) weight = numeric[1];
    else {
        const weights = [
            ["thin","100"],["extralight","200"],["extra light","200"],["light","300"],
            ["regular","400"],["normal","400"],["medium","500"],["semibold","600"],
            ["semi bold","600"],["bold","700"],["extrabold","800"],["extra bold","800"],["black","900"]
        ];
        for (const [label, valueWeight] of weights) {
            if (value.includes(label)) { weight = valueWeight; break; }
        }
    }

    const style = value.includes("italic") || value.includes("oblique") ? "italic" : "normal";
    let category = null;
    if (/(^|[^a-z])(serif|slab)([^a-z]|$)/.test(value)) category = "serif";
    else if (/(^|[^a-z])(sans|grotesk|grotesque)([^a-z]|$)/.test(value)) category = "sans-serif";
    else if (/(^|[^a-z])(mono|monospace|code)([^a-z]|$)/.test(value)) category = "monospace";
    else if (/(^|[^a-z])(script|hand|handwriting|brush|calligraphy)([^a-z]|$)/.test(value)) category = "script";
    else if (/(^|[^a-z])(display|poster|headline)([^a-z]|$)/.test(value)) category = "display";

    return { weight, style, category };
}
const GITHUB_REPOSITORY = "aceyash-dev/Typace";
const historyCache = new Map();

function githubHeaders() {
    const token = process.env.GITHUB_TOKEN;
    return {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
}

async function getGitHubFontDate(file) {
    if (historyCache.has(file)) return historyCache.get(file);
    const promise = (async () => {
        const encodedPath = file.split("/").map(encodeURIComponent).join("/");
        const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/commits?path=fonts/${encodedPath}&per_page=1`;
        const response = await fetch(url, { headers: githubHeaders(), cache: "no-store" });
        if (!response.ok) return null;
        const commits = await response.json();
        const commit = Array.isArray(commits) ? commits[0] : null;
        return commit?.commit?.author?.date || commit?.commit?.committer?.date || null;
    })().catch(() => null);
    historyCache.set(file, promise);
    return promise;
}

export function normalize(value = "") {
    return value.toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\.(ttf|otf|woff2?|)$/i, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

async function getFontMetadata(entry, fontsDirectory) {
    const file = entry.name;
    const extension = path.extname(file).toLowerCase();
    const metadata = FONT_TYPES[extension];
    const name = file.slice(0, -extension.length).trim();
    const stats = await fs.stat(path.join(fontsDirectory, file));
    const filesystemCreated = Number.isFinite(stats.birthtimeMs) ? stats.birthtimeMs : 0;
    const filesystemUpdated = Number.isFinite(stats.mtimeMs) ? stats.mtimeMs : 0;
    const githubDate = await getGitHubFontDate(file);
    const githubTime = githubDate ? Date.parse(githubDate) : 0;
    const updatedTime = githubTime || filesystemUpdated || filesystemCreated;
    const createdTime = githubTime || filesystemCreated || filesystemUpdated;
    const isNew = createdTime > 0 && Date.now() - createdTime <= NEW_FONT_WINDOW_MS;

    return {
        name, file,
        type: metadata.type,
        format: metadata.format,
        ...inferFontMetadata(name),
        url: `/fonts/${encodeURIComponent(file)}`,
        createdAt: createdTime ? new Date(createdTime).toISOString() : null,
        updatedAt: updatedTime ? new Date(updatedTime).toISOString() : null,
        ...(isNew ? { isNew: true } : {})
    };
}

export async function listFonts() {
    const fontsDirectory = path.join(process.cwd(), "fonts");
    const entries = await fs.readdir(fontsDirectory, { withFileTypes: true });
    const fontEntries = entries.filter(entry =>
        entry.isFile() && Boolean(FONT_TYPES[path.extname(entry.name).toLowerCase()])
    );
    const fonts = await Promise.all(fontEntries.map(entry => getFontMetadata(entry, fontsDirectory)));
    return fonts.sort((a, b) =>
        (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0)
    );
}

export function findFont(fonts, slug) {
    const target = normalize(decodeURIComponent(slug || ""));
    return fonts.find(font =>
        normalize(font.name) === target ||
        normalize(font.file) === target ||
        normalize(font.file.replace(/\.[^.]+$/, "")) === target
    ) || null;
}
