export default function handler(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400");

    return res.status(200).json({
        openapi: "3.0.3",
        info: {
            title: "Typace API",
            version: "1.1.0",
            description: "Public font discovery, search, metadata, and CSS delivery API. Font records only expose verified metadata; unavailable classifications and dates are returned as null or unknown rather than guessed."
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
                        name: { type: "string", description: "Display name derived from the asset filename." },
                        file: { type: "string", description: "Repository-relative asset path." },
                        type: { type: "string", enum: ["ttf", "otf", "woff", "woff2"] },
                        format: { type: "string", enum: ["truetype", "opentype", "woff", "woff2"] },
                        category: { type: "string", enum: ["serif", "sans-serif", "unknown"], description: "Only classified from supported font metadata. unknown means the file did not provide enough reliable metadata." },
                        url: { type: "string", format: "uri-reference", description: "Path to the published font asset." },
                        createdAt: { type: "string", format: "date-time", nullable: true, description: "Null when a reliable source creation date is unavailable." },
                        updatedAt: { type: "string", format: "date-time", nullable: true, description: "Null when a reliable source modification date is unavailable." }
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
                    summary: "List published fonts",
                    responses: {
                        "200": { description: "Current catalog", content: { "application/json": { schema: { type: "array", items: { "$ref": "#/components/schemas/Font" } } } } },
                        "500": { description: "Catalog could not be read", content: { "application/json": { schema: { "$ref": "#/components/schemas/Error" } } } }
                    }
                }
            },
            "/api/fonts/{slug}": {
                get: {
                    tags: ["Catalog"],
                    summary: "Get one font by slug",
                    parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
                    responses: {
                        "200": { description: "Font metadata", content: { "application/json": { schema: { "$ref": "#/components/schemas/Font" } } } },
                        "404": { description: "Font not found", content: { "application/json": { schema: { "$ref": "#/components/schemas/Error" } } } }
                    }
                }
            },
            "/api/search": {
                get: {
                    tags: ["Search"],
                    summary: "Search the font catalog",
                    parameters: [{ name: "q", in: "query", description: "Search terms; terms are matched against name, path, type, and format.", schema: { type: "string" } }],
                    responses: {
                        "200": { description: "Matching fonts, or the full catalog when q is omitted", content: { "application/json": { schema: { type: "array", items: { "$ref": "#/components/schemas/Font" } } } } },
                        "500": { description: "Search failed", content: { "application/json": { schema: { "$ref": "#/components/schemas/Error" } } } }
                    }
                }
            },
            "/api/css/{slug}": {
                get: {
                    tags: ["CSS"],
                    summary: "Generate @font-face CSS",
                    parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
                    responses: {
                        "200": { description: "Generated CSS", content: { "text/css": { schema: { type: "string" } } } },
                        "404": { description: "Font not found", content: { "application/json": { schema: { "$ref": "#/components/schemas/Error" } } }
                    }
                }
            },
            "/api/openapi.json": {
                get: {
                    summary: "Get this OpenAPI specification",
                    responses: { "200": { description: "OpenAPI 3.0.3 document", content: { "application/json": { schema: { type: "object" } } } }
                }
            }
        }
    });
}
