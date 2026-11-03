// Tool registry and implementations. Every tool is read-only and resolves
// in-process through _lib/fonts.js — never over HTTP — so one MCP call costs one
// rate-limit unit rather than two.
import { listFonts, findFont, normalize, matchesTerms, fontFaceCss, fontFileUrl, parseStyleFilters, matchesStyle } from "../fonts.js";
import { API_VERSION } from "../respond.js";
import { FORMATS, DEFAULT_LIMIT, MAX_LIMIT, LICENCE } from "./constants.js";
import { OUTPUT_SCHEMAS } from "./schemas.js";
import { absolute, summarise, formatCounts, clamp } from "./records.js";
import { InvalidParamsError } from "./errors.js";

const text = (value) => ({
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

// Tools that return data also return structuredContent, so a client can read the
// result without parsing the text block.
const json = (value) => ({
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
});

const failure = (message) => ({ content: [{ type: "text", text: message }], isError: true });

function requireSlug(args) {
    const slug = String(args?.slug || "").trim();
    if (!slug) throw new InvalidParamsError("A 'slug' argument is required.");
    return slug;
}

function normaliseFormat(value) {
    const format = value ? String(value).toLowerCase() : "";
    return format && !FORMATS.includes(format) ? { error: `Unknown format '${format}'. Use one of: ${FORMATS.join(", ")}.` } : { format };
}

export const TOOLS = [
    {
        name: "search_fonts",
        title: "Search fonts",
        description: "Find typefaces by name, or filter by measurable style: weight, width, italic, monospace, and uppercase-only. Prefix matching, so 'grot' finds 'Space Grotesk'.",
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string", description: "Search text, e.g. 'grotesk' or 'script'." },
                format: { type: "string", enum: FORMATS, description: "Restrict to one file format." },
                limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT },
                offset: { type: "integer", minimum: 0 },
                weight: { type: "string", enum: ["light", "regular", "medium", "bold", "black"], description: "Declared weight class." },
                width: { type: "string", enum: ["condensed", "normal", "expanded"], description: "Declared width class." },
                italic: { type: "string", enum: ["true", "false"] },
                monospace: { type: "string", enum: ["true", "false"] },
                caps: { type: "string", enum: ["true", "false"], description: "Uppercase only, no lowercase glyphs." },
            },
            required: ["query"],
        },
    },
    {
        name: "list_fonts",
        title: "List fonts",
        description: "Page through the whole catalogue, optionally filtered by file format or measurable style.",
        inputSchema: {
            type: "object",
            properties: {
                format: { type: "string", enum: FORMATS },
                limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT },
                offset: { type: "integer", minimum: 0 },
                weight: { type: "string", enum: ["light", "regular", "medium", "bold", "black"], description: "Declared weight class." },
                width: { type: "string", enum: ["condensed", "normal", "expanded"], description: "Declared width class." },
                italic: { type: "string", enum: ["true", "false"] },
                monospace: { type: "string", enum: ["true", "false"] },
                caps: { type: "string", enum: ["true", "false"], description: "Uppercase only, no lowercase glyphs." },
            },
        },
    },
    {
        name: "get_font",
        title: "Get one font",
        description: "Fetch a single font record by slug or name, e.g. 'space-grotesk'.",
        inputSchema: {
            type: "object",
            properties: { slug: { type: "string", description: "Font slug or display name." } },
            required: ["slug"],
        },
    },
    {
        name: "get_font_css",
        title: "Get @font-face CSS",
        description: "Return the ready-to-paste @font-face rule for a font, plus its absolute file URL.",
        inputSchema: {
            type: "object",
            properties: { slug: { type: "string" } },
            required: ["slug"],
        },
    },
    {
        name: "list_formats",
        title: "List formats",
        description: "Counts of published fonts per file format.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "catalog_health",
        title: "Catalog health",
        description: "Catalogue size, format breakdown, and API version. Use to check the service is reachable.",
        inputSchema: { type: "object", properties: {} },
    },
];

// Every tool here only reads. Saying so lets a client auto-approve the call.
for (const tool of TOOLS) {
    tool.annotations = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };
    if (OUTPUT_SCHEMAS[tool.name]) tool.outputSchema = OUTPUT_SCHEMAS[tool.name];
}

/** Returns null for an unknown tool name. */
export async function callTool(name, args = {}) {
    switch (name) {
        case "search_fonts": {
            const terms = normalize(String(args.query || "")).split("-").filter(Boolean);
            if (!terms.length) return json({ total: 0, fonts: [] });
            const { format, error } = normaliseFormat(args.format);
            if (error) return failure(error);
            const { filters, error: styleError } = parseStyleFilters(args);
            if (styleError) return failure(styleError);
            const found = (await listFonts())
                .filter((font) => (!format || font.type === format) && matchesTerms(font, terms) && matchesStyle(font, filters));
            const limit = clamp(args.limit, DEFAULT_LIMIT, MAX_LIMIT);
            const offset = Math.max(0, Math.trunc(Number(args.offset) || 0));
            return json({ total: found.length, fonts: found.slice(offset, offset + limit).map(summarise) });
        }

        case "list_fonts": {
            const { format, error } = normaliseFormat(args.format);
            if (error) return failure(error);
            const { filters, error: styleError } = parseStyleFilters(args);
            if (styleError) return failure(styleError);
            const all = await listFonts();
            const found = all.filter((font) => (!format || font.type === format) && matchesStyle(font, filters));
            const limit = clamp(args.limit, DEFAULT_LIMIT, MAX_LIMIT);
            const offset = Math.max(0, Math.trunc(Number(args.offset) || 0));
            return json({ total: found.length, fonts: found.slice(offset, offset + limit).map(summarise) });
        }

        case "get_font": {
            const font = findFont(await listFonts(), requireSlug(args));
            if (!font) return failure("No font matches that slug. Use search_fonts to find the right one.");
            return json(absolute(font));
        }

        case "get_font_css": {
            const font = findFont(await listFonts(), requireSlug(args));
            if (!font) return failure("No font matches that slug. Use search_fonts to find the right one.");
            return text(`${fontFaceCss(font)}\n\nFile: ${fontFileUrl(font)}\n\n${LICENCE}`);
        }

        case "list_formats":
            return json(formatCounts(await listFonts()));

        case "catalog_health": {
            const fonts = await listFonts();
            return json({
                status: fonts.length ? "ok" : "degraded",
                count: fonts.length,
                formats: formatCounts(fonts),
                apiVersion: API_VERSION,
            });
        }

        default:
            return null;
    }
}
