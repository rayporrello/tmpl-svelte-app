# SEO Page Contract

Every route created in this template must satisfy this contract. No exceptions for public pages.

## Required for every public page

| Field                | Where it goes           | Notes                                                                 |
| -------------------- | ----------------------- | --------------------------------------------------------------------- |
| `title`              | SEO component prop      | Unique per page. Applied through `site.titleTemplate`.                |
| `description`        | SEO component prop      | 50–160 characters. Unique per page. Not duplicated from another page. |
| `canonicalPath`      | SEO component prop      | Site-relative path only — no domain. E.g. `/about`, `/blog/my-post`.  |
| Route registry entry | `src/lib/seo/routes.ts` | Must declare `indexable: true` or `false`.                            |

## Optional but expected for most pages

| Field             | When to include                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `image`           | Any page with a meaningful hero or feature image. Pages without it fall back to `site.defaultOgImage`. |
| `imageAlt`        | Required when `image` is set                                                                           |
| `type: 'article'` | Blog posts, news, case studies                                                                         |
| `publishedDate`   | Articles — ISO 8601 (e.g. `2026-04-26`)                                                                |
| `modifiedDate`    | Articles that have been updated                                                                        |
| `schema`          | When schema type matches visible page content — see schema guide                                       |

For articles, the share image priority is `og_image > image > site.defaultOgImage`. See [README.md → Share / OG image hierarchy](README.md#share--og-image-hierarchy).

Article detail routes are generated from `content/articles/*.md`. Do not add individual `/articles/{slug}` paths to `routes.ts`; keep the article filename, frontmatter `slug`, and canonical path aligned instead.

## Non-indexable pages

For internal, admin, or dev-only pages, set both:

1. `robots: 'noindex, nofollow'` in the SEO component
2. `indexable: false` in the route registry

```svelte
<SEO
	seo={{
		title: 'Admin',
		description: 'Internal admin panel.',
		canonicalPath: '/admin',
		robots: 'noindex, nofollow',
	}}
/>
```

```ts
// routes.ts
{ path: '/admin', indexable: false }
```

## Minimum example — public page

```svelte
<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
</script>

<SEO
	seo={{
		title: 'About Us',
		description: 'We build tools that help teams ship faster and collaborate better.',
		canonicalPath: '/about',
	}}
/>
```

## Full example — article

```svelte
<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import { articleSchema } from '$lib/seo/schemas';

	const schema = articleSchema({
		title: 'How We Improved Deployment Speed by 40%',
		description: 'A case study on our CI/CD pipeline overhaul.',
		canonicalPath: '/blog/deployment-speed',
		imagePath: '/images/blog/deployment-speed.jpg',
		publishedDate: '2026-03-15',
		authorName: 'Jane Smith',
	});
</script>

<SEO
	seo={{
		title: 'How We Improved Deployment Speed by 40%',
		description: 'A case study on our CI/CD pipeline overhaul.',
		canonicalPath: '/blog/deployment-speed',
		type: 'article',
		image: '/images/blog/deployment-speed.jpg',
		imageAlt: 'CI/CD pipeline diagram',
		publishedDate: '2026-03-15',
		schema,
	}}
/>
```

## What breaks if you skip this

- Missing `title`: browser tab shows the fallback from `app.html`; Google may generate its own title
- Missing `description`: Google may use page body text; often a bad excerpt
- Missing `canonicalPath`: canonicals default to `/`; duplicate content issues across URL variants
- Missing route registry: route excluded from sitemap even if it should be indexed

## What agents must check before adding a route

1. Is this a public-facing page? → Add SEO component with required fields.
2. Is this an internal/admin/preview page? → Set `robots: 'noindex, nofollow'` and `indexable: false`.
3. Did you add the route to `src/lib/seo/routes.ts`? → Required for all routes, indexable or not.
4. Does the page need schema? → Read [schema-guide.md](schema-guide.md) before adding.

For article files, also confirm `content/articles/{slug}.md` matches frontmatter `slug` and that `draft: false` is only used for content ready to appear in sitemap, llms.txt, and RSS.
