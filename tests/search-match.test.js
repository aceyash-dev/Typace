import test from "node:test";
import assert from "node:assert/strict";
import { normalize as clientNormalize, matchesTerms as clientMatches } from "../src/lib/fonts.js";
import { normalize as apiNormalize, matchesTerms as apiMatches } from "../api/_lib/fonts.js";

// The browse filter and /api/search must answer the same question the same way.
// They drifted once: the client only lowercased, so "open sans" matched nothing
// in the browser while the API returned the font.
const SAMPLES = [
    "Open-Sans",
    "open sans",
    "Open  Sans ",
    "Ace Script.otf",
    "Café  Noël.ttf",
    "AGENCYB.TTF",
    "font, with punctuation!",
    "",
];

test("client and API normalisers agree on the same input", () => {
    for (const sample of SAMPLES) {
        assert.equal(clientNormalize(sample), apiNormalize(sample), `normalisers disagree for ${JSON.stringify(sample)}`);
    }
});

test("a query with spaces, hyphens or stray punctuation still matches", () => {
    const font = { name: "Open Sans", file: "Open-Sans.ttf", type: "ttf", format: "truetype" };
    for (const query of ["open sans", "open-sans", "  Open   Sans  ", "open s"]) {
        const terms = clientNormalize(query).split("-").filter(Boolean);
        assert.equal(clientMatches(font, terms), true, `client missed ${JSON.stringify(query)}`);
        assert.equal(apiMatches(font, terms), true, `api missed ${JSON.stringify(query)}`);
    }
});

test("an unrelated query matches on neither surface", () => {
    const font = { name: "Aboreto", file: "Aboreto.ttf", type: "ttf", format: "truetype" };
    const terms = clientNormalize("comic").split("-").filter(Boolean);
    assert.equal(clientMatches(font, terms), false);
    assert.equal(apiMatches(font, terms), false);
});

test("an empty query matches everything on both surfaces", () => {
    const font = { name: "Aboreto", file: "Aboreto.ttf", type: "ttf", format: "truetype" };
    const terms = clientNormalize("").split("-").filter(Boolean);
    assert.deepEqual(terms, []);
    assert.equal(clientMatches(font, terms), true);
    assert.equal(apiMatches(font, terms), true);
});
