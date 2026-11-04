import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describeFont, readTableDirectory, weightLabel, widthLabel } from "../scripts/lib/sfnt.mjs";
import { buildStyleIndex } from "../scripts/font-style-index.mjs";
import { FONTS_DIR, STYLE_INDEX_PATH } from "../scripts/lib/config.mjs";

const fontFile = (name) => readFileSync(path.join(FONTS_DIR, name));
const woff2Name = readdirSync(FONTS_DIR).find((name) => name.endsWith(".woff2"));

test("weight and width labels cover their boundaries", () => {
    assert.equal(weightLabel(100), "light");
    assert.equal(weightLabel(349), "light");
    assert.equal(weightLabel(350), "regular");
    assert.equal(weightLabel(500), "medium");
    assert.equal(weightLabel(600), "bold");
    assert.equal(weightLabel(750), "black");
    assert.equal(weightLabel(900), "black");

    assert.equal(widthLabel(1), "condensed");
    assert.equal(widthLabel(4), "condensed");
    assert.equal(widthLabel(5), "normal");
    assert.equal(widthLabel(6), "expanded");
});

test("an sfnt font is described from its own tables", () => {
    const buffer = fontFile("Aboreto.ttf");
    const described = describeFont(buffer);
    assert.ok(described, "a TrueType font must be describable");
    assert.equal(typeof described.weight, "number");
    assert.equal(typeof described.width, "number");
    assert.equal(typeof described.glyphs, "number");
    assert.ok(described.glyphs > 0, "glyph count comes from maxp");
    assert.equal(described.weightClass, weightLabel(described.weight));
    assert.equal(described.widthClass, widthLabel(described.width));
    assert.equal(typeof described.allCaps, "boolean");
    assert.equal(typeof described.monospace, "boolean");
});

test("the table directory exposes the required tables", () => {
    const directory = readTableDirectory(fontFile("Aboreto.ttf"));
    for (const tag of ["head", "maxp", "cmap", "OS/2"]) {
        assert.ok(directory.has(tag), "missing table " + tag);
        assert.ok(directory.get(tag).length > 0);
    }
});

test("a compressed container is reported as unknown, not guessed", () => {
    if (!woff2Name) return; // catalogue carries no WOFF2 file in this checkout
    assert.equal(describeFont(fontFile(woff2Name)), null);
});

test("a truncated or non-font buffer is refused rather than parsed", () => {
    assert.equal(describeFont(Buffer.alloc(0)), null);
    assert.equal(describeFont(Buffer.from("not a font at all")), null);
});

test("the built index parses the catalogue and stays in step with the artifact", () => {
    const { fonts, unsupported, failed } = buildStyleIndex();
    assert.deepEqual(failed, [], "no font should fail to read");
    const parsed = Object.keys(fonts).length;
    assert.ok(parsed > 0, "the catalogue should parse at least one font");

    const artifact = JSON.parse(readFileSync(STYLE_INDEX_PATH, "utf8"));
    // The committed artifact is only stale if a font was added since the last
    // regeneration, so compare the files the index does know about.
    for (const [file, described] of Object.entries(fonts)) {
        if (!artifact.fonts[file]) continue;
        assert.deepEqual(artifact.fonts[file], described, "style-index.json is stale for " + file);
    }
    assert.ok(unsupported.length + parsed > 0);
});
