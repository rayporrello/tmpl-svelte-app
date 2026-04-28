# Analytics Launch Checklist

Complete this checklist before going live with any site built from this template.

Run `bun run validate:launch` — it includes `check:analytics`. Fix all errors before launch.

---

## Environment and config

- [ ] `PUBLIC_ANALYTICS_ENABLED=true` set in production env
- [ ] `PUBLIC_GTM_ID=GTM-XXXXXXX` set in production env
- [ ] `PUBLIC_GA4_MEASUREMENT_ID=G-XXXXXXXXXX` set in production env (informational)
- [ ] Analytics disabled in staging/dev (`PUBLIC_ANALYTICS_ENABLED` not set or `false`)
- [ ] `bun run check:analytics` passes with no errors

## GTM verification

- [ ] GTM Preview mode activated for production domain
- [ ] `page_view` event fires on initial page load
- [ ] `page_view` event fires after every SvelteKit client navigation (test by clicking nav links)
- [ ] GA4 tag fires on `page_view` trigger in GTM Preview
- [ ] GTM container published (not just saved)
- [ ] Correct container ID in production (not a dev/test container)

## GA4 verification

- [ ] GA4 Realtime view shows page views appearing during GTM Preview session
- [ ] No duplicate page views (verify: each navigation should show exactly one page_view)
- [ ] GA4 property is for the production domain, not a test property
- [ ] GA4 data retention set to 14 months (Admin → Data Settings → Data Retention)
- [ ] Search Console linked to GA4 property (for organic search data)

## Google Search Console

- [ ] Search Console property created for production domain
- [ ] Domain ownership verified
- [ ] Sitemap submitted: `https://yourdomain.com/sitemap.xml`
- [ ] Sitemap shows "Success" status (may take 24–72 hours)
- [ ] No indexing errors on key pages
- [ ] No canonical issues on key pages

## Cloudflare Web Analytics (if enabled)

- [ ] `PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN` set in production env
- [ ] Cloudflare Analytics dashboard shows data appearing
- [ ] Script injection visible in browser DevTools Network tab (beacon.min.js)

## Staging isolation

- [ ] Staging/preview/dev environments do NOT have `PUBLIC_ANALYTICS_ENABLED=true`
- [ ] Confirmed no GTM container fires on staging (GTM Preview on staging shows no tags)
- [ ] Cloudflare Web Analytics not injected on staging

## Form conversion tracking (if applicable)

- [ ] Contact/lead form submission tested in production
- [ ] `generate_lead` dataLayer event fires after successful submission (check GTM Preview)
- [ ] GA4 Realtime shows `generate_lead` event after form submission
- [ ] Server events verified if `ANALYTICS_SERVER_EVENTS_ENABLED=true` (check server logs)

## Consent and privacy (if applicable)

- [ ] Consent decision documented (banner required? CMP selected?)
- [ ] Privacy Policy updated to list analytics tools
- [ ] Consent mode configured if required (see [consent-and-privacy.md](consent-and-privacy.md))
- [ ] Consent banner tested (if implemented)

## Full validation pipeline

- [ ] `bun run validate:launch` exits 0
- [ ] All `bun run check:*` scripts pass
- [ ] No TypeScript errors (`bun run check`)
- [ ] E2E smoke tests pass (`bun run test:e2e`)

---

## Post-launch monitoring

Within 48–72 hours of launch:

- [ ] GA4 showing expected page view volume
- [ ] Search Console sitemap processing complete
- [ ] Cloudflare Analytics showing traffic (if enabled)
- [ ] No unexpected CSP violations in browser console
- [ ] No GTM errors in Tag Assistant
