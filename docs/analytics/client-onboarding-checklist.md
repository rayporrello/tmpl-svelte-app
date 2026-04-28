# Client Analytics Onboarding Checklist

Use this checklist when setting up analytics for a new client site. Complete it before launch.

---

## 1. Accounts and access

Confirm the client has (or will create) the following accounts. Get admin access or have the client add you as an admin before setup.

| Account                        | Required?                         | Notes                                                             |
| ------------------------------ | --------------------------------- | ----------------------------------------------------------------- |
| Google Account (for GTM + GA4) | Required                          | Prefer a non-personal Google account owned by the client's domain |
| Google Search Console          | Required                          | Verify domain ownership at launch                                 |
| Google Analytics (GA4)         | Required                          | Create a Web property                                             |
| Google Tag Manager             | Required                          | Create a Web container                                            |
| Cloudflare (Web Analytics)     | Optional                          | Free if domain uses Cloudflare DNS                                |
| Google Ads                     | Optional — if running paid search |                                                                   |
| Meta Business Manager          | Optional — if running paid social |                                                                   |
| LinkedIn Campaign Manager      | Optional — if running B2B ads     |                                                                   |

---

## 2. Google Analytics 4

- [ ] GA4 property created for the production domain
- [ ] Reporting time zone set to the client's local time zone
- [ ] Data retention set to 14 months (default is 2 months — change in Admin → Data Settings)
- [ ] Measurement ID copied: `G-__________`
- [ ] Added to production env: `PUBLIC_GA4_MEASUREMENT_ID=G-__________`

---

## 3. Google Tag Manager

- [ ] GTM web container created for the production domain
- [ ] Container ID copied: `GTM-__________`
- [ ] Added to production env: `PUBLIC_GTM_ID=GTM-__________`
- [ ] GA4 Google Tag configured inside GTM (see [gtm-ga4-setup.md](gtm-ga4-setup.md))
- [ ] SvelteKit `page_view` Custom Event trigger configured
- [ ] GTM container tested in Preview mode
- [ ] GTM container published

---

## 4. Google Search Console

- [ ] Search Console property created for production domain
- [ ] Domain ownership verified (DNS TXT record, or HTML tag — prefer DNS)
- [ ] Sitemap submitted: `https://yourdomain.com/sitemap.xml`
- [ ] Sitemap status confirmed (should show "Success" within 24–72 hours)
- [ ] Important URLs inspected: homepage, key landing pages
- [ ] No indexing or canonical errors reported
- [ ] Search Console verification token added to `site.ts` if using HTML tag method:
  ```ts
  searchConsoleVerification: 'your-token';
  ```

---

## 5. Analytics enabled in production

- [ ] `PUBLIC_ANALYTICS_ENABLED=true` set in production env
- [ ] `PUBLIC_ANALYTICS_STAGING_OVERRIDE=false` in staging env (or var not set)
- [ ] `bun run check:analytics` passes

---

## 6. Cloudflare Web Analytics (optional)

- [ ] Site added to Cloudflare Web Analytics dashboard
- [ ] Token copied and added to production env: `PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN=__________`
- [ ] Script injection confirmed in production

---

## 7. Ad platforms (optional, if applicable)

- [ ] Google Ads account linked to GA4 property (for GA4 → Ads remarketing)
- [ ] Google Ads conversion actions configured in GA4 or GTM
- [ ] Meta Pixel added through GTM (if running Meta Ads)
- [ ] Meta CAPI configured (if spend justifies it — see [paid-ads-upgrade.md](paid-ads-upgrade.md))
- [ ] LinkedIn Insight Tag added through GTM (if running LinkedIn Ads)

---

## 8. Consent and privacy decision

- [ ] Privacy policy includes analytics tools (GA4, GTM, Cloudflare)
- [ ] Consent requirements reviewed for user's geography
- [ ] Decision recorded: consent banner required? If yes, which CMP?
- [ ] Consent mode configured if applicable (see [consent-and-privacy.md](consent-and-privacy.md))

---

## 9. Launch verification

Run these checks before go-live:

- [ ] `bun run check:analytics` passes
- [ ] `bun run validate:launch` passes
- [ ] GTM Preview mode: `page_view` fires on every SvelteKit navigation
- [ ] GA4 Realtime: page views appearing
- [ ] No duplicate page views (check GA4 Realtime with GTM Preview)
- [ ] Staging analytics disabled (check staging env)
- [ ] Contact/lead form tested: confirm `generate_lead` event fires in GA4 if configured

---

## 10. Handoff notes

Fill in before handing to client or next developer:

- GA4 Property ID: `G-__________`
- GTM Container ID: `GTM-__________`
- Search Console property: `__________`
- Cloudflare Analytics token stored in: `__________`
- Consent approach: `__________`
- Ad platforms connected: `__________`
- Date verified: `__________`
- Verified by: `__________`
