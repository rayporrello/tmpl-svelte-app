# Design System

Practical guide for building websites with this template. This is the primary implementation reference — it reflects what is actually in `src/lib/styles/` and takes precedence over planning docs.

## What the design system is

A lightweight, token-driven CSS layer with no mandatory build-time dependencies. It provides:

- **Consistent visual foundation** — spacing, color, typography, and shape tokens that define the brand
- **Cascade-layered architecture** — explicit `@layer` declarations prevent specificity fights
- **Website-first defaults** — normal document scrolling, no full-height viewport lock, no disabled user zoom
- **Light/dark theme engine** — CSS `light-dark()` and `color-scheme`, no JavaScript required at paint time
- **Visual form primitives** — `forms.css` styles fields, controls, and messages
- **Superforms as standard** — the behavior layer for any form with submission; CSS layer works without it

## The two-layer model

```
BRAND LAYER (swap per project)       ARCHITECTURE LAYER (never change)
─────────────────────────────        ──────────────────────────────────
tokens.css                           reset.css
                                     base.css
                                     animations.css
                                     utilities.css
                                     forms.css
```

To rebrand: replace or edit `tokens.css`. The architecture files read from it and never need to change.

## File structure

```
src/
  app.css                   entry file — layer declaration, font imports, design system imports
  app.html                  HTML shell — title, theme-color, viewport, anti-FOUC script
  lib/styles/
    tokens.css              THE BRAND FILE — all custom properties
    reset.css               browser normalization (architecture — do not edit)
    base.css                element defaults: headings, links, code (architecture — do not edit)
    animations.css          motion system (architecture — add brand motion below marker)
    utilities.css           layout/typography/interaction utilities (architecture — add brand utilities below marker)
    forms.css               visual form primitives (architecture — add brand overrides below marker)
  routes/
    +layout.svelte          imports app.css; add global header/footer here
    styleguide/
      +page.svelte          living design system demo — keep current
```

## Website-first defaults

This template is for websites and landing pages. Default behaviors:

- Normal document scrolling (`html, body` do not have `overflow: hidden`)
- User zoom is not disabled (`viewport` is `width=device-width, initial-scale=1`)
- `#svelte { display: contents }` — the SvelteKit root is invisible to layout
- Smooth scrolling inside `@media (prefers-reduced-motion: no-preference)`

**Do not add app-shell behaviors** (full-height viewport lock, hidden overflow, iOS zoom prevention) unless a specific project requires them. If you must, add them to that project's `+layout.svelte` or a wrapper element — not to the template baseline.

## How to customize a brand

Edit `tokens.css`. The main levers:

1. **Brand primitives** (section 1) — swap the 5–7 locked oklch values for your brand colors
2. **Fonts** (section 7) — update `--font-sans` and `--font-mono`, add corresponding Fontsource imports in `app.css`
3. **Shape** (section 10) — set `--radius-*` to `0` for sharp/brutalist, increase for soft brands
4. **Form aliases** (section 16) — override `--field-border`, `--field-bg`, etc. to restyle all form controls at once

Do not hardcode color or spacing values in component CSS. Always add to `tokens.css` first.

## How to write component CSS

Use Svelte scoped `<style>` blocks. See [component-css-rules.md](component-css-rules.md) for the full rule set.

Quick reference:
- Reference `var(--semantic-token)` — never raw brand primitives or hardcoded values
- Use logical properties (`padding-inline`, `border-block-start`)
- Use `gap` for spacing between flex/grid children
- Use `color-mix(in oklch, color X%, transparent)` for translucent surfaces — never `opacity`
- Opacity is allowed for fade animations and disabled states

## How forms work

`forms.css` handles all visual styling. **Superforms** is the standard behavior layer.

- **Visual**: class-based primitives in `forms.css` — `.form`, `.field`, `.input`, `.form-message`, etc.
- **Behavior**: [Superforms](https://superforms.rocks/) — install when a project adds its first server-action form: `bun add sveltekit-superforms valibot`

See [forms-guide.md](forms-guide.md) for the full explanation and usage patterns.

## How to add project-specific styles

Each architecture file has a marked section at the bottom for brand-specific additions:

```css
/* ══════════════════════════════════════════════════════════
   BRAND-SPECIFIC [SECTION NAME]
   Add per-project styles below this line.
   Strip or replace when starting a new brand.
   ══════════════════════════════════════════════════════════ */
```

Add project-specific animations to `animations.css` below that marker. Add optical effects, glass panels, or brand utilities to `utilities.css` below that marker. Never mix brand additions above the architecture content.

For entirely project-specific component patterns, create new `.svelte` components with scoped `<style>` blocks.

## Further reading

- [tokens-guide.md](tokens-guide.md) — complete token reference
- [component-css-rules.md](component-css-rules.md) — CSS authoring rules for components
- [forms-guide.md](forms-guide.md) — forms: CSS layer + Superforms behavior layer
- [llm-css-rules.md](llm-css-rules.md) — concise rule set for AI agents (paste into CLAUDE.md)
- [images.md](images.md) — image pipeline: Tier 1 (`<enhanced:img>`), Tier 2 (`<CmsImage>`), LCP rules, upload targets
- [typography.md](typography.md) — font loading, CSS tokens, Fontsource vs self-hosted, per-site switching
- [media-editor-guide.md](media-editor-guide.md) — plain-language guide for content editors
