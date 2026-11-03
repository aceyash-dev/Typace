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
    // Own-property check: a plain object inherits from Object.prototype, so
    // ?page=__proto__ would resolve to a non-function and ?page=constructor to
    // Object — one 500 and one empty 200, both instead of a 404.
    const route = Object.hasOwn(ROUTES, page) ? ROUTES[page] : notFoundHandler;
    return route(req, res);
}
