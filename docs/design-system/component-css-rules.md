# Component CSS Rules

Rules for writing styles in Svelte components in this template. These apply to all `.svelte` files and to brand-specific additions in the architecture CSS files.

---

## Use Svelte scoped `<style>` blocks

Component-specific styles belong in the `<style>` block of the `.svelte` file. SvelteKit scopes these automatically — no BEM, no CSS modules, no naming workaround needed.

```svelte
<div class="hero">
  <h1>Heading</h1>
</div>

<style>
  .hero {
    padding-block: var(--section-space);
    background: var(--surface-sunken);
  }
</style>
```

Styles that are shared across multiple components belong in `utilities.css` (global utilities) or a shared `.svelte` component, not in multiple `<style>` blocks.

---

## Consume semantic tokens, not brand primitives

Reference the semantic layer, not the raw brand values.

```css
/* Wrong */
background: var(--brand-dark);
color: oklch(84% 0.17 155);

/* Right */
background: var(--surface-ground);
color: var(--brand-accent);
```

If the right semantic token doesn't exist yet, add it to `tokens.css` first.

---

## Use logical properties

Use CSS logical properties instead of physical directional properties. They work correctly in right-to-left languages without overrides.

| Physical | Logical |
|----------|---------|
| `margin-left` | `margin-inline-start` |
| `margin-right` | `margin-inline-end` |
| `margin-top` | `margin-block-start` |
| `margin-bottom` | `margin-block-end` |
| `padding-left` | `padding-inline-start` |
| `padding: X Y` | `padding-block: X; padding-inline: Y` |
| `border-top` | `border-block-start` |
| `left` / `right` (in `inset`) | `inset-inline-start` / `inset-inline-end` |

Shorthands like `padding-inline: X` and `padding-block: X` are fine and preferred over spelling out all four sides when both axes are equal.

---

## Use `gap` for component-internal spacing

Components own the gap between their own children. Use `gap` in flex and grid layouts.

```css
/* Right */
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-component-gap);
}

/* Wrong — margin creates outside dependency */
.card > * + * {
  margin-block-start: var(--space-4);
}
```

**Exception:** `.flow` is a legitimate use of `margin-block` for rich text / prose content, where the element stream is heterogeneous and gap-based approaches are impractical. The `.flow` utility class in `utilities.css` handles this.

---

## Components do not own their outside margins

A component must not set its own `margin` on the outer element. The parent layout (section, grid, stack) controls spacing between components.

```css
/* Wrong — component controls its own outside margin */
.card {
  margin-block-end: var(--space-8);
}

/* Right — parent controls the gap */
.card-grid {
  display: grid;
  gap: var(--space-6);
}
```

---

## Container queries over media queries for component layout

When a component's internal layout should respond to its available width (not the viewport), use a container query. This makes components reusable at any size.

```svelte
<div class="card-grid container-inline">
  {#each items as item}
    <div class="card">…</div>
  {/each}
</div>

<style>
  .card-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-4);
  }

  @container (inline-size >= 40rem) {
    .card-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
```

The `.container-inline` utility class (in `utilities.css`) sets `container-type: inline-size`.

**Media queries are appropriate for** page-level shell and section layout decisions that genuinely depend on viewport width (full-page hero layout, nav collapse, etc.).

---

## No raw color values

Never hardcode oklch, hex, hsl, or rgb values in component CSS.

```css
/* Wrong */
background: oklch(84% 0.17 155);
color: #1a2035;

/* Right */
background: color-mix(in oklch, var(--brand-accent) 15%, transparent);
color: var(--text-primary);
```

---

## No hardcoded spacing except approved exceptions

Use spacing tokens.

```css
/* Wrong */
padding: 16px 24px;

/* Right */
padding-block: var(--space-4);
padding-inline: var(--space-6);
```

**Approved exceptions:**
- `1px` borders and outlines
- `2px` focus ring outlines
- Sub-pixel optical corrections (e.g., `translateY(-1px)` for vertical centering of icons)

---

## Opacity rule

**Do not use `opacity` to create translucent backgrounds, borders, overlays, or glass effects.**

The problem: `opacity` makes all descendants translucent, not just the element's background. Children inherit the transparency unintentionally.

```css
/* Wrong — all child text and icons become 15% transparent too */
background: var(--brand-accent);
opacity: 0.15;

/* Right — only the background is translucent, children are unaffected */
background: color-mix(in oklch, var(--brand-accent) 15%, transparent);
```

**`opacity` is correct for:**

```css
/* Whole-element fade — modal, backdrop, tooltip */
@keyframes fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* Disabled state — dim the whole control, including its placeholder and icons */
.input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Skeleton / pulse — the whole element pulses */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.5; }
}
```

---

## Accessibility

### Focus visibility

Do not suppress focus rings. The global `:focus-visible` style in `base.css` handles this correctly — it shows rings on keyboard navigation and hides them on mouse click.

If a component needs a custom focus ring:

```css
.custom-button:focus-visible {
  outline: 2px solid var(--state-focus-ring);
  outline-offset: 2px;
}
```

Never do `outline: none` without providing an alternative.

### Minimum touch target

Interactive elements must meet the 44×44px minimum touch target. Use `min-height: 44px` and `min-width: 44px` (or `padding` that achieves the same) on buttons, links, and form controls.

### Color is not the sole status indicator

Do not use color alone to convey error, success, or warning status. Pair it with:
- An icon or symbol
- A visible text label
- An ARIA attribute (`aria-invalid`, `aria-live`, `role="alert"`)

### Semantic HTML preference

Before adding a class, check if a semantic HTML element communicates the meaning on its own. Use `<button>` over `<div class="button">`, `<nav>` over `<div class="nav">`, `<time>` over `<span>`.

---

## No Tailwind by default

This template does not include Tailwind. Use the existing utility classes in `utilities.css` or write component-scoped styles. If a specific project needs Tailwind, add it to that project's `package.json` without modifying the template base.

---

## Layer context reminder

Component `<style>` blocks in SvelteKit are scoped CSS, not part of any `@layer`. They naturally win over `@layer utilities` styles due to specificity. This is correct behavior — component styles are intentionally more specific than utilities.

If you need a component style to be overridden by a utility class, you can wrap it in a layer:

```css
<style>
  @layer components {
    .card { padding: var(--space-4); }
  }
</style>
```

The `components` layer is declared last in `app.css`, so it loses to nothing in the layer stack.
