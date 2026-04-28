# SEO System

SEO is built into this template. It is not optional and not a checklist item — it is infrastructure wired into the route system.

## What ships with the template

| File                                | Purpose                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/lib/config/site.ts`            | Single source of truth for site name, domain, OG image, organization, locale                   |
| `src/lib/seo/types.ts`              | TypeScript types for page and resolved SEO metadata                                            |
| `src/lib/seo/metadata.ts`           | Helpers: canonical URL, image URL, title template, robots directive                            |
| `src/lib/seo/schemas.ts`            | JSON-LD schema helpers: Organization, WebSite, Article, Breadcrumb, Person, LocalBusiness, FAQ |
| `src/lib/seo/routes.ts`             | Static route registry — declares every route and its indexability                              |
| `src/lib/seo/public-routes.ts`      | Merges static routes with published article routes for sitemap, llms.txt, and feeds            |
| `src/lib/seo/sitemap.ts`            | Generates `sitemap.xml` content from public routes                                             |
| `src/lib/seo/feed.ts`               | Generates the RSS 2.0 article feed                                                             |
| `src/lib/components/seo/SEO.svelte` | Svelte component — renders all head tags for a page                                            |
| `src/routes/sitemap.xml/+server.ts` | Prerendered `/sitemap.xml` endpoint                                                            |
| `src/routes/robots.txt/+server.ts`  | Prerendered `/robots.txt` endpoint                                                             |
| `src/routes/llms.txt/+server.ts`    | Prerendered `/llms.txt` endpoint for AI discovery                                              |
| `src/routes/rss.xml/+server.ts`     | Prerendered RSS 2.0 feed for published articles                                                |
| `scripts/check-seo.ts`              | Validation script — warns on placeholders and fails on structural/indexability errors          |

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

<SEO
	seo={{
		title: 'About Us',
		description: 'Learn about our company and team.',
		canonicalPath: '/about',
	}}
/>
```

That is the minimum. `title`, `description`, and `canonicalPath` are required. Everything else defaults from `site.ts`.

## Dynamic article routes

Static marketing routes live in [src/lib/seo/routes.ts](../../src/lib/seo/routes.ts). Published article routes are generated automatically from `content/articles/*.md` by [src/lib/seo/public-routes.ts](../../src/lib/seo/public-routes.ts).

Do not hand-add `/articles/{slug}` entries to `routes.ts`. A published article appears in public discovery artifacts when:

- the file is in `content/articles/`
- the filename matches the frontmatter slug, e.g. `content/articles/getting-started.md` with `slug: getting-started`
- `draft: false`
- the article date is valid and not in the future

Draft articles are excluded from `/articles`, `/articles/[slug]` prerender entries, `sitemap.xml`, `llms.txt`, and `rss.xml`.

Article `lastmod` is resolved automatically in this order:

1. The most recent git commit timestamp for the article file
2. Optional `modified_date` frontmatter
3. The article `date`

The git timestamp path is best-effort. It falls back cleanly when a build environment has no `.git` directory or no `git` binary.

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
		sameAs: ['https://twitter.com/acmecorp'],
	},
};
```

`bun run check:seo` warns if `url` is still `https://example.com` or `name` is `Your Site Name`.
`bun run check:launch` treats those placeholders as launch-blocking errors.

## Non-indexable routes

Routes that must never appear in search results:

- `/styleguide` — design system demo
- `/admin` — CMS admin
- `/preview` — draft preview
- `/draft/*` — any draft-like path
- `/examples` and everything under it — copyable page archetypes (see [docs/examples/](../examples/README.md))

Add `indexable: false` in `routes.ts` and pass `robots: 'noindex, nofollow'` to the SEO component.

`scripts/check-seo.ts` will error if any of these paths are accidentally marked indexable.

## Sitemap, llms.txt, and RSS

`/sitemap.xml`, `/llms.txt`, and `/rss.xml` are prerendered because this template uses Git-backed content and container images ship the built app, not the editable `content/` directory.

- `sitemap.xml` is the canonical URL inventory for search engines.
- `llms.txt` is a concise Markdown discovery file with titled links and descriptions.
- `rss.xml` is an RSS 2.0 feed for published articles only.

The base template ships RSS only. Atom can be added per project from the same public-route/article manifest, but the default should expose one feed format to keep autodiscovery simple.

RSS rules:

- Item `<guid isPermaLink="true">` is the canonical article URL.
- Item `<description>` uses the article description only; full article HTML is not included by default.
- Channel `<lastBuildDate>` is derived from article dates/lastmod values, not the current build time.
- The root layout includes one RSS autodiscovery link.

## Share / OG image hierarchy

Every page emits `og:image` and `twitter:image`. The image is picked from the first source that resolves:

**Articles (`/articles/[slug]`):**

1. `og_image` frontmatter — explicit override for social sharing only
2. `image` frontmatter — the article's feature image (also rendered in-page)
3. `site.defaultOgImage` — global fallback in [src/lib/config/site.ts](../../src/lib/config/site.ts)

The same chain applies to alt text: `og_image_alt` → `image_alt` → article title.

The chain is implemented by `resolveArticleShareImage()` in [src/lib/seo/metadata.ts](../../src/lib/seo/metadata.ts). The article route ([src/routes/articles/[slug]/+page.svelte](../../src/routes/articles/[slug]/+page.svelte)) calls it and feeds the result into the SEO component.

**Pages (everything else):**

1. `image` prop on the SEO component — page-specific override
2. `site.defaultOgImage` — global fallback

Pass `image` (and `imageAlt`) to the SEO component when a page has its own hero or feature image worth sharing:

```svelte
<SEO
	seo={{
		title: 'About',
		description: 'Who we are and how we work.',
		canonicalPath: '/about',
		image: '/uploads/about-hero.png',
		imageAlt: 'The team in our studio',
	}}
/>
```

Otherwise omit `image` entirely — the SEO component substitutes `site.defaultOgImage` automatically.

**Validation:**

- `scripts/check-assets.ts` confirms `static/og-default.png` is exactly 1200×630 and that `site.defaultOgImage` resolves to a real file under `static/`.
- `scripts/validate-content.ts` treats blank optional article image fields as omitted, requires alt text when an image is set, and fails when the referenced path does not exist on disk. Remote URLs (http/https) are not checked.

If you want generated per-article OG images down the road, prefer a provider-neutral build script that writes files to `static/og/generated/` and references them via the `og_image` field. The template intentionally does not ship runtime OG generation — that would tie you to a specific host.

## Validation

```bash
bun run check:seo       # SEO config + route registry sanity
bun run check:content   # article slug/date/draft/image contract
bun run check:launch    # release-grade: confirms ORIGIN/PUBLIC_SITE_URL look like a real HTTPS URL
```

`check:seo` checks that:

- Placeholder site values are surfaced as warnings during normal development
- `site.defaultDescription` exists and is non-trivial
- `site.defaultOgImage` is set
- SEO source files do not contain hardcoded `yourdomain.com`
- `/styleguide`, `/admin`, `/preview`, `/draft` routes are not marked indexable

`check:content` checks article filename/slug alignment, draft state, required dates, future-dated published articles, duplicate slugs, and image alt text.

Both scripts are wired into the validation pipeline:

- `bun run validate` (PR-grade) runs `check:seo`
- `bun run validate:launch` (release-grade) runs `check:seo` **and** `check:launch`
- `.github/workflows/ci.yml` runs `validate` on every push and `validate:launch` on tags

Run `validate:launch` before going live. The launch checks fail loudly on placeholder URLs.

## Google Search Console

Search Console is a required launch task, not app runtime code. There is no Search Console integration in the application code — it is a property you verify and configure in Google's dashboard.

**What to do at launch:**

1. Go to [search.google.com/search-console](https://search.google.com/search-console) and create a property for your production domain.
2. Verify ownership — DNS TXT record is preferred. For HTML tag verification, add the token to `src/lib/config/site.ts`:
   ```ts
   searchConsoleVerification: 'your-token-here';
   ```
   The SEO component injects it as `<meta name="google-site-verification">`.
3. Submit your sitemap: `https://yourdomain.com/sitemap.xml`
4. Confirm the sitemap shows "Success" in the Coverage report (within 24–72 hours).
5. Inspect key URLs — confirm they are indexable and have no canonical issues.

See [docs/analytics/client-onboarding-checklist.md](../analytics/client-onboarding-checklist.md) for the full Search Console onboarding steps.

## Further reading

- [page-contract.md](page-contract.md) — required metadata for every route
- [schema-guide.md](schema-guide.md) — when and how to use JSON-LD schema
- [launch-checklist.md](launch-checklist.md) — pre-launch SEO checklist
- [docs/examples/](../examples/README.md) — copyable page archetypes that demonstrate the SEO contract
- [docs/analytics/launch-checklist.md](../analytics/launch-checklist.md) — analytics launch checklist (includes Search Console)
