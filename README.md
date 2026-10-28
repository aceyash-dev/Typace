# Typace

Typace is a font library and font delivery service by [The Ace Base](https://ace-base.cc/).

## Website and documentation

- Website: https://typace.ace-base.cc/
- Browse fonts: https://typace.ace-base.cc/browse
- Developer resources: https://typace.ace-base.cc/developers
- Privacy: https://typace.ace-base.cc/privacy
- Terms of use: https://typace.ace-base.cc/terms
- Cookie policy and preferences: https://typace.ace-base.cc/cookies
- Security disclosure policy: https://typace.ace-base.cc/security
- Security contact file: https://typace.ace-base.cc/.well-known/security.txt
- Font catalog: https://typace.ace-base.cc/api/fonts
- Search API: https://typace.ace-base.cc/api/search
- API health: https://typace.ace-base.cc/api/health
- OpenAPI: https://typace.ace-base.cc/api/openapi.json
- AI-readable documentation: https://typace.ace-base.cc/llms.txt
- Full AI-readable API guide: https://typace.ace-base.cc/llms-full.txt
- Human documentation: https://docs.ace-base.cc/projects/typace

## Development

Requires Node.js 24.x (matches the Vercel runtime).

- npm install
- npm run dev
- npm run build
- npm test

The React/Vite production build is written to dist. The public font files in fonts/ are served as static assets and are not bundled or rewritten by the UI build. Grandstander and the existing Hugeicons icon font are retained. The home page presents six representative specimens; `/browse` contains the full searchable catalogue. Optional Google Tag Manager analytics are loaded only after explicit consent through the cookie preference UI.

## Stylesheet layout

Styles are split into modules under `src/styles/`, imported in cascade order by `src/styles/index.css` (the only stylesheet `src/main.jsx` imports):

- `tokens.css` — colour, type, radius and shadow tokens, plus a literal palette that is identical in light and dark.
- `base.css` — reset, element defaults, focus rings, global guards.
- `layout.css` and `layout/navigation.css` — page shell, header, footer, and the desktop/mobile navigation.
- `components/` — card, controls, skeleton, peek, preview sheet, cookie sheet, specimen, copy snippets.
- `pages/` — home, browse, legal, account, developers.
- `utilities.css` — small single-purpose helpers.

Module order is the cascade order: tokens, base, layout, components, pages, utilities. Add new rules to the module that owns the selector rather than appending an override block.

## API and AI clients

The live GET /api/fonts response is the authoritative list of published font assets. Use the catalog's url and format values. Available formats depend on the live catalog. Categories can be unknown and source dates can be null; do not invent metadata or infer licensing.

All API endpoints are public and support GET, HEAD, and OPTIONS. JSON errors include machine-readable error and code fields. Catalog responses carry a weak ETag and return 304 on a matching If-None-Match, and /api/fonts supports ?format=, ?category=, ?limit=, and ?offset= with an X-Total-Count header. Rate limiting defaults to 60 requests per minute per client IP for the REST API and 120 for the MCP endpoint (TYPACE_RATE_LIMIT and TYPACE_MCP_RATE_LIMIT override them); excess requests return HTTP 429 with Retry-After. Set TYPACE_KV_REST_URL and TYPACE_KV_REST_TOKEN (Vercel KV or Upstash REST credentials) to enforce one global quota across instances; without them the limiter is per-instance and best-effort, and it falls back to that behaviour automatically if the store is unreachable. Published font files are served with a one-year immutable cache and explicit font MIME types. See /llms.txt and /llms-full.txt for machine-client guidance.

Verify the license attached to each font before commercial use, embedding, redistribution, modification, or bundling.
