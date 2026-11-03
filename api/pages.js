import faqHandler from "./_lib/pages/faq.js";
import fontPageHandler from "./_lib/pages/font-page.js";
import formatsHandler from "./_lib/pages/formats.js";
import notFoundHandler from "./_lib/pages/not-found.js";
import notFoundJsonHandler from "./_lib/pages/not-found-json.js";

// Every server-rendered page and both 404s live here.
//
// Vercel's Hobby plan allows 12 Serverless Functions per deployment, and the
// 13th builds cleanly but fails at the deploy step with no build-log entry —
// which is why this consolidation exists. The handlers keep their own headers,
// method checks and rate limits; this file only picks which one runs.

const ROUTES = {
    faq: faqHandler,
    font: fontPageHandler,
    formats: formatsHandler,
    "404": notFoundHandler,
    "404-json": notFoundJsonHandler,
};

export default async function handler(req, res) {
    const page = String(req.query?.page || "").toLowerCase();
    const route = ROUTES[page] || notFoundHandler;
    return route(req, res);
}
