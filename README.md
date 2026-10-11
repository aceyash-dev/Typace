# Typace

Typace is a font library and font delivery service by [The Ace Base](https://ace-base.cc/).

## Website and documentation

- Website: https://typace.ace-base.cc/
- Browse fonts: https://typace.ace-base.cc/browse
- Developer resources: https://typace.ace-base.cc/developers
- Font catalog: https://typace.ace-base.cc/api/fonts
- Search API: https://typace.ace-base.cc/api/search?q=Spectral
- API health: https://typace.ace-base.cc/api/health
- OpenAPI: https://typace.ace-base.cc/api/openapi.json
- AI-readable documentation: https://typace.ace-base.cc/llms.txt
- Full AI-readable API guide: https://typace.ace-base.cc/llms-full.txt
- Human documentation: https://docs.ace-base.cc/projects/typace

## Development

Requires Node.js 20.19 or newer.

- npm install
- npm run dev
- npm run build
- npm test

The React/Vite production build is written to dist. The public font files in fonts/ are served as static assets and are not bundled or rewritten by the UI build. Grandstander and the existing Hugeicons icon font are retained.

## API and AI clients

The live GET /api/fonts response is the authoritative list of published font assets. Use the catalog's url and format values. Available formats depend on the live catalog. Categories can be unknown and source dates can be null; do not invent metadata or infer licensing.

All API endpoints are public and support GET and OPTIONS. JSON errors include machine-readable error and code fields. Rate-limited responses return HTTP 429 and Retry-After. The current in-memory rate limiter is best-effort per serverless runtime, not a globally coordinated quota. See /llms.txt and /llms-full.txt for machine-client guidance.

Verify the license attached to each font before commercial use, embedding, redistribution, modification, or bundling.
