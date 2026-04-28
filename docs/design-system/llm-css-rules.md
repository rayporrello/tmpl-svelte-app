# LLM CSS Rules

Paste the relevant sections of this file into a project's `CLAUDE.md` to give an AI agent accurate, current CSS rules. This file reflects the actual template implementation under `src/`.

---

## Source of truth

1. Files under `src/` — the implementation is truth
2. `AGENTS.md` and `CLAUDE.md`
3. `docs/design-system/` (this directory)
4. Accepted ADRs in `docs/planning/adrs/`
5. Other planning docs — historical context only; do not use to override implemented files

---

## File structure

```
src/
  app.css                   entry file — do not add styles here, only imports
  app.html                  HTML shell
  lib/styles/
    tokens.css              BRAND FILE — edit this to rebrand
    reset.css               architecture — DO NOT EDIT
    base.css                architecture — DO NOT EDIT
    animations.css          architecture — add brand animations below marker only
    utilities.css           architecture — add brand utilities below marker only
    forms.css               architecture — add brand form overrides below marker only
  routes/
    +layout.svelte          imports app.css; add global layout here
    styleguide/+page.svelte design system demo — keep updated
```

**Architecture files (`reset.css`, `base.css`, `animations.css`, `utilities.css`, `forms.css`) must not be edited for project-specific work except in the marked brand-specific section at the bottom of each file.**

---

## Cascade layer order

```css
@layer reset, tokens, base, utilities, components;
```

This order is declared in `app.css` and must not change. Component `<style>` blocks are outside any layer by default, so they naturally win over layered utilities — this is correct and intentional.

---

## Token rules

- **Always use semantic tokens**: `var(--surface-raised)`, `var(--text-primary)`, `var(--space-4)`
- **Never use brand primitives in component CSS**: no `var(--brand-dark)` or `var(--brand-accent)` outside `tokens.css`
- **Never hardcode oklch/hex/rgb/hsl** in component CSS
- **Add missing tokens to `tokens.css`** before using an un-tokenized value
- Use semantic aliases for intent: `var(--color-accent)`, `var(--border-focus)`, and `var(--state-focus-ring)` instead of `var(--brand-accent)`

---

## Spacing rules

- Use `var(--space-*)` tokens for all spacing
- Approved exceptions: `1px` borders, `2px` outlines, sub-pixel optical corrections
- Use `gap` for spacing between flex/grid children (not `margin`)
- Use `margin-block` only inside `.flow` prose contexts

---

## Logical properties

Always use logical properties, not physical directional properties:

| Physical                       | Use instead                                 |
| ------------------------------ | ------------------------------------------- |
| `margin-left` / `margin-right` | `margin-inline-start` / `margin-inline-end` |
| `margin-top` / `margin-bottom` | `margin-block-start` / `margin-block-end`   |
| `padding: X Y`                 | `padding-block: X; padding-inline: Y`       |
| `border-top`                   | `border-block-start`                        |

---

## Opacity rule

**Do not use `opacity` for translucent backgrounds, borders, overlays, or glass effects.**
Use `color-mix(in oklch, <color> <percent>%, transparent)` instead.

```css
/* Wrong */
background: var(--brand-accent);
opacity: 0.15; /* children inherit this — unintended */

/* Right */
background: color-mix(in oklch, var(--brand-accent) 15%, transparent);
```

**Opacity IS allowed for:**

- Whole-element fade transitions: `opacity: 0` → `opacity: 1` (modals, backdrops, dropdowns, tooltips)
- Skeleton/pulse effects: the whole element dims intentionally
- Disabled controls: `opacity: 0.5` on `:disabled` dims the whole control (placeholder + icons + surface) — this is correct

---

## Container queries

Use container queries for component-level responsive layout. Use media queries only for page-level shell decisions.

```css
/* Component responds to its container width, not the viewport */
.card-grid {
	container-type: inline-size; /* or use .container-inline utility */
}

@container (inline-size >= 40rem) {
	.card-grid {
		grid-template-columns: repeat(2, 1fr);
	}
}
```

---

## Website-first scrolling

- Do NOT add `html, body { overflow: hidden }` — this template is for scrolling websites
- Do NOT add `maximum-scale=1` or `user-scalable=0` to the viewport meta tag in `app.html`
- If a project genuinely needs a full-height viewport-locked layout, scope it to a specific route's wrapper element, not to `html`/`body`

---

## Forms

**Responsibility split:**

- `forms.css` — visual only: field layout, control appearance, error/help text, disabled states, focus rings, form messages
- **Superforms** — behavior: validation, data binding, submission, server errors, progressive enhancement

**Superforms is the standard form behavior library.** Install when the first form with a server action is added:

```bash
bun add sveltekit-superforms valibot
```

**CSS classes from `forms.css`:**

```
.form              form wrapper
.form-section      named group within a form
.form-grid         responsive 1→2 column grid (use inside .container-inline)
.field             label + control + help + error unit
.field-label       <label>
.field-required    required asterisk (aria-hidden="true" in HTML)
.field-control     optional prefix/suffix wrapper
.field-help        hint text
.field-error       error text
.input             text, email, tel, password inputs
.textarea          textarea
.select            select
.checkbox-row      inline label wrapping checkbox + text
.radio-row         inline label wrapping radio + text
.form-actions      submit/cancel cluster
.form-message      form-level banner (data-variant: success|warning|danger)
```

**Invalid state — three supported patterns:**

```html
<input aria-invalid="true" />
<!-- ARIA — Superforms sets this automatically -->
<input data-invalid="true" />
<!-- data attribute -->
<div class="field" data-invalid="true">…</div>
<!-- parent scope -->
```

**Do not:**

- Duplicate form behavior in CSS
- Build custom form submission — use Superforms server actions
- Add Formsnap (Superforms direct is the standard)

---

## Accessibility

- Every interactive element must have a visible `:focus-visible` ring
- Minimum 44×44px touch target for interactive controls
- Use `aria-invalid`, `aria-describedby`, and `role="alert"` for form errors
- Never use color as the sole status indicator — pair with icon or text
- Prefer semantic HTML (`<button>`, `<nav>`, `<time>`) over classed divs

---

## What agents may edit

| Target                               | What to do                                            |
| ------------------------------------ | ----------------------------------------------------- |
| `tokens.css`                         | Edit freely for brand customization                   |
| Component `<style>` blocks           | Write component-specific styles here                  |
| Brand sections in architecture files | Add brand-specific additions after the marked section |
| `+layout.svelte`                     | Add global layout wrapper, header, footer             |
| `app.html`                           | Update title, theme-color hex, favicon path           |

## What agents must NOT edit

| Target                                | Reason                                                    |
| ------------------------------------- | --------------------------------------------------------- |
| `reset.css`                           | Universal browser normalization — never project-specific  |
| `base.css`                            | Element defaults — extend via component styles, not edits |
| `utilities.css` architecture section  | Shared utility classes — edit breaks all projects         |
| `animations.css` architecture section | Shared motion system — edit breaks all projects           |
| `forms.css` architecture section      | Shared form primitives — edit breaks all projects         |
| Layer order in `app.css`              | Must stay `reset, tokens, base, utilities, components`    |

---

## Images

Full rules: [images.md](images.md)

### Which component to use

| Image source                           | Location          | Component        |
| -------------------------------------- | ----------------- | ---------------- |
| Developer-owned (brand, UI, marketing) | `src/lib/assets/` | `<enhanced:img>` |
| CMS / editor upload                    | `static/uploads/` | `<CmsImage>`     |

### Always

- Include `width` and `height` on every `<img>` — prevents layout shift (CLS)
- Use `loading="eager" fetchpriority="high"` on the page's LCP image (primary hero)
- Use `loading="lazy"` (default) for all below-the-fold images
- Wrap meaningful images in `<figure>` per the semantic HTML contract

### Never

- Do not use plain `<img>` for brand or CMS images without a documented exception
- Do not put CMS uploads in `src/` — `<enhanced:img>` only processes build-time images
- Do not add `loading="lazy"` to the LCP image
- Do not use `background-image` for meaningful content — use `<img>` in `<figure>`
- Do not use GIF format

---

## Typography

Full rules: [typography.md](typography.md)

- Reference `var(--font-sans)` and `var(--font-mono)` — never hardcode font names
- Import Fontsource fonts once in `src/app.css` — never in components
- Do not add `<link rel="preload">` for Fontsource fonts (filenames are hashed and can become stale)
- Do not use a Google Fonts CDN link
- Paid fonts: `.woff2` in `static/fonts/`, `@font-face` in `tokens.css`

---

## Before making CSS changes

1. Check `docs/design-system/` for the relevant guide
2. Check `tokens.css` to see if a token already covers your use case
3. If adding a new semantic concept, add a token to `tokens.css` first
4. If you're not sure whether a change is architectural or brand-specific, ask before editing an architecture file
