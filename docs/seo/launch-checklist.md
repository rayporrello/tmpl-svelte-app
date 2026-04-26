# SEO Launch Checklist

Complete this checklist before a site goes live. These are one-time tasks per project.

## Site config

- [ ] `site.url` in `src/lib/config/site.ts` is the production domain (not `https://example.com`)
- [ ] `site.name` and `site.defaultTitle` reflect the real site/brand name
- [ ] `site.defaultDescription` is a real, useful description (not a placeholder)
- [ ] `site.defaultOgImage` points to a real image that exists in `static/`
- [ ] `site.organization.logo` points to the real logo URL
- [ ] `site.organization.sameAs` contains verified social/profile URLs for the org
- [ ] `bun run check:seo` exits 0

## Search Console

- [ ] Google Search Console property created for the production domain
- [ ] Ownership verified (HTML tag method: add `searchConsoleVerification` to `site.ts`)
- [ ] Sitemap submitted: `https://yourdomain.com/sitemap.xml`
- [ ] URL Inspection run on the homepage — confirmed indexable, no coverage errors

## robots.txt

- [ ] `/robots.txt` is accessible in production
- [ ] Sitemap URL in `robots.txt` uses the production domain, not `localhost` or dev domain
- [ ] `Disallow: /admin`, `/styleguide`, `/preview`, `/draft` entries are present
- [ ] If this is a staging environment, `Disallow: /` is set (via `site.indexing = false`)

## Sitemap

- [ ] `/sitemap.xml` is accessible in production
- [ ] All public content routes appear in the sitemap
- [ ] No internal/admin/preview routes appear in the sitemap
- [ ] Sitemap was submitted to Google Search Console

## Per-page metadata

- [ ] Every public page has a unique `<title>` (not the `app.html` placeholder)
- [ ] Every public page has a unique `<meta name="description">`
- [ ] Every public page has a canonical link
- [ ] OG image is accessible — test by pasting a URL into the [Open Graph debugger](https://developers.facebook.com/tools/debug/)
- [ ] Twitter card renders correctly — test with [Twitter Card Validator](https://cards-dev.twitter.com/validator)

## Schema

- [ ] Root layout injects `Organization` and `WebSite` schema
- [ ] Article pages use `Article` schema with real `publishedDate` and `authorName`
- [ ] FAQ pages use `FAQPage` schema (only if the page actually has a FAQ section)
- [ ] Schema is validated with [Google Rich Results Test](https://search.google.com/test/rich-results)

## Styleguide

- [ ] `/styleguide` route is either deleted or confirmed `noindex, nofollow`
- [ ] `/styleguide` is not present in `sitemap.xml`

## Post-launch

- [ ] Monitor Google Search Console for crawl errors and coverage issues over the first 2–4 weeks
- [ ] Re-run `bun run check:seo` after any change to `site.ts` or `routes.ts`
- [ ] Update `lastmod` dates in `routes.ts` when page content changes significantly
