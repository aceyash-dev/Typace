export default function handler(req, res) {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({
        openapi: "3.0.3",
        info: { title: "Typace API", version: "1.0.0", description: "Dynamic font discovery and metadata API for Typace." },
        servers: [{ url: "https://typace.ace-base.cc" }],
        components: { schemas: { Font: { type: "object", properties: { name: { type: "string" }, file: { type: "string" }, type: { type: "string" }, format: { type: "string" }, url: { type: "string" }, createdAt: { type: "string", format: "date-time", nullable: true }, updatedAt: { type: "string", format: "date-time", nullable: true } } } } },
        paths: {
            "/api/fonts": { get: { summary: "List all fonts", responses: { "200": { description: "Dynamic font catalog", content: { "application/json": { schema: { type: "array", items: { "$ref": "#/components/schemas/Font" } } } } } } } },
            "/api/fonts/{slug}": { get: { summary: "Get one font", parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Font metadata", content: { "application/json": { schema: { "$ref": "#/components/schemas/Font" } } } }, "404": { description: "Font not found" } } } },
            "/api/search": { get: { summary: "Search fonts", parameters: [{ name: "q", in: "query", schema: { type: "string" } }], responses: { "200": { description: "Matching font records" } } } },
            "/api/css/{slug}": { get: { summary: "Generate @font-face CSS", parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Generated CSS", content: { "text/css": { schema: { type: "string" } } } } } } }
        }
    });
}
