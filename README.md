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

## Font style data

There is no designer, foundry or category metadata, and guessing a category from PANOSE proved unreliable, so none is published. What a font *is* is read from its own tables instead — weight class, width class, italic, fixed-pitch and case coverage — by `scripts/font-style-index.mjs`, which writes `fonts/style-index.json`. The `font-style-index` workflow regenerates it whenever `fonts/` changes.

Every font record carries a `style` object, or `null` when the container could not be read. WOFF2 files are Brotli-compressed with per-table transforms, so they are listed in the index's `unsupported` array rather than being parsed into plausible-looking nonsense.

`GET /api/health` reports `rateLimit.mode` (`shared` or `per-instance`) and the active image providers, so the deployment's real configuration can be checked without guessing from headers.

## MCP server

The catalogue is exposed as a Model Context Protocol server, so an agent can go from a brief to a working `@font-face` rule without scraping HTML.

- **Endpoint:** `POST https://typace.ace-base.cc/api/mcp`, also reachable at `https://typace.ace-base.cc/mcp`
- **Transport:** stateless Streamable HTTP, JSON-RPC 2.0, one message per request, no session id — safe on serverless because no state survives between calls
- **Auth:** none. The per-IP limit is 120 requests/minute by default (`TYPACE_MCP_RATE_LIMIT`)
- **Discovery:** a `GET` returns 405 with the protocol, endpoint and tool names as JSON

Tools — all read-only, all annotated `readOnlyHint: true`:

| Tool | Arguments | Returns |
|---|---|---|
| `search_fonts` | `query`, `format?`, `weight?`, `width?`, `italic?`, `monospace?`, `caps?`, `limit?`, `offset?` | `{ total, fonts[] }` |
| `list_fonts` | `format?`, `weight?`, `width?`, `italic?`, `monospace?`, `caps?`, `limit?`, `offset?` | `{ total, fonts[] }` |
| `get_font` | `slug` | one font record |
| `get_font_css` | `slug` | the `@font-face` rule plus an absolute file URL |
| `list_formats` | — | counts per file format |
| `catalog_health` | — | status, catalogue size, format breakdown |

Resources: `typace://catalog`, `typace://formats`, `typace://fonts/{slug}`, `typace://font/{slug}.css`. Prompt: `pick-a-font`, which takes a design brief.

Font URLs in tool results are absolute, since an agent has no page origin to resolve a relative path against. The commit endpoint and every write operation are deliberately not exposed.

Clients that accept a remote HTTP server take a URL entry; the exact shape varies by client:

```json
{ "mcpServers": { "typace": { "url": "https://typace.ace-base.cc/mcp" } } }
```

Stdio-only clients need a bridge, e.g. `npx mcp-remote https://typace.ace-base.cc/mcp`.

The protocol implementation lives in `api/_lib/mcp/` (constants, schemas, records, tools, resources, prompts, dispatch); `api/mcp.js` is only the HTTP adapter.

## API and AI clients

The live GET /api/fonts response is the authoritative list of published font assets. Use the catalog's url and format values. Available formats depend on the live catalog. Do not invent metadata or infer licensing.

All API endpoints are public and support GET, HEAD, and OPTIONS. JSON errors include machine-readable error and code fields. Catalog responses carry a weak ETag and return 304 on a matching If-None-Match, and /api/fonts supports ?format=, ?fields=, ?slugs=, ?limit=, and ?offset= with an X-Total-Count header, plus measurable style filters — ?weight=, ?width=, ?italic=, ?monospace=, ?caps= — read from the font binaries. Rate limiting defaults to 60 requests per minute per client IP for the REST API and 120 for the MCP endpoint (TYPACE_RATE_LIMIT and TYPACE_MCP_RATE_LIMIT override them); excess requests return HTTP 429 with Retry-After. Set Upstash Redis REST credentials to enforce one global quota across instances — the Marketplace integration injects KV_REST_API_URL/KV_REST_API_TOKEN and Upstash directly injects UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN, both of which are picked up automatically (TYPACE_KV_REST_URL/TYPACE_KV_REST_TOKEN override them); without them the limiter is per-instance and best-effort, and it falls back to that behaviour automatically if the store is unreachable. Each rate-limited request costs one Redis command (a single atomic EVAL), so a 500k-command monthly allowance covers roughly 500k requests. Published font files are served with a one-year immutable cache and explicit font MIME types. See /llms.txt and /llms-full.txt for machine-client guidance.

Font records carry `createdAt` and `updatedAt` from `fonts/manifest.json`, which is generated from git history by `scripts/font-manifest.mjs` and refreshed by the `font-manifest` workflow whenever `fonts/` changes. A font is flagged `isNew` for 14 days after its add date (`TYPACE_NEW_WINDOW_DAYS`), so the badge decays on its own.

Verify the license attached to each font before commercial use, embedding, redistribution, modification, or bundling.
