# Tokens Guide

`src/lib/styles/tokens.css` is the brand file. It defines every CSS custom property used across the design system. To rebrand a project, edit this file — nothing else needs to change.

## Brand override starter

`src/lib/styles/brand.example.css` is a fully annotated re-skin example ("Warm Coral") that demonstrates a complete brand swap using only token overrides. It shows exactly which values to replace (sections 1, 5, and 8 — primitives, fonts, and shape), leaves the remaining 11 sections untouched, and includes a swap checklist at the bottom. Copy it, replace the values with your brand, rename it `tokens.css`, and every component updates automatically — no component CSS edits required.

## Rules for using tokens

1. **Components consume semantic tokens, not brand primitives.** Use `var(--surface-raised)` or `var(--color-accent)`, not `var(--brand-white)` or `var(--brand-accent)`.
2. **Never use raw oklch/hex/rgb values in component CSS.** Add a token to `tokens.css` first.
3. **Use `color-mix()` for translucency.** Never use `opacity` on surfaces — see [Opacity rule](#opacity-rule).
4. **`light-dark()` drives the theme engine.** All surface, text, and border tokens resolve at render time based on `color-scheme`.

---

## 1. Brand primitives

Fixed oklch values — the brand's DNA. 5–7 values maximum.

```css
--brand-black: oklch(0% 0 0) --brand-dark: oklch(18% 0.04 260) /* deep navy — dark bg */
	--brand-light: oklch(98% 0.01 260) /* off-white — light bg */ --brand-accent: oklch(84% 0.17 155)
	/* mint/teal — CTAs, links */ --brand-warning: oklch(75% 0.15 65) /* amber — warnings only */
	--brand-danger: oklch(60% 0.18 18) /* red — errors only */ --brand-white: oklch(100% 0 0);
```

**oklch format:** `oklch(L% C H)` — lightness (0–100%), chroma (0–0.37), hue (0–360).

When to use brand primitives directly: only in `tokens.css` itself, when defining semantic tokens. Never in component CSS. This includes `--brand-accent`: it is a primitive. Components use semantic aliases such as `--color-accent`, `--border-focus`, or `--state-focus-ring` depending on intent.

---

## 2. Derived palette

Tints, shades, and subtle backgrounds derived from brand primitives via `color-mix()`.

```css
--color-accent: var(--brand-accent) --color-success: oklch(65% 0.15 145)
	--color-success-subtle: color-mix(in oklch, var(--color-success) 15%, transparent)
	--color-warning: var(--brand-warning)
	--color-warning-subtle: color-mix(in oklch, var(--brand-warning) 15%, transparent)
	--color-danger: var(--brand-danger)
	--color-danger-subtle: color-mix(in oklch, var(--brand-danger) 15%, transparent)
	--color-info: oklch(65% 0.15 250)
	--color-info-subtle: color-mix(in oklch, var(--color-info) 15%, transparent);
```

The `*-subtle` variants are used for message backgrounds (form messages, alert banners, toasts) where you want a tinted background without a full-saturation color.

---

## 3. Semantic surfaces

What components reference for backgrounds. Always use `light-dark()` for anything that should invert on theme change.

```css
--surface-ground: light-dark(var(--brand-light), var(--brand-dark)) /* page background */
	--surface-raised: light-dark(white, dark + 4%) /* cards, panels */
	--surface-sunken: light-dark(dark + 4%, black + 30%) /* code blocks, inset areas */;
```

**Do not use these as border colors.** Border tokens exist for that.

---

## 4. Text tokens

```css
--text-primary: light-dark(brand-dark, brand-white) /* headings, body */
	--text-secondary: light-dark(70% opacity equivalent) /* supporting text */
	--text-muted: light-dark(40% opacity equivalent) /* metadata, captions */;
```

All use `color-mix()` to derive the dimmer variants — not `opacity`.

---

## 5. Border tokens

```css
--border-structural: light-dark(dark 15%, white 10%) /* card edges, dividers */
	--border-subtle: light-dark(dark 6%, white 4%) /* very light separators */
	--border-default: var(--border-structural) /* alias for convenience */
	--border-focus: var(--color-accent) /* focus rings */;
```

---

## 6. Permanent surfaces

Surfaces that never invert — use direct references without `light-dark()`. Uncomment examples in `tokens.css` when needed (always-dark nav, etc.).

---

## 7. Fonts

```css
--font-sans:
	'Plus Jakarta Sans Variable', system-ui, sans-serif --font-mono: 'JetBrains Mono Variable',
	ui-monospace, monospace;
```

Swap font names per project. Update the `@import` lines at the top of `app.css` to match.

---

## 8. Type scale

Static scale:

| Token         | rem      | px   |
| ------------- | -------- | ---- |
| `--text-xs`   | 0.75rem  | 12px |
| `--text-sm`   | 0.875rem | 14px |
| `--text-base` | 1rem     | 16px |
| `--text-lg`   | 1.125rem | 18px |
| `--text-xl`   | 1.25rem  | 20px |
| `--text-2xl`  | 1.5rem   | 24px |
| `--text-3xl`  | 1.875rem | 30px |
| `--text-4xl`  | 2.25rem  | 36px |
| `--text-5xl`  | 3rem     | 48px |

Fluid variants (for hero/display text):

```css
--text-fluid-3xl: clamp(1.5rem, 1rem + 2.5vw, 1.875rem)
	--text-fluid-4xl: clamp(1.875rem, 1.25rem + 3vw, 2.25rem)
	--text-fluid-5xl: clamp(2.25rem, 1.5rem + 4vw, 3rem);
```

Font-weight tokens: `--weight-normal` (400), `--weight-medium` (500), `--weight-semibold` (600), `--weight-bold` (700).

Line-height tokens: `--leading-tight` (1.2), `--leading-normal` (1.5), `--leading-relaxed` (1.6).

Letter-spacing tokens: `--tracking-tight` (-0.02em), `--tracking-normal` (0), `--tracking-wide` (0.05em), `--tracking-wider` (0.1em).

---

## 9. Spacing scale

4px base unit. All values are multiples.

| Token        | rem     | px   |
| ------------ | ------- | ---- |
| `--space-1`  | 0.25rem | 4px  |
| `--space-2`  | 0.5rem  | 8px  |
| `--space-3`  | 0.75rem | 12px |
| `--space-4`  | 1rem    | 16px |
| `--space-5`  | 1.25rem | 20px |
| `--space-6`  | 1.5rem  | 24px |
| `--space-8`  | 2rem    | 32px |
| `--space-10` | 2.5rem  | 40px |
| `--space-12` | 3rem    | 48px |
| `--space-16` | 4rem    | 64px |
| `--space-20` | 5rem    | 80px |
| `--space-24` | 6rem    | 96px |

Semantic aliases (use these in layout CSS instead of raw scale tokens):

```css
--space-element-gap: var(--space-2) /* gap between tight items */
	--space-component-gap: var(--space-4) /* gap within a component */
	--space-component-padding: var(--space-4) /* component internal padding */
	--space-section-gap: var(--space-8) /* gap between components in a section */
	--space-page-margin: var(--space-8) /* page edge margin */;
```

---

## 10. Shape / radius

```css
--radius-sm: 0.25rem /* subtle rounding — inputs, tags */ --radius-md: 0.5rem
	/* cards, panels, buttons */ --radius-lg: 0.75rem /* large cards */ --radius-xl: 1rem
	/* modals, drawers */ --radius-full: 9999px /* pills, avatars */;
```

Set all `--radius-*` to `0` for sharp/brutalist aesthetics. Increase for soft/rounded brands.

---

## 11. Layout tokens

Content widths:

```css
--content-width: 72rem /* 1152px — default section content */ --content-narrow: 48rem
	/* 768px  — blog posts, article text */ --content-editorial: 64rem
	/* 1024px — editorial max-width */ --content-prose: 65ch /* optimal reading line length */
	--content-wide: 80rem /* 1280px — wide layouts */;
```

Section layout:

```css
--section-space: var(--space-16) /* vertical rhythm between sections */
	--section-space-lg: var(--space-24) /* hero / feature sections */ --gutter: var(--space-6)
	/* inline edge padding on sections */ --container-gap: var(--space-8)
	/* gap between containers in one section */;
```

Breakpoint documentation tokens (informational only — CSS custom properties cannot be used in `@media` conditions):

```css
--bp-sm: 36rem /* 576px  */ --bp-md: 48rem /* 768px  */ --bp-lg: 64rem /* 1024px */ --bp-xl: 80rem
	/* 1280px */;
```

Use raw rem values in media queries: `@media (min-width: 48rem)`.

---

## 12. Motion tokens

```css
--duration-instant: 0ms --duration-fast: 100ms --duration-normal: 150ms --duration-slow: 300ms
	--ease-decel: cubic-bezier(0, 0, 0.2, 1);
```

---

## 13. Shadows

```css
--shadow-sm: 0 1px 2px 0 … --shadow-md: 0 4px 6px -1px … --shadow-lg: 0 12px 32px -8px …;
```

All shadow colors use `color-mix()` and `light-dark()` — they automatically adjust for theme.

---

## 14. Z-index scale

Always use these tokens — never raw integers.

| Token         | Value | Use                      |
| ------------- | ----- | ------------------------ |
| `--z-base`    | 0     | Default                  |
| `--z-raised`  | 10    | Floating labels, badges  |
| `--z-sticky`  | 100   | Sticky headers, FABs     |
| `--z-overlay` | 200   | Drawers, side panels     |
| `--z-modal`   | 300   | Dialogs                  |
| `--z-toast`   | 400   | Notifications            |
| `--z-tooltip` | 500   | Tooltips (always on top) |

---

## 15. Interaction state tokens

Used by utilities and forms for hover, active, selected, disabled, and focus states.

```css
--state-hover-bg: light-dark(dark 6%, white 6%) /* row hover, button hover */
	--state-active-bg: light-dark(dark 10%, white 10%) /* pressed state */ --state-selected-bg: accent
	12% /* selected row, active tab */ --state-disabled-bg: light-dark(dark 5%, white 5%)
	/* disabled input background */ --state-disabled-text: var(--text-muted) /* disabled text */
	--state-focus-ring: var(--brand-accent) /* focus outline color */;
```

---

## 16. Form semantic aliases

Single-point overrides for all form controls. Change these to restyle every input, select, and textarea at once.

```css
--field-bg: var(--surface-raised) --field-border: var(--border-structural)
	--field-border-hover: light-dark(dark 30%, white 30%) --field-border-invalid: var(--color-danger)
	--field-placeholder: var(--text-muted) --field-help-text: var(--text-secondary)
	--field-error-text: var(--color-danger);
```

---

## Opacity rule

**Do not use `opacity` to create translucent colors.** Use `color-mix()` instead:

```css
/* Wrong */
background: var(--brand-accent);
opacity: 0.15;

/* Right */
background: color-mix(in oklch, var(--brand-accent) 15%, transparent);
```

The `opacity` shortcut makes children translucent too, which is almost never what you want.

**`opacity` is allowed for:**

- Whole-element fade transitions (modal enter/exit, backdrop, tooltip appear)
- Skeleton / pulse animations (the whole element dims)
- Disabled controls — `opacity: 0.5` on `.input:disabled` dims the whole control including its placeholder and icons, which is the correct visual treatment

---

## color-mix() syntax

```css
color-mix(in oklch, <color> <percentage>%, transparent)
```

Examples:

```css
/* 20% brand-accent tint */
background: color-mix(in oklch, var(--brand-accent) 20%, transparent);

/* Derive a border from surface-ground with 15% dark mixed in */
border-color: color-mix(in oklch, var(--brand-dark) 15%, transparent);
```

The `in oklch` color space produces perceptually even mixes without the muddy midpoints that `in srgb` creates.

---

## light-dark() syntax

```css
var-name: light-dark(<light-value>, <dark-value>);
```

Requires `color-scheme: light dark` on `:root` (already set in `tokens.css`). The value resolves automatically based on OS preference or the manual `data-theme` attribute set by the anti-FOUC script in `app.html`.

```css
/* Manual theme override — set by JS toggle */
:root[data-theme='light'] {
	color-scheme: light;
}
:root[data-theme='dark'] {
	color-scheme: dark;
}
```
