# Semantic HTML Guide

The semantic HTML contract for this template. Read this before writing any markup. For LLM agents, a shorter rule-only version is in [llm-html-rules.md](llm-html-rules.md).

---

## Core rule

**Use the most specific semantic element available.** Ask: does an HTML element exist that communicates the meaning of this content? If yes, use it. Reach for a `<div>` only when no semantic element fits.

---

## Page shell structure

Every page built from this template has this structure, provided by `+layout.svelte`:

```html
<a href="#main-content" class="skip-link">Skip to main content</a>

<header class="site-header">
  <div class="container">
    <a href="/" class="site-logo">[Site Name]</a>
    <nav aria-label="Primary">…</nav>
  </div>
</header>

<main id="main-content">
  <!-- Page content renders here via {@render children()} -->
</main>

<footer class="site-footer">
  <div class="container">
    <nav aria-label="Footer">…</nav>
    …
  </div>
</footer>
```

Rules:
- Exactly one `<main id="main-content">` per page. It lives in `+layout.svelte`. Pages must not add a second `<main>`.
- The skip link is the first element in the DOM, before the header.
- The site name / logo in the header is an `<a>` (link to home), never an `<h1>`.
- Both nav elements carry an `aria-label` so screen readers can distinguish them.

---

## Section / container pattern

Every thematic block inside `<main>` is a section. Use the two-layer pattern:

```html
<section id="hero">          <!-- full-bleed background, vertical rhythm, gutter -->
  <div class="container">   <!-- centered, max-width content -->
    <h2>Section heading</h2>
    …
  </div>
</section>
```

Or use the `Section` component, which wraps this pattern:

```svelte
<Section id="hero" width="default">
  <h2>Section heading</h2>
  …
</Section>
```

`Section` props:

| Prop | Type | Default | Effect |
|------|------|---------|--------|
| `id` | string | — | Sets `id` on the `<section>` element |
| `class` | string | — | Sets `class` on the `<section>` element |
| `width` | `'default' \| 'narrow' \| 'wide' \| 'full'` | `'default'` | Controls `.container` width variant |

Width variants:
- `default` → `max-width: var(--content-width)` — 72rem / 1152px
- `narrow` → `max-width: var(--content-narrow)` — 48rem / 768px
- `wide` → `max-width: var(--content-wide)` — 80rem / 1280px
- `full` → `max-width: none`

Rules:
- Vertical rhythm (`padding-block: var(--section-space)`) belongs on the `<section>`, not the `.container`.
- Background color/image belongs on the `<section>`.
- The `.container` is purely structural — it centers and constrains width.
- Every thematic section must have a heading.

---

## Heading hierarchy

One `<h1>` per page. It is the page title, not the site name.

```html
<!-- In the first section of each page -->
<h1>Page Title</h1>

<!-- Section headings -->
<h2>Section Name</h2>

<!-- Subsection headings -->
<h3>Subsection Name</h3>
```

Rules:
- One `<h1>` per page — always the first heading a user encounters.
- No skipped levels: do not jump from `<h2>` to `<h4>`.
- The site name / logo in `<header>` is an `<a>`, not an `<h1>`.
- Heading level communicates hierarchy, not visual size. Use utility classes (`.text-2xl`) or component-scoped CSS if you need a different visual size.

---

## Image and media rules

Meaningful images and media are real elements, not CSS backgrounds:

```html
<!-- Always: meaningful image wrapped in figure -->
<figure>
  <img src="..." alt="Descriptive alt text" width="800" height="600" />
  <figcaption>Caption providing context for the image.</figcaption>
</figure>

<!-- Decorative image: alt="" (empty, not omitted) -->
<img src="decorative.svg" alt="" width="24" height="24" />

<!-- Quote with attribution -->
<figure>
  <blockquote>
    Good design is as little design as possible.
  </blockquote>
  <figcaption>— <cite>Dieter Rams</cite></figcaption>
</figure>

<!-- Video -->
<figure>
  <video src="..." controls></video>
  <figcaption>Caption for the video.</figcaption>
</figure>
```

Rules:
- CSS `background-image` is for decorative visuals only — it is invisible to assistive technology and search engines.
- Always include `width` and `height` attributes on `<img>` to prevent layout shift.
- Decorative images use `alt=""` (empty string, not omitted).
- Meaningful images use descriptive `alt` text.
- `<figcaption>` is optional but should be included when a caption adds value.
- `<figure>` is the default wrapper for images, video, code blocks, and quoted content.

---

## The div rule

A `<div>` is a last resort. It has no semantic meaning — it adds nothing to the document outline or accessibility tree.

Acceptable uses:
- The inner `.container` div in the section/container pattern
- Grid or flex wrappers with no semantic intent
- Layout-only grouping when no semantic element fits

Never use `<div>` for:
- Navigation → `<nav>`
- Page header → `<header>`
- Page footer → `<footer>`
- Self-contained content → `<article>`
- Thematic section → `<section>`
- Image wrapper → `<figure>`
- Sidebar/supplementary content → `<aside>`
- Date/time → `<time>`
- Form controls → `<input>`, `<select>`, `<textarea>`, `<button>`

---

## Semantic element reference

| Use case | Element | Notes |
|----------|---------|-------|
| Page title | `<h1>` | One per page |
| Section heading | `<h2>` | One per thematic block |
| Subsection heading | `<h3>`, `<h4>` | No skipped levels |
| Page header shell | `<header>` | Contains logo + nav |
| Page footer shell | `<footer>` | Contains nav + meta |
| Main content area | `<main id="main-content">` | One per page; in layout |
| Site navigation | `<nav aria-label="Primary">` | Labeled for AT |
| Footer navigation | `<nav aria-label="Footer">` | Labeled for AT |
| Thematic section | `<section>` | Must have a heading |
| Self-contained unit | `<article>` | Blog post, news item, product card |
| Complementary content | `<aside>` | Sidebars, callout boxes |
| Meaningful image/media | `<figure>` | With optional `<figcaption>` |
| Caption for figure | `<figcaption>` | Inside `<figure>` |
| Quote | `<blockquote>` | Attribution in `<figcaption>` |
| Citation | `<cite>` | Author/source of a quote |
| Key-value data | `<dl>`, `<dt>`, `<dd>` | Metadata, definitions |
| Date / time | `<time datetime="...">` | Machine-readable datetime |
| Disclosure widget | `<details>`, `<summary>` | FAQ, accordion |
| Navigation link | `<a href="...">` | Must have a destination |
| Action button | `<button type="button">` | No href |
| Submit button | `<button type="submit">` | Inside a `<form>` |
| Abbreviation | `<abbr title="...">` | With expansion in title |
| Highlighted text | `<mark>` | Search results, key terms |
| Code snippet | `<code>` | Inline code |
| Code block | `<pre><code>` | Block code |

---

## Breakpoint strategy

**Container queries for components. Media queries for page shell.**

```css
/* Component responds to its available space, not the viewport */
.card-grid {
  container-type: inline-size;
}

@container (inline-size >= 40rem) {
  .card-grid { grid-template-columns: repeat(2, 1fr); }
}

/* Page shell decisions: nav collapse, hero layout */
@media (width >= 48rem) {
  .site-header .container { flex-direction: row; }
}
```

The `.container-inline` utility class sets `container-type: inline-size`. Use it on any wrapper that should expose a container context to child components.

---

## Pre-generation checklist

Before finalizing any HTML:

- [ ] Page has exactly one `<main id="main-content">`
- [ ] Page has exactly one `<h1>` (the page title, not the site name)
- [ ] Skip link is present in `+layout.svelte` before the `<header>`
- [ ] Heading levels are sequential — no skipped levels
- [ ] Every thematic section has a heading
- [ ] Meaningful images use `<figure>` + `<img>` with `alt` text
- [ ] Decorative images use `alt=""` (not omitted)
- [ ] Dates use `<time datetime="...">`
- [ ] Complementary/aside content uses `<aside>`
- [ ] Navigation links use `<a href="...">`, actions use `<button>`
- [ ] Key-value metadata uses `<dl>`, `<dt>`, `<dd>`
- [ ] Disclosure widgets use `<details>` / `<summary>`
- [ ] No `<div>` is used where a semantic element exists
- [ ] No `<h1>` appears in the site header
- [ ] Both `<nav>` elements have `aria-label` attributes
