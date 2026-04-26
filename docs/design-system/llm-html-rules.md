# LLM HTML Rules

Non-negotiable HTML rules for AI agents generating markup in this template. Keep this short; full explanations are in [semantic-html-guide.md](semantic-html-guide.md).

---

## Mandatory rules

1. **Use the most specific semantic element.** If an HTML element communicates the meaning, use it.
2. **One `<main id="main-content">` per page.** It is in `+layout.svelte`. Never add a second one.
3. **One `<h1>` per page.** It is the page title. Never put an `<h1>` in `<header>`.
4. **No skipped heading levels.** h1 → h2 → h3. Never h1 → h3.
5. **Every `<section>` must have a heading.**
6. **Meaningful images use `<figure>` + `<img alt="...">`.** Never CSS `background-image` for content images.
7. **Decorative images use `alt=""`.** The attribute must be present and empty, not omitted.
8. **All `<nav>` elements carry `aria-label`.** `aria-label="Primary"`, `aria-label="Footer"`, etc.
9. **Links navigate. Buttons act.** Never style a `<div>` or `<a>` to function as a button, and never use `<button>` for navigation.
10. **Use `Section.svelte` for thematic page sections.** It wraps `<section>` + `.container`.

---

## Forbidden patterns → replacements

| Forbidden | Use instead |
|-----------|-------------|
| `<div class="header">` | `<header>` |
| `<div class="nav">` | `<nav aria-label="...">` |
| `<div class="footer">` | `<footer>` |
| `<div class="main">` | `<main id="main-content">` |
| `<div class="article">` | `<article>` |
| `<div class="section">` | `<section>` |
| `<div class="aside">` | `<aside>` |
| `<div class="figure">` | `<figure>` |
| `<span>April 26, 2026</span>` | `<time datetime="2026-04-26">April 26, 2026</time>` |
| `<div class="button" onclick="...">` | `<button type="button">` |
| `<button onclick="navigate()">` | `<a href="...">` |
| `<h1>` in site header | `<a href="/" class="site-logo">` |
| Image in `background-image` | `<figure><img src="..." alt="..."></figure>` |
| `<div class="quote">` | `<figure><blockquote>…</blockquote><figcaption>—</figcaption></figure>` |
| `<div class="key-value">` | `<dl><dt>…</dt><dd>…</dd></dl>` |
| `<div class="faq-item">` | `<details><summary>…</summary><p>…</p></details>` |

---

## Section pattern

```svelte
<!-- Use Section.svelte -->
<Section id="hero" width="default">
  <h2>Section heading</h2>
  <p>…</p>
</Section>

<!-- Or the raw pattern -->
<section id="hero">
  <div class="container">
    <h2>Section heading</h2>
    <p>…</p>
  </div>
</section>
```

Never put `padding-block` or rhythm on `.container`. Rhythm belongs on `<section>`.

---

## Heading rules

```html
<!-- One per page, in the first section -->
<h1>Page Title</h1>

<!-- Section headings -->
<h2>Feature Overview</h2>
  <h3>Subsection</h3>
    <h4>Detail</h4>

<!-- Never skip levels -->
<!-- Wrong: h1 → h4 -->
<!-- Right: h1 → h2 → h3 → h4 -->
```

---

## Image rules

### Decision — which component?

One question before writing any image markup:

> **Is this image's path known at build time?**

| Answer | Folder | Component | Import |
|--------|--------|-----------|--------|
| **Yes** — committed file, referenced in code | `src/lib/assets/` | `<enhanced:img>` | `import img from '$lib/assets/file.jpg'` |
| **No** — runtime string from CMS, DB, or upload | `static/uploads/` | `<CmsImage>` | `import CmsImage from '$lib/components/CmsImage.svelte'` |

Default to `<enhanced:img>` unless there is a runtime-path reason for `<CmsImage>`. When in doubt, ask. This is not about who created the image — it is about whether Vite can resolve the path at build time.

### Required attributes — always, on every image

```
alt     — describe what is in the image; use alt="" for decorative
width   — display width in CSS pixels (not the source file dimensions)
height  — display height in CSS pixels
```

Use standard dimensions from `docs/design-system/images.md` → Standard image sizes. For `<enhanced:img>` (Tier 1), `width`/`height` should match the source file so the plugin generates the right srcset. For `<CmsImage>` (Tier 2), use the expected display size.

| Use case | `width` attr | `height` attr |
|----------|-------------|--------------|
| Hero / full-bleed | 1920 | 960 |
| Section feature | 1600 | 900 |
| Article featured | 1200 | 630 |
| Card (2–3/row) | 800 | 450 |
| Team headshot | 400 | 400 |

Add `sizes="100vw"` to full-bleed images.

If the slot does not match a standard, ask for the correct display dimensions or use the nearest standard as a placeholder and flag it. Never omit `width` and `height`.

### LCP check — ask before every hero image

If the image is the first large visible element on page load (hero, banner, full-width feature):

```svelte
loading="eager"
fetchpriority="high"
```

If below the fold: nothing. `loading="lazy"` is the default in both components.

### Full patterns

```svelte
<!-- Brand image, meaningful — always wrap in <figure> -->
<script>
  import teamPhoto from '$lib/assets/team.jpg';
</script>
<figure>
  <enhanced:img src={teamPhoto} alt="Description" width={1200} height={800} />
  <figcaption>Caption text.</figcaption>
</figure>

<!-- CMS upload, meaningful -->
<script>
  import CmsImage from '$lib/components/CmsImage.svelte';
</script>
<figure>
  <CmsImage src="/uploads/team.jpg" alt="Description" width={1200} height={800} />
  <figcaption>Caption text.</figcaption>
</figure>

<!-- Hero / LCP — eager + high priority -->
<enhanced:img
  src={hero}
  alt="..."
  width={1440}
  height={600}
  loading="eager"
  fetchpriority="high"
/>

<!-- Decorative — alt="" present and empty, never omitted -->
<img src="/icons/wave.svg" alt="" width={24} height={24} />

<!-- Quote with attribution -->
<figure>
  <blockquote>The quote text.</blockquote>
  <figcaption>— <cite>Author Name</cite></figcaption>
</figure>
```

### Never

- Do not use plain `<img>` for brand or CMS images without a documented reason
- Do not put CMS uploads in `src/lib/assets/` — the Vite plugin cannot process `static/` files
- Do not add `loading="lazy"` to a hero or LCP image
- Do not omit `width` and `height` — use placeholders and flag them if unknown
- Do not use `background-image` for meaningful content images

---

## Button vs link rules

```html
<!-- Navigation: always <a> -->
<a href="/about">About</a>
<a href="/contact" class="btn-primary">Contact us</a>

<!-- Actions: always <button> -->
<button type="button">Open menu</button>
<button type="submit">Send message</button>

<!-- Never -->
<div onclick="navigate()">…</div>          <!-- wrong -->
<a onclick="doAction()">Click me</a>       <!-- wrong: action, not navigation -->
<button onclick="location.href='/'">…</button> <!-- wrong: use <a> -->
```

---

## Pre-generation checklist

Before submitting any HTML output:

- [ ] One `<main id="main-content">` in the layout (not the page)
- [ ] One `<h1>` per page
- [ ] No `<h1>` in the site `<header>`
- [ ] Skip link present in `+layout.svelte`
- [ ] Heading levels are sequential
- [ ] Every `<section>` has a heading
- [ ] Meaningful images use `<figure>` + the correct component (`<enhanced:img>` or `<CmsImage>`)
- [ ] Decorative images have `alt=""`
- [ ] Every image has `width` and `height` (use placeholders and flag if unknown)
- [ ] Hero / first visible image uses `loading="eager" fetchpriority="high"`
- [ ] Dates use `<time datetime="...">`
- [ ] Navigation links use `<a href="...">`, actions use `<button>`
- [ ] Both `<nav>` elements have `aria-label`
- [ ] No div used where a semantic element exists
