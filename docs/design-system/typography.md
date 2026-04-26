# Typography

Permanent reference for font loading, CSS tokens, and typography decisions in this template. See [ADR-010](../planning/adrs/ADR-010-typography-and-font-loading.md) for the rationale.

---

## Default font pair

| Role | Font | Package |
|------|------|---------|
| UI / body (`--font-sans`) | Plus Jakarta Sans Variable | `@fontsource-variable/plus-jakarta-sans` |
| Code / mono (`--font-mono`) | JetBrains Mono Variable | `@fontsource-variable/jetbrains-mono` |

This pair works well for SaaS products, marketing sites, and developer tools. Both are open-source variable fonts with a wide weight range.

---

## How fonts are loaded

### Open-source fonts → Fontsource

Open-source fonts are self-hosted via [Fontsource](https://fontsource.org/) variable packages. Install and import once globally.

**Install:**
```bash
bun add @fontsource-variable/plus-jakarta-sans
bun add @fontsource-variable/jetbrains-mono
```

**Import in `src/app.css` (already done in this template):**
```css
@import '@fontsource-variable/plus-jakarta-sans';
@import '@fontsource-variable/jetbrains-mono';
```

Fontsource bundles the font files and injects the `@font-face` rules at build time. No CDN request, no render blocking, no GDPR concerns.

**Do not preload Fontsource fonts.** Fontsource generates hashed filenames that change on package updates. A preload tag with a stale hash serves no benefit and can create a failed fetch. Only the `@import` in `app.css` is needed.

### Paid / proprietary fonts → self-hosted in `static/fonts/`

If a project uses a paid or proprietary typeface:

1. Obtain the `.woff2` file(s) from the foundry. Use only `woff2` — all modern browsers support it.
2. Place them in `static/fonts/` (the `.gitkeep` file holds the directory).
3. Write an `@font-face` declaration in `tokens.css` (in the fonts section, above the `--font-sans` token):

```css
@font-face {
  font-family: 'Acme Sans';
  src: url('/fonts/acme-sans-var.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
```

4. Update the `--font-sans` token to reference it:
```css
--font-sans: 'Acme Sans', ui-sans-serif, system-ui, sans-serif;
```

5. **Optionally preload the primary above-the-fold font** — only for manually-hosted fonts where you control the filename:
```html
<!-- In src/app.html, inside <head> -->
<link rel="preload" href="/fonts/acme-sans-var.woff2" as="font" type="font/woff2" crossorigin />
```

Only preload the primary body font. Do not preload display fonts or mono fonts used only for code blocks.

---

## CSS tokens

Font tokens live in `tokens.css` under section 5 (Fonts):

```css
--font-sans: 'Plus Jakarta Sans Variable', ui-sans-serif, system-ui, sans-serif;
--font-mono: 'JetBrains Mono Variable', ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace;
```

**Rules:**
- Always reference `var(--font-sans)` and `var(--font-mono)` in CSS — never hardcode font names in component CSS.
- `body` uses `var(--font-sans)` (set in `reset.css`).
- `code`, `pre`, `kbd`, `samp` use `var(--font-mono)` (set in `base.css`).
- Form controls (`input`, `button`, `textarea`, `select`) inherit `font` from the body (set in `reset.css`).

---

## Per-site font switching checklist

When starting a new project from this template and swapping fonts:

1. Install the replacement Fontsource package (open-source) or add `.woff2` to `static/fonts/` (proprietary).
2. Update the `@import` line(s) in `src/app.css` to reference the new package.
3. Update `--font-sans` and/or `--font-mono` in `tokens.css`.
4. If using a manually-hosted font, add the `@font-face` declaration in `tokens.css`.
5. Only add a `<link rel="preload">` in `app.html` for manually-hosted primary fonts.
6. Delete the unused Fontsource package: `bun remove @fontsource-variable/[old-package]`.
7. Run `bun run build` and verify no font-related console warnings.
8. Check rendered output in the browser — variable fonts need a `font-weight` range to animate correctly.

---

## Type scale and weight tokens

The full type scale lives in `tokens.css` (section 6). Key tokens:

```css
--text-xs:   0.75rem;   /* 12px */
--text-sm:   0.875rem;  /* 14px */
--text-base: 1rem;      /* 16px — body default */
--text-lg:   1.125rem;  /* 18px */
--text-xl:   1.25rem;   /* 20px */
--text-2xl:  1.5rem;    /* 24px */
--text-3xl:  1.875rem;  /* 30px */
--text-4xl:  2.25rem;   /* 36px */
--text-5xl:  3rem;      /* 48px */

--weight-normal:   400;
--weight-medium:   500;
--weight-semibold: 600;
--weight-bold:     700;
```

Fluid scales for hero text: `--text-fluid-3xl` through `--text-fluid-5xl` (clamp-based).

---

## Agent rules — do not do these

- **Never** add a `<link rel="preload">` for a Fontsource font — filenames are hashed and can become stale.
- **Never** use a remote Google Fonts `<link>` — adds a network round-trip, creates CDN dependency, raises GDPR concerns.
- **Never** hardcode a font family name in component CSS. Always use `var(--font-sans)` or `var(--font-mono)`.
- **Never** import Fontsource in a component — import once in `src/app.css` only.
- **Never** keep `woff`, `ttf`, or `eot` fallback formats. Modern browsers use `woff2` only.
- **Never** use GIF for animation — see images.md.
- **Never** add a display font as a default in the template. Display fonts are per-project choices.
- **Never** preload the mono font — it is only used for code blocks and does not affect above-the-fold rendering.
