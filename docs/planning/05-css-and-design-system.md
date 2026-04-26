# CSS and Design System

## Philosophy

The design system is token-driven, cascade-layered, and website-first. It has no Tailwind, no CSS-in-JS, and no component library dependency. All styling reads from CSS custom property tokens defined in `tokens.css`.

The system is intentionally small. It provides a solid, reachable baseline — not a complete UI kit.

## File Structure

```
src/
  app.css                  ← entry file: layer order, font imports, design system imports
  lib/styles/
    tokens.css             ← THE BRAND FILE — all custom properties; replace to rebrand
    reset.css              ← modern CSS reset; architecture file, do not edit per project
    base.css               ← default element styles (headings, links, code, etc.)
    animations.css         ← motion system: keyframes, transition utilities, stagger
    utilities.css          ← single-purpose layout, typography, and component classes
    forms.css              ← visual form primitives (inputs, fields, messages)
```

## Cascade Layer Order

```css
@layer reset, tokens, base, utilities, components;
```

- `reset` — browser normalization
- `tokens` — all custom properties; no visual rules
- `base` — element defaults (h1–h6, p, a, code, etc.)
- `utilities` — single-purpose classes and compound primitives (layout, forms, animations)
- `components` — reserved for project-specific Svelte component styles

Rules in a higher-priority layer always win over lower ones, regardless of specificity.

## tokens.css — The Brand File

`tokens.css` is the only file that needs to change when rebranding. Everything else reads from its variables.

Token sections:

| # | Section | Examples |
|---|---------|---------|
| 1 | Brand primitives | `--brand-dark`, `--brand-accent`, `--brand-danger` |
| 2 | Derived palette | `--color-success`, `--color-success-subtle` |
| 3 | Semantic surfaces | `--surface-ground`, `--surface-raised`, `--surface-sunken` |
| 4 | Typography | `--text-primary`, `--text-secondary`, `--text-muted` |
| 5 | Borders | `--border-structural`, `--border-focus` |
| 6 | Permanent surfaces | Always-dark nav, always-light panel (unlock as needed) |
| 7 | Fonts | `--font-sans`, `--font-mono` |
| 8 | Type scale | `--text-xs` through `--text-5xl`, fluid variants |
| 9 | Spacing | `--space-1` through `--space-24`, semantic aliases |
| 10 | Shape | `--radius-sm` through `--radius-full` |
| 11 | Layout | `--content-width`, `--gutter`, `--section-space`, `--bp-*` |
| 12 | Animation | `--duration-*`, `--ease-decel` |
| 13 | Shadows | `--shadow-sm`, `--shadow-md`, `--shadow-lg` |
| 14 | Z-index | `--z-base` through `--z-tooltip` |
| 15 | Interaction states | `--state-hover-bg`, `--state-focus-ring`, `--state-disabled-*` |
| 16 | Form aliases | `--field-bg`, `--field-border`, `--field-border-invalid`, etc. |

### Rules

- Components must reference semantic tokens, not raw brand primitives or raw palette values.
- `light-dark()` drives the light/dark theme engine. `color-mix(in oklch, ...)` derives translucent variants.
- Never use `opacity` to create translucent colors — use `color-mix()` instead.
- Never hardcode colors inside component CSS when a semantic token exists.

## Color and Opacity Rules

**Use `color-mix(in oklch, color X%, transparent)` for all translucent surfaces, borders, shadows, and overlays.**

**Opacity is allowed for:**
- Whole-element visibility transitions (modal fade, backdrop fade, tooltip appear)
- Skeleton/pulse animations
- Disabled controls — dimming the entire element (including its placeholder and icon children) is the intended behavior

**Opacity is not allowed for:**
- Translucent backgrounds or card surfaces
- "Disabled-looking" overlays on top of elements
- Glass effects
- Border transparency

## Light/Dark Theme

The theme engine uses the CSS `color-scheme` property and `light-dark()`:

```css
color-scheme: light dark;  /* in :root */
--surface-ground: light-dark(var(--brand-light), var(--brand-dark));
```

Manual override via JS sets `data-theme="dark"` or `data-theme="light"` on `:root`, which switches `color-scheme` to a single value and resolves `light-dark()` accordingly. See `app.html` for the anti-FOUC initialization script.

## Section / Container Pattern

The standard page layout is:

```html
<section>           <!-- full-bleed background, vertical rhythm, gutter -->
  <div class="container">  <!-- centered, max-width content -->
    …
  </div>
</section>
```

`main > section` gets `padding-block: var(--section-space)` and `padding-inline: var(--gutter)` automatically. `.container` centers and applies `max-width: var(--content-width)`.

Width variants: `.container--narrow`, `.container--wide`, `.container--full`.

## forms.css

`forms.css` provides visual form primitives. It is CSS-only and has no Superforms dependency.

**Responsibility split:**
- `forms.css` — visual layout, control appearance, accessible states, error/help text, disabled styles, focus rings, form messages
- **Superforms** — the standard behavior layer. Owns validation, data binding, submission, progressive enhancement, server errors, constraint API.

**Superforms is the standard choice for any form with submission behavior.** Add it when a project's first server-action form is needed: `bun add sveltekit-superforms valibot`. Superforms-generated markup uses the same class patterns, so no changes to `forms.css` are needed when it is added.

### Class surface

```
.form               top-level form wrapper
.form-section       named logical group
.form-grid          responsive 1→2 column field grid
.field              label + control + help + error unit
.field-label        <label> element
.field-required     required asterisk (add aria-hidden="true" in HTML)
.field-control      optional prefix/suffix wrapper
.field-help         hint text
.field-error        error text
.input              <input type="text|email|…">
.textarea           <textarea>
.select             <select>
.checkbox-row       inline label wrapping checkbox + text
.radio-row          inline label wrapping radio + text
.form-actions       submit/cancel cluster
.form-message       form-level banner (data-variant: success|warning|danger)
```

### Invalid field states — three supported selectors

```css
/* ARIA — works with any markup */
[aria-invalid="true"]

/* Data attribute — easy with Superforms enhance */
[data-invalid="true"]

/* Parent field wrapper — applies to all controls inside */
.field[data-invalid="true"] .input
```

### Focus

Focus styles inherit from `base.css` `:focus-visible`. Invalid controls shift the focus ring color to `--field-border-invalid`. All interactive controls meet a 44px minimum touch target.

## Z-Index Scale

Use tokens, not raw numbers:

| Token | Value | Intended use |
|-------|-------|-------------|
| `--z-base` | 0 | Default stacking context |
| `--z-raised` | 10 | Floating labels, badges |
| `--z-sticky` | 100 | Sticky headers, floating action buttons |
| `--z-overlay` | 200 | Side panels, drawers |
| `--z-modal` | 300 | Dialogs |
| `--z-toast` | 400 | Notifications |
| `--z-tooltip` | 500 | Tooltips (always on top) |

## Animations

`animations.css` provides spatial transitions, snap interactions, foundation keyframes, and stagger delay utilities. It lives in `@layer utilities`.

Motion respects `prefers-reduced-motion: reduce` via a universal kill switch that collapses all animation and transition durations.

See [Opacity Policy](#color-and-opacity-rules) — `animations.css` uses opacity for whole-element visibility transitions (modal fade, backdrop fade, pulse), which is correct and allowed.

## Authoring Rules

1. **Token-first.** Use `var(--token)` everywhere. Add new tokens to `tokens.css` before inventing a value.
2. **Layer-aware.** Know which layer your rule belongs in. `@layer utilities` for utility classes and primitives. `@layer components` (or a Svelte `<style>` block) for component-specific styles.
3. **Logical properties.** Use `padding-inline`, `border-block-start`, `margin-inline-start`, etc. instead of `left`/`right`/`top`/`bottom` equivalents.
4. **Gap over margins.** Use `gap` in flex/grid containers. Use `margin-block` only in flow/prose contexts (`.flow`).
5. **No raw colors in components.** If a semantic token for the color doesn't exist, add it to `tokens.css` first.
6. **No `opacity` for surfaces.** Use `color-mix()`.
7. **No `height: 100%; overflow: hidden` on `html, body`.** This template is website-first. Normal document scrolling is the default.
