#!/usr/bin/env node
/** Build fonts/style-index.json from declared sfnt metadata; WOFF2 requires a decoder. */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FONTS_DIR, FONT_EXTENSIONS, STYLE_INDEX_PATH, STYLE_INDEX_NOTE, REPOSITORY_ROOT } from "./lib/config.mjs";
import { writeIfChanged } from "./lib/artifact.mjs";
import { describeFont } from "./lib/sfnt.mjs";

export function buildStyleIndex({ fontsDir = FONTS_DIR, outputPath = STYLE_INDEX_PATH } = {}) {
    fontsDir = path.resolve(REPOSITORY_ROOT, fontsDir);
    outputPath = path.resolve(REPOSITORY_ROOT, outputPath);
    const files = readdirSync(fontsDir)
        .filter((name) => FONT_EXTENSIONS.has(path.extname(name).toLowerCase()))
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    if (!files.length) throw new Error(`No font files found in ${fontsDir}.`);
    const fonts = {}, unsupported = [], failed = [];
    for (const file of files) {
        try {
            const described = describeFont(readFileSync(path.join(fontsDir, file)));
            if (described) fonts[file] = described;
            else unsupported.push(file);
        } catch (error) {
            failed.push({ file, reason: error.message });
            console.warn(`Unable to parse ${file}: ${error.message}`);
        }
    }
    if (Object.keys(fonts).length === 0) {
        throw new Error("No fonts could be parsed; refusing to publish an empty style index.");
    }
    const result = writeIfChanged({
        outputPath,
        payload: {
            isUnchanged: (previous) => JSON.stringify(previous.fonts) === JSON.stringify(fonts)
                && JSON.stringify(previous.unsupported) === JSON.stringify(unsupported)
                && JSON.stringify(previous.failed || []) === JSON.stringify(failed),
            create: () => ({ note: STYLE_INDEX_NOTE, fonts, unsupported, ...(failed.length ? { failed } : {}) }),
        },
        summary: `fonts/style-index.json — ${Object.keys(fonts).length} parsed, ${unsupported.length} unsupported, ${failed.length} failed`,
    });
    return { ...result, parsed: Object.keys(fonts).length, unsupported: unsupported.length, failed: failed.length };
}

export function main() {
    try {
        return buildStyleIndex();
    } catch (error) {
        console.error(`Font style index failed: ${error.message}`);
        process.exitCode = 1;
        return null;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
