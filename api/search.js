import { listFonts, normalize } from "./_lib/fonts.js";

function sendJSON(res, status, data) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (status === 405) res.setHeader("Allow", "GET, OPTIONS");
    res.setHeader("Cache-Control", status === 200
        ? "public, max-age=30, s-maxage=120, stale-while-revalidate=600"
        : "no-store");
    return res.status(status).json(data);
}

export default async function handler(req, res) {
    if (req.method === "OPTIONS") return sendJSON(res, 204, null);
    if (req.method !== "GET") return sendJSON(res, 405, { error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
    try {
        const fonts = await listFonts();
        const query = String(Array.isArray(req.query?.q) ? req.query.q[0] || "" : req.query?.q || "").trim().slice(0, 200);
        if (!query) return sendJSON(res, 200, fonts);
        const terms = normalize(query).split("-").filter(Boolean);
        return sendJSON(res, 200, fonts.filter(font => {
            const tokens = normalize(`${font.name} ${font.file} ${font.type} ${font.format}`)
                .split("-")
                .filter(Boolean);
            return terms.every(term => tokens.some(token => token.startsWith(term)));
        }));
    } catch (error) {
        console.error("Typace font search failed:", error);
        return sendJSON(res, 500, { error: "Unable to search fonts.", code: "FONT_SEARCH_FAILED" });
    }
}
