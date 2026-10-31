// JSON Schema fragments published by tools/list. Data tools advertise an
// outputSchema so a client can validate or read structuredContent directly.
import { FORMATS } from "./constants.js";

export const FONT_SUMMARY_SCHEMA = {
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

export const FONT_RECORD_SCHEMA = {
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

export const PAGE_SCHEMA = {
    type: "object",
    properties: { total: { type: "integer" }, fonts: { type: "array", items: FONT_SUMMARY_SCHEMA } },
    required: ["total", "fonts"],
};

export const OUTPUT_SCHEMAS = {
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
