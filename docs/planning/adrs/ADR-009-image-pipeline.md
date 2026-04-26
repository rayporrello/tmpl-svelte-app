# ADR-009 — Image Pipeline

**Status:** Accepted  
**Date:** 2026-04-26

---

## Decision

This template uses a two-tier default image pipeline:

1. **Tier 1 — Build-time brand images:** `<enhanced:img>` via `@sveltejs/enhanced-img` for developer-owned assets committed to `src/lib/assets/`.
2. **Tier 2 — CMS-uploaded images:** `<CmsImage>` component backed by a Sharp prebuild script for editor images in `static/uploads/`.

A third tier (Cloudflare R2 / remote CDN) exists as a documented optional module for heavy/portfolio sites but is not part of the base template.

---

## Context

A website template needs a pragmatic image strategy that covers:

- Brand images that are known at build time (logos, hero images, illustrations)
- Content images uploaded by editors who do not touch code
- LCP/performance rules that must be consistently enforced

`@sveltejs/enhanced-img` is the right tool for build-time images — it generates multiple formats and sizes automatically. It cannot process `static/` files, which is why CMS uploads need a separate path.

---

## Consequences

- `enhancedImages()` must come before `sveltekit()` in `vite.config.ts`.
- The prebuild script runs automatically before `bun run build` via the `prebuild` npm hook.
- Agents must use `<enhanced:img>` for `src/lib/assets/` images and `<CmsImage>` for `static/uploads/` images. See `docs/design-system/images.md` for the full decision tree.
- Generated `.webp` files in `static/uploads/` are committed to the repo.
- R2 implementation is deferred. Do not add it to the base template.

---

## Alternatives considered

- **@unpic/svelte** — universal image component supporting multiple sources. Rejected as over-engineering for a simple marketing template where the two-tier model covers all standard cases.
- **Cloudflare Image Resizing for everything** — rejected as a CDN dependency for the base template. Documented as an optional path for high-volume portfolios.
- **Moving all images to R2 from day one** — rejected. Most marketing sites have fewer than 50 images and do not need a remote CDN.
