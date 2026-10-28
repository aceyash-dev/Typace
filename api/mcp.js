import { enforceRateLimit } from "./_lib/rate-limit.js";
import {
    listFonts, findFont, normalize, fontSlug, fontFaceCss, fontFileUrl, selectFields,
} from "./_lib/fonts.js";
import { API_VERSION } from "./_lib/respond.js";

// Stateless Streamable HTTP MCP endpoint. One JSON-RPC message per POST and a
// JSON response — no session, no server-initiated SSE. Vercel may serve each
// request from a different instance, so there is nothing safe to keep between
// calls, and a client that has to hold a session id would break on scale-out.

const LATEST_PROTOCOL = "2025-06-18";
const SUPPORTED_PROTOCOLS = new Set([LATEST_PROTOCOL, "2025-03-26"]);
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const FORMATS = ["ttf", "otf", "woff", "woff2"];

const LICENCE =
    "Typace delivers the font file but does not change its licence. Check the licence " +
    "attached to each typeface before embedding, modifying, redistributing, or bundling it.";

const INSTRUCTIONS =
    "Typace is a font catalogue. Search or list typefaces, then fetch a font's @font-face " +
    "rule or file URL. Prefer get_font_css when the user wants to use a font. " + LICENCE;

const TOOLS = [
    {
        name: "search_fonts",
        title: "Search fonts",
        description: "Find typefaces by name, file, or format. Prefix matching, so 'grot' finds 'Space Grotesk'.",
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string", description: "Search text, e.g. 'grotesk' or 'script'." },
                format: { type: "string", enum: FORMATS, description: "Restrict to one file format." },
                limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT },
                offset: { type: "integer", minimum: 0 },
            },
            required: ["query"],
        },
    },
    {
        name: "list_fonts",
        title: "List fonts",
        description: "Page through the whole catalogue, optionally filtered by file format.",
        inputSchema: {
            type: "object",
            properties: {
                format: { type: "string", enum: FORMATS },
                limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT },
                offset: { type: "integer", minimum: 0 },
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

const FONT_SUMMARY_SCHEMA = {
    type: "object",
    properties: {
        name: { type: "string" },
        type: { type: "string", enum: FORMATS },
        format: { type: "string" },
        url: { type: "string" },
        sizeBytes: { type: ["integer", "null"] },
        isNew: { type: "boolean" },
    },
    required: ["name", "url"],
};

const FONT_RECORD_SCHEMA = {
    type: "object",
    properties: {
        name: { type: "string" },
        file: { type: "string" },
        type: { type: "string", enum: FORMATS },
        format: { type: "string" },
        url: { type: "string" },
        sizeBytes: { type: ["integer", "null"] },
        createdAt: { type: ["string", "null"] },
        updatedAt: { type: ["string", "null"] },
        isNew: { type: "boolean" },
    },
    required: ["name", "file", "url"],
};

const PAGE_SCHEMA = {
    type: "object",
    properties: { total: { type: "integer" }, fonts: { type: "array", items: FONT_SUMMARY_SCHEMA } },
    required: ["total", "fonts"],
};

const OUTPUT_SCHEMAS = {
    search_fonts: PAGE_SCHEMA,
    list_fonts: PAGE_SCHEMA,
    get_font: FONT_RECORD_SCHEMA,
    list_formats: { type: "object", additionalProperties: { type: "integer" } },
    catalog_health: {
        type: "object",
        properties: {
            status: { type: "string" },
            count: { type: "integer" },
            formats: { type: "object", additionalProperties: { type: "integer" } },
            apiVersion: { type: "string" },
        },
        required: ["status", "count"],
    },
};

// Every tool here only reads. Saying so lets a client auto-approve the call.
for (const tool of TOOLS) {
    tool.annotations = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };
    if (OUTPUT_SCHEMAS[tool.name]) tool.outputSchema = OUTPUT_SCHEMAS[tool.name];
}

const PROMPTS = [
    {
        name: "pick-a-font",
        title: "Pick a font",
        description: "Choose typefaces for a design brief and return them with CSS.",
        arguments: [{ name: "brief", description: "What the font is for, e.g. 'warm serif for a bakery site'.", required: true }],
    },
];

// ------------------------------------------------------------------ helpers

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

function clamp(value, fallback, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(1, Math.trunc(number)));
}

/** Tool results use absolute URLs: an agent has no origin to resolve against. */
function absolute(font) {
    return { ...font, url: fontFileUrl(font) };
}

function summarise(font) {
    return selectFields([absolute(font)], ["name", "type", "format", "url", "sizeBytes", "isNew"])[0];
}

function matches(font, terms) {
    const tokens = normalize(`${font.name} ${font.file} ${font.type} ${font.format}`).split("-").filter(Boolean);
    return terms.every((term) => tokens.some((token) => token.startsWith(term)));
}

function requireSlug(args) {
    const slug = String(args?.slug || "").trim();
    if (!slug) throw new Error("A 'slug' argument is required.");
    return slug;
}

function formatCounts(fonts) {
    const counts = {};
    for (const format of FORMATS) counts[format] = 0;
    for (const font of fonts) counts[font.type] = (counts[font.type] || 0) + 1;
    return counts;
}

// ------------------------------------------------------------------ tools

async function callTool(name, args = {}) {
    switch (name) {
        case "search_fonts": {
            const terms = normalize(String(args.query || "")).split("-").filter(Boolean);
            if (!terms.length) return json({ total: 0, fonts: [] });
            const format = args.format ? String(args.format).toLowerCase() : "";
            if (format && !FORMATS.includes(format)) return failure(`Unknown format '${format}'. Use one of: ${FORMATS.join(", ")}.`);
            const found = (await listFonts())
                .filter((font) => (!format || font.type === format) && matches(font, terms));
            const limit = clamp(args.limit, DEFAULT_LIMIT, MAX_LIMIT);
            const offset = Math.max(0, Math.trunc(Number(args.offset) || 0));
            return json({ total: found.length, fonts: found.slice(offset, offset + limit).map(summarise) });
        }

        case "list_fonts": {
            const format = args.format ? String(args.format).toLowerCase() : "";
            if (format && !FORMATS.includes(format)) return failure(`Unknown format '${format}'. Use one of: ${FORMATS.join(", ")}.`);
            const all = await listFonts();
            const found = format ? all.filter((font) => font.type === format) : all;
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
            return json({ status: fonts.length ? "ok" : "degraded", count: fonts.length, formats: formatCounts(fonts), apiVersion: API_VERSION });
        }

        default:
            return null;
    }
}

// ------------------------------------------------------------------ resources

function resourceList() {
    return [
        { uri: "typace://catalog", name: "Typace catalog", description: "Every published font record.", mimeType: "application/json" },
        { uri: "typace://formats", name: "Format counts", description: "Published fonts per file format.", mimeType: "application/json" },
    ];
}

async function readResource(uri) {
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

// ------------------------------------------------------------------ dispatch

const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const err = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function dispatch(message) {
    if (!message || typeof message !== "object" || Array.isArray(message)) return err(null, -32600, "Invalid Request");
    const { id = null, method, params } = message;
    if (typeof method !== "string") return err(id, -32600, "Invalid Request");

    try {
        switch (method) {
            case "initialize": {
                const requested = params?.protocolVersion;
                return ok(id, {
                    protocolVersion: SUPPORTED_PROTOCOLS.has(requested) ? requested : LATEST_PROTOCOL,
                    capabilities: {
                        tools: { listChanged: false },
                        resources: { subscribe: false, listChanged: false },
                        prompts: { listChanged: false },
                        completions: {},
                        logging: {},
                    },
                    serverInfo: { name: "typace", title: "Typace", version: API_VERSION },
                    instructions: INSTRUCTIONS,
                });
            }
            case "ping":
                return ok(id, {});
            case "tools/list":
                return ok(id, { tools: TOOLS });
            case "tools/call": {
                const name = params?.name;
                const result = await callTool(name, params?.arguments || {});
                if (!result) return err(id, -32602, `Unknown tool: ${name}`);
                return ok(id, result);
            }
            case "resources/list":
                return ok(id, { resources: resourceList() });
            case "resources/templates/list":
                return ok(id, {
                    resourceTemplates: [
                        { uriTemplate: "typace://fonts/{slug}", name: "Font record", mimeType: "application/json" },
                        { uriTemplate: "typace://font/{slug}.css", name: "Font @font-face rule", mimeType: "text/css" },
                    ],
                });
            case "resources/read":
                return ok(id, await readResource(String(params?.uri || "")));
            case "prompts/list":
                return ok(id, { prompts: PROMPTS });
            case "logging/setLevel":
                // Accepted for compatibility; the server does not emit log messages.
                return ok(id, {});
            case "completion/complete": {
                const argument = params?.argument || {};
                if (argument.name !== "slug") return ok(id, { completion: { values: [], total: 0, hasMore: false } });
                const prefix = String(argument.value || "").toLowerCase();
                const slugs = [...new Set((await listFonts()).map((font) => fontSlug(font.name)))].sort();
                const values = slugs.filter((slug) => slug.startsWith(prefix)).slice(0, 100);
                return ok(id, { completion: { values, total: values.length, hasMore: values.length === 100 } });
            }
            case "prompts/get": {
                if (params?.name !== "pick-a-font") return err(id, -32602, `Unknown prompt: ${params?.name}`);
                const brief = String(params?.arguments?.brief || "").trim();
                if (!brief) return err(id, -32602, "The 'brief' argument is required.");
                return ok(id, {
                    description: "Pick typefaces for a brief",
                    messages: [{
                        role: "user",
                        content: {
                            type: "text",
                            text: `Pick three typefaces from Typace for this brief: "${brief}".\n\n` +
                                "Call search_fonts with a few different keywords, compare the results, and return " +
                                "the three best matches with their name, format, and get_font_css output. " +
                                "If nothing fits, say so rather than choosing something unsuitable.\n\n" + LICENCE,
                        },
                    }],
                });
            }
            default:
                return err(id, -32601, `Method not found: ${method}`);
        }
    } catch (error) {
        console.error("Typace MCP dispatch failed:", error);
        return err(id, -32603, error?.message || "Internal error");
    }
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type, MCP-Protocol-Version, Mcp-Session-Id");
    res.setHeader("Access-Control-Expose-Headers", "RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After, X-API-Version, X-Request-Id");
    res.setHeader("Access-Control-Max-Age", "86400");
    res.setHeader("X-API-Version", API_VERSION);
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (req.method === "OPTIONS") {
        res.setHeader("Cache-Control", "no-store");
        return res.status(204).end();
    }
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST, OPTIONS");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.status(405).json({ error: "Method not allowed. MCP uses POST.", code: "METHOD_NOT_ALLOWED" });
    }
    if (!(await enforceRateLimit(req, res, { scope: "mcp", methods: "POST, OPTIONS" }))) return;
    // RPC responses are never cacheable; the payload changes per call.
    res.setHeader("Cache-Control", "no-store");

    let payload = req.body;
    if (typeof payload === "string") {
        try { payload = JSON.parse(payload); }
        catch { return respond(res, err(null, -32700, "Parse error")); }
    }
    if (payload === undefined || payload === null) return respond(res, err(null, -32600, "Invalid Request"));

    const declared = String(req.headers?.["mcp-protocol-version"] || "").trim();
    if (declared && !SUPPORTED_PROTOCOLS.has(declared)) {
        return respond(res, err(null, -32600,
            `Unsupported MCP protocol version: ${declared}. Supported: ${[...SUPPORTED_PROTOCOLS].join(", ")}.`));
    }

    // Notifications carry no id and must not receive a JSON-RPC response.
    if (!Array.isArray(payload) && payload.id === undefined) {
        await dispatch(payload).catch(() => {});
        return res.status(202).end();
    }

    const body = Array.isArray(payload)
        ? await Promise.all(payload.map((message) => dispatch(message)))
        : await dispatch(payload);
    return respond(res, body);
}

function respond(res, body) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    // res.json serialises identically to JSON.stringify, and keeps the payload
    // data-shaped for callers rather than a pre-serialised string.
    return res.status(200).json(body);
}
