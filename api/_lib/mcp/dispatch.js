// JSON-RPC 2.0 dispatch. Pure: given a message, return a response object.
// The HTTP concerns (method guards, body parsing, notifications) live in the
// adapter, so this stays testable without a request object.
import { listFonts, fontSlug } from "../fonts.js";
import { API_VERSION } from "../respond.js";
import { LATEST_PROTOCOL, SUPPORTED_PROTOCOLS, INSTRUCTIONS } from "./constants.js";
import { TOOLS, callTool } from "./tools.js";
import { RESOURCES, RESOURCE_TEMPLATES, readResource } from "./resources.js";
import { PROMPTS, getPrompt } from "./prompts.js";

export const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
export const err = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

export async function dispatch(message) {
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
                const result = await callTool(params?.name, params?.arguments || {});
                if (!result) return err(id, -32602, `Unknown tool: ${params?.name}`);
                return ok(id, result);
            }

            case "resources/list":
                return ok(id, { resources: RESOURCES });

            case "resources/templates/list":
                return ok(id, { resourceTemplates: RESOURCE_TEMPLATES });

            case "resources/read":
                return ok(id, await readResource(String(params?.uri || "")));

            case "prompts/list":
                return ok(id, { prompts: PROMPTS });

            case "prompts/get": {
                const prompt = getPrompt(params?.name, params?.arguments);
                if (!prompt.found) return err(id, -32602, `Unknown prompt: ${params?.name}`);
                if (prompt.error) return err(id, -32602, prompt.error);
                return ok(id, prompt.result);
            }

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

            default:
                return err(id, -32601, `Method not found: ${method}`);
        }
    } catch (error) {
        console.error("Typace MCP dispatch failed:", error);
        return err(id, -32603, error?.message || "Internal error");
    }
}
