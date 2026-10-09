import { enforceRateLimit } from "./_lib/rate-limit.js";
export default function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method === "OPTIONS") {
        res.setHeader("Cache-Control", "no-store");
        return res.status(204).end();
    }
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET, OPTIONS");
        res.setHeader("Cache-Control", "no-store");
        return res.status(405).json({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
    if (!enforceRateLimit(req, res)) return;
    }

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
            description: "Public font discovery, search, metadata, and CSS delivery API. Unknown classifications and unavailable source dates are not guessed. API requests are limited to 10 per minute per IP; excess requests return HTTP 429 with Retry-After."
        },
        servers: [{ url: "https://typace.ace-base.cc" }],
        tags: [
            { name: "Catalog", description: "Discover published font assets." },
            { name: "Search", description: "Search the current font catalog." },
            { name: "CSS", description: "Generate web font CSS for a published font." }
        ],
        components: {
            schemas: {
                Font: {
                    type: "object",
                    required: ["name", "file", "type", "format", "category", "url", "createdAt", "updatedAt"],
                    properties: {
                        name: { type: "string" },
                        file: { type: "string" },
                        type: { type: "string", enum: ["ttf", "otf", "woff", "woff2"] },
                        format: { type: "string", enum: ["truetype", "opentype", "woff", "woff2"] },
                        category: { type: "string", enum: ["serif", "sans-serif", "unknown"] },
                        url: { type: "string", format: "uri-reference" },
                        createdAt: { type: "string", format: "date-time", nullable: true },
                        updatedAt: { type: "string", format: "date-time", nullable: true }
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
                Error: {
                    type: "object",
                    required: ["error"],
                    properties: {
                        error: { type: "string" },
                        code: { type: "string" }
                    }
                }
            }
        },
        paths: {
            "/api/fonts": {
                get: {
                    tags: ["Catalog"],
                    operationId: "listFonts",
                    summary: "List published fonts",
                    responses: {
                        "200": ok("Current catalog", { type: "array", items: fontRef }),
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
                    parameters: [{ name: "q", in: "query", description: "Search terms matched against name, path, type, and format. Omit to return the full catalog.", schema: { type: "string" } }],
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
