# Consent and Privacy

**This document is not legal advice.** Consult a lawyer or privacy specialist for your specific jurisdiction and use case. This document explains the architecture seam and helps you make an informed decision.

---

## The consent seam

`src/lib/analytics/consent.ts` provides a typed interface for Google Consent Mode v2 and helpers to push consent states to `window.dataLayer`. This is a plumbing file — it does not implement a cookie banner. Your project decides whether and when to use it.

Available helpers:

```ts
import {
	pushConsentDefaults,
	updateConsent,
	grantAnalyticsConsent,
	DEFAULT_CONSENT,
	ANALYTICS_ONLY_CONSENT,
	FULL_CONSENT,
} from '$lib/analytics/consent';

// Push denied defaults before GTM loads (recommended when using Consent Mode):
pushConsentDefaults(DEFAULT_CONSENT);

// After user grants analytics-only consent:
grantAnalyticsConsent();

// After user grants full consent (analytics + ads):
updateConsent(FULL_CONSENT);
```

---

## When you probably do NOT need a consent banner

- Your site is entirely informational and uses only aggregate analytics (no ad targeting).
- Your users are not in the EU/EEA/UK or other jurisdictions with cookie consent requirements.
- You are using Cloudflare Web Analytics only (no cookies, no fingerprinting — GDPR-friendly).
- Your legal counsel confirms that your use case does not require prior consent.

Even without a banner, you should review your Privacy Policy and confirm it covers your analytics tools.

Analytics consent is separate from operational data retention. Contact form submissions and automation records live in Postgres and are covered by [docs/privacy/data-retention.md](../privacy/data-retention.md).

---

## When you probably DO need a consent banner

- You use ad targeting cookies (Google Ads remarketing, Meta Pixel, LinkedIn Insight Tag).
- Your users are in the EU/EEA/UK (GDPR), Brazil (LGPD), California (CCPA), or similar.
- You use GA4 with `ad_storage: 'granted'` (GA4 sets ad targeting cookies by default when consent is granted).
- A legal review confirms consent is required for your use case.

---

## Consent Mode and GTM

Google Consent Mode v2 lets GTM tags adjust their behavior based on consent signals:

- `analytics_storage: 'denied'` → GA4 still fires events but uses cookieless pings and modeled data.
- `ad_storage: 'denied'` → Google Ads does not set ad cookies.
- `ad_user_data: 'denied'` → User data is not sent to Google for ad modeling.
- `ad_personalization: 'denied'` → Ads are not personalized.

To use Consent Mode:

1. Push consent defaults to `dataLayer` **before** GTM loads (in `AnalyticsHead.svelte` before the GTM script, or in a separate script in `app.html`).
2. When the user makes a consent choice, call `updateConsent()`.
3. Configure GTM to respect consent signals (enable Consent Mode in GTM container settings).

See [developers.google.com/tag-platform/security/concepts/consent-mode](https://developers.google.com/tag-platform/security/concepts/consent-mode).

---

## Implementing a consent banner

The template does not ship a cookie banner because:

- The right UI depends heavily on the project (brand, legal requirements, CMP preference).
- Many projects do not need one.
- Third-party CMPs (Cookiebot, OneTrust, Termly) are often preferred for compliance assurance.

If you need a banner:

1. Evaluate whether to build a simple banner (small sites, no ad targeting) or use a CMP (regulated industries, complex consent requirements).
2. The banner should call `pushConsentDefaults(DEFAULT_CONSENT)` on load, then `updateConsent()` after the user makes a choice.
3. Persist the consent choice (cookie or localStorage) and re-apply on subsequent visits.
4. Add the consent state to `AnalyticsHead.svelte` before the GTM snippet if using Consent Mode.

---

## Cloudflare Web Analytics and consent

Cloudflare Web Analytics does not use cookies, `localStorage`, fingerprinting, or cross-site tracking for its displayed analytics. It is generally considered GDPR-compatible without a consent banner for analytics-only use. Verify with your legal counsel.

---

## Attribution capture and consent

`captureAttribution()` uses `localStorage` to store UTM parameters and click IDs. This may require disclosure (and possibly consent) under some privacy regulations if it is used for ad retargeting. For pure marketing analytics without ad targeting, it is typically considered analytics-class data.

If your project uses ad platform click IDs (gclid, fbclid) and your users are in a consent jurisdiction, review whether attribution capture falls within your consent scope.

---

## Retention notes

If GA4 is enabled, review the GA4 property's data retention settings during launch. Keep analytics events free of PII: no names, emails, phone numbers, IP addresses, or contact message bodies.

The template's `privacy:prune` command only prunes the local Postgres runtime tables. It does not delete data from GTM, GA4, Cloudflare Web Analytics, email providers, CRMs, or n8n.
