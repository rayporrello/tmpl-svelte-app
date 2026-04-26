# ADR-008 — Semantic HTML Contract

**Status:** Accepted
**Date:** 2026-04-26

## Decision

Semantic HTML and the section/container pattern are part of the template contract. All pages built from this template must use semantically correct HTML by default.

## Context

This template is used to build websites that are:

- Indexed by search engines
- Consumed by users of assistive technology
- Generated and modified by LLM coding agents

Div-heavy markup degrades SEO, accessibility, and LLM predictability. A clear, enforced semantic contract gives both humans and agents a reliable, correct structure to follow without per-project negotiation.

The template already had strong CSS conventions. This ADR adds the equivalent HTML-layer contract.

## Rules

1. Use the most specific semantic element available.
2. A `div` is acceptable only for layout-only wrappers with no semantic meaning (e.g., `.container`).
3. Every page has exactly one `<main id="main-content">` — provided by `+layout.svelte`.
4. Every site has a skip-to-content link before the header — provided by `+layout.svelte`.
5. The site shell follows: skip link → `<header>` → `<main>` → `<footer>`.
6. Page sections use the two-layer pattern: outer `<section>` / inner `.container`.
7. Every thematic section has a heading.
8. Meaningful images and media are `<img>` or `<video>` elements wrapped in `<figure>`.
9. CSS `background-image` is reserved for decorative visuals only.
10. Heading hierarchy is logical: one page `<h1>`, no skipped levels.
11. Reusable components use container queries for responsive layout.
12. Page-shell and section-level viewport layout uses `@media`.

## Implementation

- `src/lib/components/Section.svelte` — wraps `<section>` + inner `.container`
- `src/routes/+layout.svelte` — provides the full site shell (skip link, header, main, footer)
- `docs/design-system/semantic-html-guide.md` — full reference for humans and agents
- `docs/design-system/llm-html-rules.md` — concise rule set suitable for agent prompts
- `src/routes/styleguide/+page.svelte` — live demonstrations of all semantic patterns

## Consequences

- `Section.svelte` is the standard way to add thematic page sections.
- `<main id="main-content">` lives in `+layout.svelte` — pages must not add a second `<main>`.
- Figures are the default wrapper for meaningful images and media.
- Container queries handle component-level responsiveness; `@media` handles page-level shell decisions.
- Divs are allowed only for layout wrappers (`.container`, `.form-grid`, grid wrappers, etc.).
- Self-contained content units (blog posts, news items, product cards) use `<article>`.
- Key-value metadata uses `<dl>`, not tables or div stacks.
- Disclosure widgets use `<details>`/`<summary>`, not custom JS toggles.
- Dates use `<time datetime="...">`.
- Complementary content uses `<aside>`.
- Navigation links use `<a href="...">`, not `<button>` or `<div>`.
- Actions use `<button type="button">`, not `<a>` or `<div>`.

## Rejected

- **Div-heavy component markup** — generates inaccessible, SEO-poor pages that are hard for LLMs to reason about
- **CSS background images for content images** — images hidden from assistive technology and search engines
- **Vertical rhythm on `.container`** — rhythm belongs on the outer `<section>`, keeping container purely structural
- **Page title (`<h1>`) in the site header** — site name in the header is a link or span, not a heading
- **App-shell / site-shell split** — this template is for websites, not web applications; a single `+layout.svelte` shell is the right level of abstraction
- **Custom JS-driven disclosure widgets** — `<details>`/`<summary>` is sufficient for FAQ and toggle patterns in website contexts
