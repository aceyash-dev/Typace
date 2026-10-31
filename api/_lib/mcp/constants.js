// Shared constants for the MCP endpoint. Kept apart from the registries so the
// protocol version and the licence wording change in exactly one place.

export const LATEST_PROTOCOL = "2025-06-18";
export const SUPPORTED_PROTOCOLS = new Set([LATEST_PROTOCOL, "2025-03-26"]);

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

export const FORMATS = ["ttf", "otf", "woff", "woff2"];

export const LICENCE =
    "Typace delivers the font file but does not change its licence. Check the licence " +
    "attached to each typeface before embedding, modifying, redistributing, or bundling it.";

export const INSTRUCTIONS =
    "Typace is a font catalogue. Search or list typefaces, then fetch a font's @font-face " +
    "rule or file URL. Prefer get_font_css when the user wants to use a font. " + LICENCE;
