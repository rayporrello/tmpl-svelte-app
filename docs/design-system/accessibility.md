# Accessibility Patterns

This document catalogs the a11y patterns built into the template. These are baseline behaviors — every project built from this template inherits them without additional setup.

---

## Skip Link

`src/routes/+layout.svelte` — first element in the DOM.

```html
<a href="#main-content" class="skip-link">Skip to main content</a>
```

The skip link is visually hidden off-screen by default (positioned at `top: -5rem`) and slides into view when it receives focus. It points to `<main id="main-content">`, the landmark that wraps all page content.

**Why:** Screen reader users and keyboard-only users can bypass the repeated header navigation on every page load. This is a WCAG 2.1 SC 2.4.1 (Bypass Blocks) requirement at Level A.

**CSS location:** `.skip-link` rule in `+layout.svelte` `<style>` block. `transition: top` is driven by `--duration-fast` and `--ease-decel` tokens; `prefers-reduced-motion` suppresses it automatically via `animations.css`.

---

## Focus Visible

`src/lib/styles/base.css`

All interactive elements use `:focus-visible` (not `:focus`) so only keyboard-driven focus shows a visible ring — mouse clicks do not trigger the ring, which is the expected UX.

```css
:focus-visible {
	outline: 2px solid var(--border-focus);
	outline-offset: 2px;
}
```

`--border-focus` maps to `--brand-accent` (mint/teal), which meets WCAG AA contrast against most surfaces the template ships with.

**Why:** `:focus` shows rings on mouse click (annoying for pointer users); `:focus-visible` restricts ring to keyboard navigation, matching browser native behavior and WCAG 2.1 SC 2.4.11 (Focus Appearance, Level AA).

---

## Reduced Motion

`src/lib/styles/animations.css`

```css
@media (prefers-reduced-motion: reduce) {
	*,
	*::before,
	*::after {
		animation-duration: 0.01ms !important;
		animation-iteration-count: 1 !important;
		transition-duration: 0.01ms !important;
	}
}
```

This suppresses all CSS transitions and animations for users with `prefers-reduced-motion: reduce` set in their OS. Custom animations authored via `@keyframes` or `transition` are covered by this rule.

**Why:** Motion can trigger vestibular disorders. WCAG 2.1 SC 2.3.3 (Animation from Interactions, Level AAA) and widely supported as a practical baseline even at AA.

---

## Semantic HTML Contract

See `docs/design-system/semantic-html-guide.md` and `ADR-008` for the full contract.

Key rules this template enforces:

- **One `<h1>` per page** — the `<h1>` lives in the page route, not the layout. The layout provides only navigation landmarks.
- **Landmark regions:** `<header>`, `<nav aria-label="...">`, `<main id="main-content">`, `<footer>` are present in every page via the root layout.
- **`<article>` wraps article content** — the `/articles/[slug]` route wraps rendered markdown in a semantic `<article>` element.
- **`<time datetime="...">` for dates** — the article page uses a machine-readable `datetime` attribute.
- **`aria-label` on all `<nav>` elements** — distinguishes Primary, Footer, and any in-page navigation.

---

## Color Contrast

The design token system in `src/lib/styles/tokens.css` uses semantic tokens:

| Token              | Light                  | Dark            | Notes                                        |
| ------------------ | ---------------------- | --------------- | -------------------------------------------- |
| `--text-primary`   | `--brand-dark` (18% L) | `--brand-white` | Highest contrast                             |
| `--text-secondary` | `oklch(45% 0.04 260)`  | 70% white       | ≥ 4.5:1 on brand-light bg                    |
| `--text-muted`     | `oklch(50% 0.03 260)`  | 40% white       | Use for decorative / non-essential text only |

**Do not use `--text-muted` for informational content** — it is intentionally near the contrast threshold. Reserve it for decorative or supplementary text (e.g. character counts, timestamps where a formatted date is already present).

Axe accessibility tests run on home, `/articles/sample-post`, and `/styleguide` as part of `bun run test:e2e`. Zero violations are required for `validate:ci` to pass.

---

## ARIA and Role Usage

- Use semantic HTML elements before reaching for ARIA. `<button>` beats `<div role="button">`.
- `aria-label` is required on icon-only buttons and links.
- `aria-label` is required on every `<nav>` element to distinguish landmarks.
- `aria-hidden="true"` on decorative SVGs and icons that have adjacent visible labels.
- Do not use `role="presentation"` to suppress table semantics unless the table is purely layout (layout tables should not exist in this template — use CSS grid/flex).

---

## Testing

Accessibility tests run as part of the Playwright smoke suite (`tests/e2e/smoke.spec.ts`):

```
bun run test:e2e
```

The axe-core integration (`@axe-core/playwright`) runs a full ruleset scan on three pages in `bun run validate:ci`. Any axe violation blocks CI — this is intentional so accessibility regressions surface at PR time, not in production.

For manual testing: keyboard-only navigation, screen reader testing (VoiceOver, NVDA), and browser zoom to 200% are the recommended complement to automated scanning.
