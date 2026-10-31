// Resources: the catalogue itself and per-font records/CSS, addressed by URI.
import { listFonts, findFont, fontFaceCss } from "../fonts.js";
import { absolute, formatCounts } from "./records.js";

export const RESOURCES = [
    { uri: "typace://catalog", name: "Typace catalog", description: "Every published font record.", mimeType: "application/json" },
    { uri: "typace://formats", name: "Format counts", description: "Published fonts per file format.", mimeType: "application/json" },
];

export const RESOURCE_TEMPLATES = [
    { uriTemplate: "typace://fonts/{slug}", name: "Font record", mimeType: "application/json" },
    { uriTemplate: "typace://font/{slug}.css", name: "Font @font-face rule", mimeType: "text/css" },
];

/** Throws for an unknown URI; the dispatcher turns that into a JSON-RPC error. */
export async function readResource(uri) {
    const fonts = await listFonts();

    if (uri === "typace://catalog") {
        return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(fonts) }] };
    }
    if (uri === "typace://formats") {
        return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(formatCounts(fonts)) }] };
    }

    const fontMatch = /^typace:\/\/fonts\/(.+)$/.exec(uri);
    if (fontMatch) {
        const font = findFont(fonts, decodeURIComponent(fontMatch[1]));
        if (!font) throw new Error("No font matches that URI.");
        return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(absolute(font)) }] };
    }

    const cssMatch = /^typace:\/\/font\/(.+)\.css$/.exec(uri);
    if (cssMatch) {
        const font = findFont(fonts, decodeURIComponent(cssMatch[1]));
        if (!font) throw new Error("No font matches that URI.");
        return { contents: [{ uri, mimeType: "text/css", text: fontFaceCss(font) }] };
    }

    throw new Error(`Unknown resource: ${uri}`);
}
