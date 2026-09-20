import fs from "node:fs/promises";
import path from "node:path";

const FONT_TYPES = {
    ".ttf": { type: "ttf", format: "truetype" },
    ".otf": { type: "otf", format: "opentype" },
    ".woff": { type: "woff", format: "woff" },
    ".woff2": { type: "woff2", format: "woff2" }
};

const NEW_FONT_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;
const GITHUB_REPOSITORY = "aceyash-dev/Typace";
const historyCache = new Map();

function sendJSON(res, status, data) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(status).json(data);
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
    if (historyCache.has(file)) return historyCache.get(file);

    const promise = (async () => {
        const encodedPath = file.split("/").map(encodeURIComponent).join("/");
        const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/commits?path=fonts/${encodedPath}&per_page=1`;
        const response = await fetch(url, {
            headers: githubHeaders(),
            cache: "no-store"
        });
        if (!response.ok) return null;
        const commits = await response.json();
        const commit = Array.isArray(commits) ? commits[0] : null;
        return commit?.commit?.author?.date || commit?.commit?.committer?.date || null;
    })().catch(() => null);

    historyCache.set(file, promise);
    return promise;
}

async function getFontMetadata(entry, fontsDirectory) {
    const file = entry.name;
    const extension = path.extname(file).toLowerCase();
    const metadata = FONT_TYPES[extension];
    const name = file.slice(0, -extension.length).trim();
    const filePath = path.join(fontsDirectory, file);
    const stats = await fs.stat(filePath);

    const filesystemCreated = Number.isFinite(stats.birthtimeMs) ? stats.birthtimeMs : 0;
    const filesystemUpdated = Number.isFinite(stats.mtimeMs) ? stats.mtimeMs : 0;
    const githubDate = await getGitHubFontDate(file);
    const githubTime = githubDate ? Date.parse(githubDate) : 0;

    const updatedTime = githubTime || filesystemUpdated || filesystemCreated;
    const createdTime = githubTime || filesystemCreated || filesystemUpdated;
    const isNew = createdTime > 0 && Date.now() - createdTime <= NEW_FONT_WINDOW_MS;

    const font = {
        name,
        file,
        type: metadata.type,
        format: metadata.format,
        createdAt: new Date(createdTime).toISOString(),
        updatedAt: new Date(updatedTime).toISOString()
    };

    if (isNew) font.isNew = true;
    return font;
}

export default async function handler(req, res) {
    if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        return res.status(204).end();
    }

    if (req.method !== "GET") {
        return sendJSON(res, 405, { error: "Method not allowed." });
    }

    try {
        const fontsDirectory = path.join(process.cwd(), "fonts");
        const entries = await fs.readdir(fontsDirectory, { withFileTypes: true });
        const fontEntries = entries.filter(entry => {
            if (!entry.isFile()) return false;
            return Boolean(FONT_TYPES[path.extname(entry.name).toLowerCase()]);
        });

        const fonts = await Promise.all(
            fontEntries.map(entry => getFontMetadata(entry, fontsDirectory))
        );

        fonts.sort((a, b) => {
            const aTime = Date.parse(a.createdAt || "") || 0;
            const bTime = Date.parse(b.createdAt || "") || 0;
            return bTime - aTime;
        });

        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "no-store, max-age=0");
        return sendJSON(res, 200, fonts);
    } catch (error) {
        console.error("Typace font discovery failed:", error);
        return sendJSON(res, 500, {
            error: "Unable to scan the fonts directory.",
            code: "FONT_SCAN_FAILED"
        });
    }
}