# Typace

Typace is a font library and font delivery service by [The Ace Base](https://ace-base.cc/).

## Use Typace

- Website: https://typace.ace-base.cc/
- Browse fonts: https://typace.ace-base.cc/browse
- Developer resources: https://typace.ace-base.cc/developers
- Live font catalog: https://typace.ace-base.cc/api/fonts
- Search API: https://typace.ace-base.cc/api/search?q=Spectral
- Current commit metadata: https://typace.ace-base.cc/api/commit
- OpenAPI: https://typace.ace-base.cc/api/openapi.json
- Machine-readable documentation: https://typace.ace-base.cc/llms.txt
- Documentation: https://docs.ace-base.cc/projects/typace

Available font formats depend on the live catalog. Use the catalog API as the source of truth for current assets. Categories are only returned when supported by font metadata; unknown categories and unavailable source dates are not guessed. Verify the license attached to each font before use.

## Source

This repository contains the Typace web interface, API routes, discovery pages, and published font assets. Font asset URLs are binary resources, not necessarily HTML pages.

Current font availability should be verified against the live catalog API rather than inferred from this README.
