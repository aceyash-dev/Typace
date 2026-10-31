import { enforceRateLimit } from "./_lib/rate-limit.js";
import { KEYLESS_PROVIDER_IDS } from "./image.js";
export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Expose-Headers", "RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After, X-API-Version");
    res.setHeader("X-API-Version", "1.1.0");    res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method === "OPTIONS") {
        res.setHeader("Cache-Control", "no-store");
        return res.status(204).end();
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.setHeader("Allow", "GET, HEAD, OPTIONS");
        res.setHeader("Cache-Control", "no-store");
        return res.status(405).json({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
    }
    if (!(await enforceRateLimit(req, res))) return;

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400");

    const fontRef = { "$ref": "#/components/schemas/Font" };
    const errorRef = { "$ref": "#/components/schemas/Error" };
    const ok = (description, schema, contentType = "application/json") => ({
        description,
        content: { [contentType]: { schema } }
    });

    return res.status(200).json({
        openapi: "3.0.3",
        info: {
            title: "Typace API",
            version: "1.1.0",
            description: "Public font discovery, search, metadata, and CSS delivery API. Unknown classifications and unavailable source dates are not guessed. API requests are limited to 60 per minute per IP by default and MCP requests to 120 (TYPACE_RATE_LIMIT and TYPACE_MCP_RATE_LIMIT); excess requests return HTTP 429 with Retry-After. A shared KV store makes the quota global across instances, otherwise it is per-instance."
        },
        servers: [{ url: "https://typace.ace-base.cc", description: "Production API" }],
        externalDocs: { description: "AI and machine-client guide", url: "https://typace.ace-base.cc/llms-full.txt" },
        tags: [
            { name: "Catalog", description: "Discover published font assets." },
            { name: "Search", description: "Search the current font catalog." },
            { name: "CSS", description: "Generate web font CSS for a published font." },
            { name: "Assets", description: "Proxy supported image assets." },
            { name: "Pages", description: "HTML discovery and documentation pages." }
        ],
        components: {
            schemas: {
                Font: {
                    type: "object",
                    required: ["name", "file", "type", "format", "url", "createdAt", "updatedAt"],
                    properties: {
                        name: { type: "string" },
                        file: { type: "string" },
                        type: { type: "string", enum: ["ttf", "otf", "woff", "woff2"] },
                        format: { type: "string", enum: ["truetype", "opentype", "woff", "woff2"] },
                        sizeBytes: { type: "integer", minimum: 0, nullable: true, description: "Font file size in bytes when the filesystem stat succeeds." },
                        url: { type: "string", format: "uri-reference" },
                        createdAt: { type: "string", format: "date-time", nullable: true },
                        updatedAt: { type: "string", format: "date-time", nullable: true },
                        isNew: { type: "boolean", description: "True only for files in the current recently added batch." }
                    }
                },
                Commit: {
                    type: "object",
                    required: ["sha", "shortSha", "message", "date", "source"],
                    properties: {
                        sha: { type: "string", pattern: "^[a-fA-F0-9]{7,40}$" },
                        shortSha: { type: "string", minLength: 7, maxLength: 7 },
                        message: { type: "string", maxLength: 200 },
                        date: { type: "string", format: "date-time", nullable: true },

                        source: { type: "string", enum: ["deployment", "github"] }
                    }
                },
                Health: {
                    type: "object",
                    required: ["status", "service", "apiVersion"],
                    properties: {
                        status: { type: "string", enum: ["ok", "degraded"] },
                        service: { type: "string", example: "typace-api" },
                        apiVersion: { type: "string", example: "1.1.0" },
                        checkedAt: { type: "string", format: "date-time" },
                        catalog: {
                            type: "object",
                            properties: {
                                status: { type: "string", enum: ["ok", "degraded"] },
                                count: { type: "integer", minimum: 0 },
                                ageSeconds: { type: "integer", minimum: 0, nullable: true },
                                stale: { type: "boolean" },
                                issue: { type: "string", nullable: true }
                            }
                        },
                        links: { type: "object", additionalProperties: { type: "string" } },
                        error: { type: "string" },
                        code: { type: "string" }
                    }
                },
                Error: {
                    type: "object",
                    required: ["error"],
                    properties: {
                        error: { type: "string" },
                        code: { type: "string" },
                        allowed: { type: "array", items: { type: "string", enum: ["ttf", "otf", "woff", "woff2"] } }
                    }
                }
            }
        },
        paths: {
            "/api/health": {
                get: {
                    tags: ["Catalog"],
                    operationId: "getHealth",
                    summary: "Check API and font catalog availability",
                    responses: {
                        "200": ok("API and catalog are available", { "$ref": "#/components/schemas/Health" }),
                        "405": ok("Method not allowed", errorRef),
                        "429": ok("Rate limit exceeded", errorRef),
                        "503": ok("Catalog is unavailable", { "$ref": "#/components/schemas/Health" })
                    }
                }
            },
            "/api/image": {
                get: {
                    tags: ["Assets"],
                    operationId: "getThemeImage",
                    summary: "Proxy a random image for palette extraction",
                    description: "Fetches a random image from one of several free, keyless providers server-side and returns it same-origin. This exists because a browser can only read pixels from a CORS-enabled image. The response reports the winning source in X-Image-Provider, and returns 502 IMAGE_UNAVAILABLE when no provider is reachable.",
                    parameters: [
                        { name: "seed", in: "query", description: "Stable seed selecting the image.", schema: { type: "string" } },
                        { name: "provider", in: "query", description: "Optional first-choice provider; failures still fall back to the others.", schema: { type: "string", enum: [...KEYLESS_PROVIDER_IDS] } }
                    ],
                    responses: {
                        "200": { description: "Image bytes, with an image/* content type." },
                        "429": ok("Rate limit exceeded", errorRef),
                        "502": ok("No image provider available", errorRef)
                    }
                }
            },
            "/api/font": {
                get: {
                    tags: ["Catalog"],
                    operationId: "getFontAlias",
                    summary: "Get font metadata using the singular route alias",
                    parameters: [{ name: "slug", in: "query", description: "Font name or slug.", schema: { type: "string" } }],
                    responses: {
                        "200": ok("Font metadata", fontRef),
                        "404": ok("Font not found", errorRef),
                        "429": ok("Rate limit exceeded", errorRef),
                        "500": ok("Font lookup failed", errorRef)
                    }
                }
            },
            "/api/formats": {
                get: {
                    tags: ["Pages"],
                    operationId: "getFormatsPage",
                    summary: "Render the HTML font-format directory",
                    parameters: [{ name: "slug", in: "query", description: "Optional format slug for a detail page.", schema: { type: "string", enum: ["ttf", "otf", "woff", "woff2"] } }],
                    responses: {
                        "200": { description: "HTML format directory or format detail page.", content: { "text/html": { schema: { type: "string" } } } },
                        "404": { description: "Format not found" },
                        "405": ok("Method not allowed", errorRef),
                        "429": ok("Rate limit exceeded", errorRef),
                        "500": ok("Catalog unavailable", errorRef)
                    }
                }
            },
            "/api/faq": {
                get: {
                    tags: ["Pages"],
                    operationId: "getFaqPage",
                    summary: "Render the HTML FAQ and structured data",
                    responses: { "200": { description: "HTML FAQ page.", content: { "text/html": { schema: { type: "string" } } } } }
                }
            },
            "/api/sitemap": {
                get: {
                    tags: ["Pages"],
                    operationId: "getSitemap",
                    summary: "Return the XML sitemap",
                    responses: { "200": { description: "XML sitemap.", content: { "application/xml": { schema: { type: "string" } } } } }
                }
            },
            "/api/fonts": {
                get: {
                    tags: ["Catalog"],
                    operationId: "listFonts",
                    summary: "List published fonts",
                    description: "Returns the current authoritative catalog as a JSON array. Supports optional filtering and pagination. Responses carry a weak ETag — send it back as If-None-Match to receive 304. The X-Total-Count header reports how many fonts match the filters.",
                    parameters: [
                        { name: "format", in: "query", description: "Filter by file format.", schema: { type: "string", enum: ["ttf", "otf", "woff", "woff2"] } },
                        { name: "limit", in: "query", description: "Maximum records to return (1-500).", schema: { type: "integer", minimum: 1, maximum: 500 } },
                        { name: "offset", in: "query", description: "Number of records to skip.", schema: { type: "integer", minimum: 0 } },
                        { name: "fields", in: "query", description: "Comma-separated subset of record fields to return. Unknown names are rejected with INVALID_FIELDS.", schema: { type: "string" } },
                        { name: "slugs", in: "query", description: "Comma-separated batch lookup (max 25), resolved in request order with null for misses. Takes precedence over format, limit, and offset.", schema: { type: "string" } }
                    ],
                    responses: {
                        "200": ok("Current catalog", { type: "array", items: { ...fontRef, nullable: true } }),
                        "400": ok("Invalid format, field, or slug list", errorRef),
                        "304": { description: "Not modified — the client's cached copy is still valid." },
                        "429": ok("Rate limit exceeded", errorRef),
                        "500": ok("Catalog could not be read", errorRef)
                    }
                }
            },
            "/api/fonts/{slug}": {
                get: {
                    tags: ["Catalog"],
                    operationId: "getFont",
                    summary: "Get one font by slug",
                    parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
                    responses: {
                        "200": ok("Font metadata", fontRef),
                        "404": ok("Font not found", errorRef),
                        "429": ok("Rate limit exceeded", errorRef),
                        "500": ok("Font lookup failed", errorRef)
                    }
                }
            },
            "/api/search": {
                get: {
                    tags: ["Search"],
                    operationId: "searchFonts",
                    summary: "Search the font catalog",
                    description: "Returns a JSON array; q is capped at 200 characters and matching uses token prefixes. Omit q to return the catalog.",
                    parameters: [
                        { name: "q", in: "query", description: "Search terms matched against name, path, type, and format. Omit to return the full catalog.", schema: { type: "string" } },
                        { name: "fields", in: "query", description: "Comma-separated subset of record fields to return.", schema: { type: "string" } }
                    ],
                    responses: {
                        "200": ok("Matching font records", { type: "array", items: fontRef }),
                        "429": ok("Rate limit exceeded", errorRef),
                        "500": ok("Search failed", errorRef)
                    }
                }
            },
            "/api/css/{slug}": {
                get: {
                    tags: ["CSS"],
                    operationId: "getFontCss",
                    summary: "Generate @font-face CSS",
                    parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
                    responses: {
                        "200": ok("Generated CSS", { type: "string" }, "text/css"),
                        "404": ok("Font not found", errorRef),
                        "429": ok("Rate limit exceeded", errorRef),
                        "500": ok("CSS generation failed", errorRef)
                    }
                }
            },
            "/api/commit": {
                get: {
                    tags: ["Catalog"],
                    operationId: "getCurrentCommit",
                    summary: "Get current deployment commit metadata",
                    description: "Returns the deployed commit identifier, message, timestamp, and metadata source. Repository URLs are intentionally omitted because the source repository is private.",
                    responses: {
                        "200": {
                            description: "Current or latest source commit metadata",
                            content: { "application/json": { schema: { "$ref": "#/components/schemas/Commit" } } }
                        },
                        "405": { description: "Method not allowed" },
                        "429": ok("Rate limit exceeded", errorRef),
                        "502": { description: "Commit metadata could not be resolved", content: { "application/json": { schema: { "$ref": "#/components/schemas/Error" } } } }
                    }
                }
            },
            "/api/mcp": {
                post: {
                    tags: ["MCP"],
                    operationId: "mcp",
                    summary: "Model Context Protocol endpoint",
                    description: "Stateless Streamable HTTP MCP server speaking JSON-RPC 2.0. One message per POST, JSON response, no session id. Exposes read-only tools (search_fonts, list_fonts, get_font, get_font_css, list_formats, catalog_health), resources (typace://catalog, typace://fonts/{slug}, typace://font/{slug}.css), and a pick-a-font prompt. Never exposes the commit endpoint or any write operation.",
                    requestBody: {
                        required: true,
                        content: { "application/json": { schema: { type: "object", description: "A JSON-RPC 2.0 request or notification." } } }
                    },
                    responses: {
                        "200": { description: "JSON-RPC response. Notifications receive 202 with no body." },
                        "202": { description: "Notification accepted; no response body." },
                        "405": ok("Only POST is supported", errorRef),
                        "429": ok("Rate limit exceeded", errorRef)
                    }
                }
            },
            "/api/openapi.json": {
                get: {
                    operationId: "getOpenApi",
                    summary: "Get this OpenAPI specification",
                    responses: {
                        "200": ok("OpenAPI 3.0.3 document", { type: "object" })
                    }
                }
            }
        }
    });
}
