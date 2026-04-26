# ADR-010 — Typography and Font Loading

**Status:** Accepted  
**Date:** 2026-04-26

---

## Decision

- Open-source fonts use Fontsource variable packages (`@fontsource-variable/*`), imported once globally in `src/app.css`.
- Paid or proprietary fonts are self-hosted as `woff2` files in `static/fonts/`, with `@font-face` declarations in `tokens.css`.
- Font family tokens (`--font-sans`, `--font-mono`) are defined in `tokens.css` and are the only way fonts are referenced in CSS.
- Fontsource fonts are **not** preloaded — their hashed filenames can become stale across package updates.
- Only a manually-hosted primary body font may be preloaded, and only when it materially affects above-the-fold rendering.
- The default font pair is **Plus Jakarta Sans Variable** (UI/body) and **JetBrains Mono Variable** (code).

---

## Context

Font loading has three failure modes that matter for a reusable template:

1. **FOUT (Flash of Unstyled Text):** custom font loads after text is painted in fallback.
2. **Stale preload:** a `<link rel="preload">` pointing to a hashed Fontsource filename that changed on the next `bun update`.
3. **CDN lock-in:** a Google Fonts `<link>` that adds a network round-trip, creates external dependency, and raises GDPR concerns in EU deployments.

Fontsource self-hosts font files into the project bundle via CSS `@import`. This eliminates all three failure modes: no CDN, no stale hashes in preload tags, and `font-display: swap` (included in Fontsource by default) handles FOUT gracefully.

The only case where preloading is justified is a manually-hosted font (where the filename is stable and controlled) for the primary body typeface on a site where font rendering is visually critical above the fold.

---

## Consequences

- `bun add @fontsource-variable/plus-jakarta-sans @fontsource-variable/jetbrains-mono` is required before `bun run build`.
- Swapping fonts per project requires: uninstalling the old Fontsource package, installing the new one, updating `@import` in `app.css`, and updating `--font-sans` / `--font-mono` in `tokens.css`.
- Do not add `<link rel="preload">` tags for Fontsource fonts to `app.html`.
- Agents must not import Fontsource in components — one global import in `app.css` is the standard.
- See `docs/design-system/typography.md` for the per-site font switching checklist.

---

## Alternatives considered

- **Google Fonts CDN:** rejected — external dependency, GDPR risk, extra network round-trip.
- **Preloading all fonts:** rejected — Fontsource filenames are hashed; preloads become stale. Only manually-hosted fonts with stable filenames can be safely preloaded.
- **System font stack only:** viable for dashboards but not appropriate for a branded marketing template.
- **Variable fonts vs. static weights:** variable fonts win on file size (one file vs. multiple weight files) and enable fine-grained weight control in CSS. Fontsource publishes both; the `@fontsource-variable/*` namespace is used here.
