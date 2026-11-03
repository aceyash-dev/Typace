#!/usr/bin/env node
/**
 * Rebuild fonts/manifest.json from git history.
 *
 * The catalog needs to know when a typeface was added, and the filesystem
 * cannot tell it: on Vercel every file's mtime is the build time. Git already
 * holds the answer, so this reads it once and commits the result, which keeps
 * request-time work to a single file read.
 *
 * Run from the repository root. Requires full history (fetch-depth: 0).
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FONTS_DIR, FONT_EXTENSIONS, FONT_MANIFEST_PATH, REPOSITORY_ROOT, FONT_MANIFEST_NOTE } from "./lib/config.mjs";
import { writeIfChanged } from "./lib/artifact.mjs";



function git(args) {
    try {
        return execFileSync("git", args, { cwd: REPOSITORY_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
        return "";
    }
}

export function buildFontManifest({ fontsDir = FONTS_DIR, outputPath = FONT_MANIFEST_PATH } = {}) {
const files = readdirSync(fontsDir)
    .filter((name) => FONT_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

if (!files.length) {
    console.error("No font files found in fonts/.");
    throw new Error("No font files found in fonts/.");
}

const fonts = {};
let missing = 0;

for (const file of files) {
    const relative = path.posix.join("fonts", file);
    // --diff-filter=A --follow walks back through renames, so a renamed file
    // keeps the date it was first added rather than the date it was moved.
    const addedLog = git(["log", "--diff-filter=A", "--follow", "--format=%aI", "--", relative])
        .split("\n").filter(Boolean);
    const updatedAt = git(["log", "-1", "--format=%aI", "--", relative]) || null;
    const addedAt = addedLog.length ? addedLog[addedLog.length - 1] : updatedAt;
    if (!addedAt) missing += 1;
    fonts[file] = { addedAt, updatedAt };
}



const result = writeIfChanged({
    outputPath,
    payload: {
        isUnchanged: (previous) => JSON.stringify(previous.fonts) === JSON.stringify(fonts),
        create: () => ({ note: FONT_MANIFEST_NOTE, fonts }),
    },
    summary: `fonts/manifest.json — ${files.length} fonts, ${missing} without a commit date`,
});
return result;
}

export function main() {
    try { buildFontManifest(); }
    catch (error) { console.error(`Font manifest failed: ${error.message}`); process.exitCode = 1; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
