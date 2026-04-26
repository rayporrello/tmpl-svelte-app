# ADR-011 — Built-In SEO System

**Status:** Accepted  
**Date:** 2026-04-26

---

## Context

Every website produced from this template needs SEO infrastructure: a canonical title and description per page, Open Graph tags, a sitemap, a robots.txt, and structured data (JSON-LD schema). Without built-in infrastructure, each project re-implements this from scratch, inconsistently, and often incompletely. Agent-generated code is especially prone to hardcoded domains, missing canonicals, and copy-pasted schema.

The question was not whether to include SEO but how — as a checklist, as a plugin dependency, or as first-class template infrastructure.

---

## Decision

The template ships with a complete, built-in SEO system. It is not optional and not a launch checklist item. It is wired infrastructure that every project inherits.

### Components

| File | Role |
|------|------|
| `src/lib/config/site.ts` | Single source of truth for domain, name, OG image, org, locale |
| `src/lib/seo/types.ts` | TypeScript types for per-page SEO input and resolved metadata |
| `src/lib/seo/metadata.ts` | Pure helpers: canonical URL, image URL, title template, robots directive |
| `src/lib/seo/schemas.ts` | JSON-LD helpers: Organization, WebSite, Article, Breadcrumb, Person, LocalBusiness, FAQ |
| `src/lib/seo/routes.ts` | Static route registry — every route declared with `indexable` flag |
| `src/lib/seo/sitemap.ts` | Generates `sitemap.xml` XML from the route registry |
| `src/lib/components/seo/SEO.svelte` | Svelte component: renders title, meta, canonical, OG, Twitter, JSON-LD |
| `src/routes/sitemap.xml/+server.ts` | Prerendered sitemap endpoint |
| `src/routes/robots.txt/+server.ts` | Prerendered robots.txt endpoint (respects `site.indexing` flag) |
| `src/routes/llms.txt/+server.ts` | Prerendered AI-readable site description |
| `scripts/check-seo.ts` | Validation script — fails on placeholder values and indexability errors |

### Page contract

Every new public route must:
1. Use the `SEO` component with `title`, `description`, and `canonicalPath`.
2. Be registered in `src/lib/seo/routes.ts` with `indexable` declared.

Internal/admin/dev routes must use `robots: 'noindex, nofollow'` and `indexable: false`.

### Per-project customization

`src/lib/config/site.ts` is the only file that must change per project. All other SEO files derive from it. `bun run check:seo` fails if `site.url` is still `https://example.com`.

---

## Rationale

**SEO must be automatic, consistent, and agent-enforced — not manually remembered.**

- Developers and AI agents forget SEO. Built-in infrastructure removes the memory burden.
- A central config file eliminates the hardcoded-domain problem that recurs when schema and meta tags are written by hand or by agents.
- A static route registry makes sitemap generation deterministic and makes indexability errors machine-detectable.
- The `check-seo.ts` script converts a launch checklist item into a failing build signal.
- Keeping all SEO in code (not a CMS or external service) means the system works without any external dependencies.

---

## Consequences

- **Every project must update `site.ts`** before deploying. `check:seo` will loudly fail otherwise.
- **Every new route must be registered** in `routes.ts`. This is a small, explicit step that makes indexability decisions visible and reviewable.
- **Schema helpers must be used only when visible content supports them.** The helpers include comments documenting this. The onus is on the developer/agent to not misuse them.
- **The root layout injects Organization and WebSite schema** on every page. Individual pages add their own schema on top. Agents must not duplicate root schema in page components.
- **Sitemap and robots.txt are prerendered** — they are static files in the build output, not dynamic responses.

---

## Rejected alternatives

### Per-page hand-authored meta tags

Every `+page.svelte` writing its own `<svelte:head>` block with hard-coded domain strings. This is what happens without a system. It produces inconsistent, unmaintainable markup and is the source of most SEO regressions in hand-built sites.

**Rejected:** Too error-prone. Agents copy-paste incorrect domains. No validation is possible.

### External SEO plugin dependency

An npm package that provides a component, sitemap generator, and schema helpers.

**Rejected:** Adds an external dependency for something this template can own directly with ~300 lines of TypeScript. Also constrains the schema model to the plugin's opinions. Given the template's philosophy of minimal dependencies, this is a poor trade.

### Treating SEO as a launch checklist only

Documenting what to do without enforcing it. Provided a checklist in `docs/seo/launch-checklist.md` but did not wire it into the code.

**Rejected:** Checklists are ignored under deadline pressure. A failing `check:seo` script is not ignorable. The goal is to make the correct thing happen automatically, not to document the correct thing and hope.
