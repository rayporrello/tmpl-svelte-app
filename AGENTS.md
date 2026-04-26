# AGENTS.md — tmpl-svelte-app

Operating rules for AI agents (Claude, Codex, Cursor, etc.) working in this repository. Read this before making any changes.

---

## Source of truth order

When planning docs conflict with real files, this is the authority order — top wins:

1. **Files under `src/`** — the implementation is truth
2. **`AGENTS.md`** (this file) and **`CLAUDE.md`** (project copy)
3. **`docs/design-system/`** — real design system documentation
4. **Accepted ADRs in `docs/planning/adrs/`**
5. **Other planning docs** — historical context only; do not use to override implemented files

**Do not use stale planning notes to override implemented CSS architecture or resurrect abandoned dependencies.**

---

## CSS / design-system rules

The full rule set is in [docs/design-system/llm-css-rules.md](docs/design-system/llm-css-rules.md). Key points:

### Always

- Reference semantic tokens (`var(--surface-raised)`, `var(--text-primary)`) — never raw brand primitives or hardcoded values
- Use `color-mix(in oklch, color X%, transparent)` for translucent surfaces — never `opacity` on surfaces
- Use logical properties: `padding-inline`, `border-block-start`, `margin-inline-start`
- Use `gap` for spacing between flex/grid children; `margin-block` only in `.flow` prose contexts
- Use `min-height: 44px` on interactive form controls
- Keep `@layer` order: `reset, tokens, base, utilities, components`
- Add new semantic tokens to `tokens.css` before using a value in component CSS

### Never

- `html, body { overflow: hidden }` — this is a website template; scrolling is the default
- `maximum-scale=1` or `user-scalable=0` in `app.html` — fails WCAG 1.4.4
- Raw color values (oklch/hex/hsl/rgb) in component CSS
- Hardcoded spacing except `1px` borders and `2px` outlines
- Tailwind, shadcn, or any pre-built component library
- A new `@layer` declaration without also updating `app.css`

### Opacity

Opacity is **allowed** for whole-element fades, skeleton/pulse animations, and disabled controls (dimming the whole element including its children is intentional).

Opacity is **not allowed** for translucent backgrounds, borders, overlays, or glass effects — use `color-mix()`.

---

## What agents may edit

| Target | What to do |
|--------|-----------|
| `tokens.css` | Edit freely for brand customization |
| Component `<style>` blocks | Write component-specific styles here |
| Brand sections in architecture files | Add after the `BRAND-SPECIFIC` marker comment |
| `+layout.svelte` | Add global layout wrapper, header, footer |
| `app.html` | Update title, `theme-color` hex, favicon |

## What agents must NOT edit

| Target | Reason |
|--------|--------|
| `reset.css` | Universal — editing breaks all projects |
| `base.css` | Element defaults — extend via components |
| Architecture sections of `utilities.css`, `animations.css`, `forms.css` | Shared across projects — editing breaks all |
| Layer order in `app.css` | Must stay `reset, tokens, base, utilities, components` |

---

## Forms rules

**`forms.css`** owns visual styling: field layout, control appearance, states, messages.

**Superforms** is the standard form behavior library. Install when a project adds its first form with a server action:

```bash
bun add sveltekit-superforms valibot
```

Superforms owns: validation, data binding, submission, progressive enhancement, server errors, constraint API.

Do not:
- Add form validation logic to `forms.css` or any CSS file
- Build a custom form submission handler — use Superforms server actions
- Add Formsnap (Superforms direct is the standard)
- Duplicate Superforms behavior in CSS or Svelte components

All form controls must support `aria-invalid`, `data-invalid`, `:disabled`, visible `:focus-visible`, help text (`.field-help`), and error text (`.field-error`).

---

## Template type

**Website-first.** This template targets scrolling websites and landing pages — not dashboard applications. Normal document scrolling is the default. Do not add app-shell behaviors to the baseline.

---

## File structure

```
src/
  app.css           entry file — layer order, font imports, design system imports
  app.html          HTML shell — title, viewport, theme-color, anti-FOUC script
  lib/styles/
    tokens.css      BRAND FILE — edit to rebrand
    reset.css       architecture — DO NOT EDIT
    base.css        architecture — DO NOT EDIT
    animations.css  architecture — add brand motion below marker
    utilities.css   architecture — add brand utilities below marker
    forms.css       architecture — add brand form overrides below marker
  routes/
    +layout.svelte          imports app.css
    styleguide/+page.svelte design system demo — keep updated
```

---

## Before shipping

Verify against [docs/planning/08-quality-gates.md](docs/planning/08-quality-gates.md):

- `bun run build` exits 0
- `bun run check` (TypeScript) exits 0
- No `html, body { overflow: hidden }` in the baseline
- No disabled user zoom in `app.html`
- Styleguide route renders all design system primitives without errors
- All form controls pass the forms gates
