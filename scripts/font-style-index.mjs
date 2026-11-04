#!/usr/bin/env node
/**
 * Build fonts/style-index.json from the font binaries.
 *
 * "Searchable by feel" needs attributes the catalogue does not have: there is no
 * designer, foundry, or category metadata, and guessing a category from PANOSE
 * proved unreliable. What a font *is* can still be read from its own tables —
 * weight, width, italic, monospace and case coverage are declared by the file,
 * not inferred from its name.
 *
 * The sfnt parsing lives in scripts/lib/sfnt.mjs so it can be tested directly;
 * this file only walks fonts/, builds the payload and writes it.
 *
 * No dependencies. Paths come from scripts/lib/config.mjs, so the script runs
 * from any working directory (FONTS_DIR / STYLE_INDEX_OUT override them).
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { writeArtifact } from "./lib/artifact.mjs";
import { FONTS_DIR, STYLE_INDEX_NOTE, STYLE_INDEX_PATH, listFontFilesSync } from "./lib/config.mjs";
import { describeFont } from "./lib/sfnt.mjs";

/**
 * @returns {{fonts: Record<string, object>, unsupported: string[], failed: {file: string, error: string}[]}}
 */
export function buildStyleIndex(directory = FONTS_DIR) {
    const files = listFontFilesSync(readdirSync, directory);
    const fonts = {};
    const unsupported = [];
    const failed = [];

    for (const file of files) {
        let described = null;
        try {
            described = describeFont(readFileSync(path.join(directory, file)));
        } catch (error) {
            // A read or parse failure is not the same thing as a container we
            // cannot decode: say so instead of filing both under "unsupported".
            failed.push({ file, error: String(error && error.message ? error.message : error) });
            console.warn(`Could not read ${file}: ${error && error.message ? error.message : error}`);
            continue;
        }
        if (described) fonts[file] = described;
        else unsupported.push(file);
    }

    return { fonts, unsupported, failed };
}

function main() {
    let listing;
    try {
        listing = buildStyleIndex();
    } catch (error) {
        console.error(`Could not scan ${FONTS_DIR}: ${error && error.message ? error.message : error}`);
        process.exitCode = 1;
        return;
    }

    const { fonts, unsupported, failed } = listing;
    const parsed = Object.keys(fonts).length;

    writeArtifact({
        path: STYLE_INDEX_PATH,
        note: STYLE_INDEX_NOTE,
        content: { fonts, unsupported },
        logCurrent: () => console.log(`fonts/style-index.json already current — ${parsed} fonts.`),
        logWritten: () => {
            console.log(`Wrote fonts/style-index.json — ${parsed} parsed, ${unsupported.length} unsupported.`);
            if (unsupported.length) console.log("unsupported:", unsupported.join(", "));
        }
    });

    // A parser that suddenly parses nothing would otherwise land an empty index
    // and still exit 0, because the write is skipped or trivially succeeds.
    if (parsed === 0) {
        console.error("No font could be parsed; refusing to treat this as success.");
        process.exitCode = 1;
    }
    if (failed.length) {
        console.error(`${failed.length} font(s) could not be read.`);
        process.exitCode = 1;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
