import { enforceRateLimit } from "./_lib/rate-limit.js";
import { applyCommonHeaders, sendJSON } from "./_lib/respond.js";
import { dispatch, err } from "./_lib/mcp/dispatch.js";
import { SUPPORTED_PROTOCOLS } from "./_lib/mcp/constants.js";

// Stateless Streamable HTTP MCP adapter. One JSON-RPC message per POST and a
// JSON response — no session, no server-initiated SSE. Vercel may serve each
// request from a different instance, so there is nothing safe to keep between
// calls, and a client that has to hold a session id would break on scale-out.
//
// The protocol itself lives in _lib/mcp/*; this file only does HTTP.

const isNotification = (message) => message?.id === undefined || message?.id === null;

export default async function handler(req, res) {
    applyCommonHeaders(res, req, {
        methods: "POST, OPTIONS",
        allowHeaders: "Accept, Content-Type, MCP-Protocol-Version, Mcp-Session-Id",
    });

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
        catch { return sendJSON(req, res, 200, err(null, -32700, "Parse error")); }
    }
    if (payload === undefined || payload === null) return sendJSON(req, res, 200, err(null, -32600, "Invalid Request"));

    const declared = String(req.headers?.["mcp-protocol-version"] || "").trim();
    if (declared && !SUPPORTED_PROTOCOLS.has(declared)) {
        return sendJSON(req, res, 200, err(null, -32600,
            `Unsupported MCP protocol version: ${declared}. Supported: ${[...SUPPORTED_PROTOCOLS].join(", ")}.`));
    }

    // JSON-RPC 2.0: a notification gets no response, and a batch of nothing but
    // notifications produces no body at all. Answering one with `id: null` makes
    // strict clients treat the whole exchange as a protocol error.
    if (Array.isArray(payload)) {
        const results = await Promise.all(payload.map((message) => dispatch(message)));
        const responses = results.filter((_, index) => !isNotification(payload[index]));
        if (!responses.length) return res.status(202).end();
        return sendJSON(req, res, 200, responses);
    }

    if (isNotification(payload)) {
        await dispatch(payload).catch(() => {});
        return res.status(202).end();
    }

    return sendJSON(req, res, 200, await dispatch(payload));
}
