#!/usr/bin/env node
/**
 * Rebuild fonts/manifest.json from git history.
 *
 * The catalog needs to know when a typeface was added, and the filesystem
 * cannot tell it: on Vercel every file's mtime is the build time. Git already
 * holds the answer, so this reads it once and commits the result, which keeps
 * request-time work to a single file read.
 *
 * Requires full history (fetch-depth: 0). Paths come from scripts/lib/config.mjs,
 * so the script runs from any working directory.
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

import { writeArtifact } from "./lib/artifact.mjs";
import {
    FONT_EXTENSIONS,
    FONTS_DIR,
    MANIFEST_NOTE,
    MANIFEST_PATH,
    REPO_ROOT
} from "./lib/config.mjs";

function git(args) {
    try {
        return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
        return "";
    }
}

// Walk fonts/ the way api/_lib/fonts.js does. Listing only the top level meant
// a font in a subdirectory got no manifest entry, so its dates, NEW badge and
// style filters silently went missing from the catalogue.
function listFontFiles(directory, relativeDirectory = "") {
    const entries = readdirSync(directory, { withFileTypes: true });
    const found = [];
    for (const entry of entries) {
        const relative = relativeDirectory
            ? path.posix.join(relativeDirectory, entry.name)
            : entry.name;
        if (entry.isDirectory()) {
            found.push(...listFontFiles(path.join(directory, entry.name), relative));
            continue;
        }
        if (!entry.isFile()) continue;
        if (FONT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) found.push(relative);
    }
    return found;
}

function main() {
    const files = listFontFiles(FONTS_DIR)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    if (!files.length) {
        console.error("No font files found in fonts/.");
        process.exitCode = 1;
        return;
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

    writeArtifact({
        path: MANIFEST_PATH,
        note: MANIFEST_NOTE,
        content: { fonts },
        logCurrent: () => console.log(`fonts/manifest.json already current — ${files.length} fonts.`),
        logWritten: () => console.log(`Wrote fonts/manifest.json — ${files.length} fonts, ${missing} without a commit date.`)
    });
}

main();
