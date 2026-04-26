# SEO System

SEO is built into this template. It is not optional and not a checklist item — it is infrastructure wired into the route system.

## What ships with the template

| File | Purpose |
|------|---------|
| `src/lib/config/site.ts` | Single source of truth for site name, domain, OG image, organization, locale |
| `src/lib/seo/types.ts` | TypeScript types for page and resolved SEO metadata |
| `src/lib/seo/metadata.ts` | Helpers: canonical URL, image URL, title template, robots directive |
| `src/lib/seo/schemas.ts` | JSON-LD schema helpers: Organization, WebSite, Article, Breadcrumb, Person, LocalBusiness, FAQ |
| `src/lib/seo/routes.ts` | Static route registry — declares every route and its indexability |
| `src/lib/seo/sitemap.ts` | Generates `sitemap.xml` content from the route registry |
| `src/lib/components/seo/SEO.svelte` | Svelte component — renders all head tags for a page |
| `src/routes/sitemap.xml/+server.ts` | Prerendered `/sitemap.xml` endpoint |
| `src/routes/robots.txt/+server.ts` | Prerendered `/robots.txt` endpoint |
| `src/routes/llms.txt/+server.ts` | Prerendered `/llms.txt` endpoint for AI discovery |
| `scripts/check-seo.ts` | Validation script — fails on placeholder values and indexability errors |

## How to add a new public route

1. **Add the route to the registry** in [src/lib/seo/routes.ts](../../src/lib/seo/routes.ts):

```ts
{ path: '/about', indexable: true, changefreq: 'monthly', priority: 0.8 }
```

2. **Add the SEO component** to the route's `+page.svelte`:

```svelte
<script lang="ts">
  import SEO from '$lib/components/seo/SEO.svelte';
</script>

<SEO seo={{
  title: 'About Us',
  description: 'Learn about our company and team.',
  canonicalPath: '/about'
}} />
```

That is the minimum. `title`, `description`, and `canonicalPath` are required. Everything else defaults from `site.ts`.

## How to configure for a new project

Open [src/lib/config/site.ts](../../src/lib/config/site.ts) and replace all placeholder values:

```ts
export const site: SiteConfig = {
  name: 'Acme Corp',
  url: 'https://acme.com',
  defaultTitle: 'Acme Corp — Build Better',
  titleTemplate: '%s — Acme Corp',
  defaultDescription: 'Acme Corp makes tools that help teams move faster.',
  defaultOgImage: '/images/og-default.png',
  locale: 'en_US',
  indexing: true,
  organization: {
    name: 'Acme Corp',
    logo: 'https://acme.com/images/logo.png',
    sameAs: ['https://twitter.com/acmecorp']
  }
};
```

`bun run check:seo` will fail if `url` is still `https://example.com` or `name` is `Your Site Name`.

## Non-indexable routes

Routes that must never appear in search results:

- `/styleguide` — design system demo
- `/admin` — CMS admin
- `/preview` — draft preview
- `/draft/*` — any draft-like path

Add `indexable: false` in `routes.ts` and pass `robots: 'noindex, nofollow'` to the SEO component.

`scripts/check-seo.ts` will error if any of these paths are accidentally marked indexable.

## Validation

```bash
bun run check:seo
```

This script checks that:
- `site.url` is not `https://example.com`
- `site.name` and `site.defaultTitle` are not placeholder values
- `site.defaultDescription` exists and is non-trivial
- `site.defaultOgImage` is set
- SEO source files do not contain hardcoded `yourdomain.com`
- `/styleguide`, `/admin`, `/preview`, `/draft` routes are not marked indexable

Run this before deploying. It is not currently wired into the build — add it to a CI step or `prebuild` when you are ready to enforce it.

## Further reading

- [page-contract.md](page-contract.md) — required metadata for every route
- [schema-guide.md](schema-guide.md) — when and how to use JSON-LD schema
- [launch-checklist.md](launch-checklist.md) — pre-launch SEO checklist
