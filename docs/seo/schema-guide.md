# Schema Guide (JSON-LD)

JSON-LD structured data helps search engines understand your content and can unlock rich results (FAQ accordions, article bylines, breadcrumbs, etc.).

**The cardinal rule: schema must match visible page content.** Google penalizes schema that does not reflect what a user would actually see on the page.

## What ships in the template

| Helper                  | `@type`        | Use when                                              |
| ----------------------- | -------------- | ----------------------------------------------------- |
| `organizationSchema()`  | Organization   | Always injected by root layout                        |
| `websiteSchema()`       | WebSite        | Always injected by root layout                        |
| `articleSchema()`       | Article        | Page is a blog post, news article, or case study      |
| `breadcrumbSchema()`    | BreadcrumbList | Page shows a visible breadcrumb trail                 |
| `personSchema()`        | Person         | Page is an author profile or team member bio          |
| `localBusinessSchema()` | LocalBusiness  | Page represents a physical business with an address   |
| `faqSchema()`           | FAQPage        | Page contains a visible list of questions and answers |

All helpers are in [src/lib/seo/schemas.ts](../../src/lib/seo/schemas.ts).

## Root layout schema

`Organization` and `WebSite` schema are injected once in `+layout.svelte` — you do not need to add them per-page. Individual pages add their own schema on top.

## How to add schema to a page

Import the helper, call it with the page-specific data, and pass the result to the SEO component:

```svelte
<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import { faqSchema } from '$lib/seo/schemas';

	const schema = faqSchema([
		{ question: 'What is your refund policy?', answer: 'Full refunds within 30 days.' },
		{
			question: 'Do you offer free trials?',
			answer: 'Yes, 14-day free trial, no credit card required.',
		},
	]);
</script>

<SEO seo={{ title: 'FAQ', description: '...', canonicalPath: '/faq', schema }} />
```

Pass an array when you need multiple schema types on one page:

```svelte
const schema = [articleSchema({ ... }), breadcrumbSchema([...])];
```

## When NOT to add schema

- Do not add FAQ schema unless there is a visible Q&A section on the page.
- Do not add LocalBusiness schema unless the page represents a real physical location.
- Do not add Review schema unless the page shows real, attributed reviews.
- Do not add Product schema unless the page is a product detail page with price and availability.
- Do not add Article schema on a page that is not an article (e.g. a marketing landing page).

## Schema dos and don'ts

| Do                                         | Don't                                  |
| ------------------------------------------ | -------------------------------------- |
| Use helpers from `schemas.ts`              | Hardcode domain/name strings in schema |
| Add schema only when content matches       | Add schema types "just in case"        |
| Use `canonicalPath` + helper to build URLs | Construct full URLs manually           |
| Validate with Google's Rich Results Test   | Assume correct schema = rich result    |

## Validating schema

After adding schema, validate with:

- [Google Rich Results Test](https://search.google.com/test/rich-results)
- [Schema.org Validator](https://validator.schema.org/)

Check for errors and warnings. A valid schema does not guarantee a rich result — Google decides based on quality signals.
