# Cookie Consent + Google Consent Mode

**This document is not legal advice.** Consent requirements vary by jurisdiction, user base, and whether you use ad tracking. Consult a lawyer or privacy specialist for your specific situation.

---

## Quick decision guide

| Situation                                                      | Action                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Cloudflare Web Analytics only (no cookies, no fingerprinting)  | No banner needed in most cases                                     |
| GA4 without ad features, users outside GDPR/CCPA jurisdictions | Legal review first; many small informational sites skip the banner |
| GA4 with ad features (Google Ads remarketing, etc.)            | Consent banner required for EU/EEA/UK users                        |
| Meta Pixel, LinkedIn Insight Tag, or other ad network tags     | Consent banner required for most jurisdictions                     |
| Legal review confirms consent is required                      | Activate the banner — see steps below                              |

---

## What ships in the template

### Consent seam (always present)

`src/lib/analytics/consent.ts` — typed Google Consent Mode v2 helpers. Default state is **all denied**.

```ts
import {
	pushConsentDefaults, // push denied defaults before GTM processes events
	updateConsent, // call after the user makes a choice
	grantAnalyticsConsent, // convenience — grants analytics_storage only
	DEFAULT_CONSENT, // { analytics_storage: 'denied', ad_storage: 'denied', ... }
	ANALYTICS_ONLY_CONSENT, // { analytics_storage: 'granted', ads: 'denied' }
	FULL_CONSENT, // all granted (use only when legally appropriate)
} from '$lib/analytics/consent';
```

### Dormant UI components (not imported by default)

| File                                   | Purpose                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/lib/privacy/ConsentBanner.svelte` | First-visit banner; reads/writes `localStorage`; calls `updateConsent()` on accept/decline |
| `src/lib/privacy/ManageConsent.svelte` | Preferences panel for reviewing or changing consent after the initial banner               |

These components exist but are **not imported in the root layout**. Import them per project when a consent banner is required.

---

## Consent categories

| Category        | Signal                                             | What it controls                            |
| --------------- | -------------------------------------------------- | ------------------------------------------- |
| **Necessary**   | Always on — no consent required                    | Session cookies, CSRF tokens, security      |
| **Analytics**   | `analytics_storage: 'granted'`                     | GA4 session and user measurement cookies    |
| **Advertising** | `ad_storage`, `ad_user_data`, `ad_personalization` | Google Ads, remarketing, ad personalization |

For sites without ad tags, `ANALYTICS_ONLY_CONSENT` is the correct "accept" state — it grants analytics but leaves all ad signals denied.

---

## How Google Consent Mode works

Google Consent Mode v2 lets GTM tags adjust their behavior based on consent signals. This is **real behavioral change**, not just a visual banner.

| Signal denied                  | Effect                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `analytics_storage: 'denied'`  | GA4 fires events using cookieless pings + modeled data. No measurement cookies set. |
| `ad_storage: 'denied'`         | Google Ads does not set ad cookies.                                                 |
| `ad_user_data: 'denied'`       | User data is not sent to Google for ad modeling.                                    |
| `ad_personalization: 'denied'` | Ads are not personalized for this user.                                             |

Consent signals must be pushed to `window.dataLayer` **before GTM loads** so the container reads the correct default state.

See: [developers.google.com/tag-platform/security/concepts/consent-mode](https://developers.google.com/tag-platform/security/concepts/consent-mode)

---

## Activating the consent banner

### Step 1 — Import `ConsentBanner` into the root layout

In `src/routes/+layout.svelte`:

```svelte
<script lang="ts">
	import ConsentBanner from '$lib/privacy/ConsentBanner.svelte';
	// ... your existing imports
</script>

<!-- Place after <AnalyticsBody /> in the layout: -->
<ConsentBanner />
```

`ConsentBanner` calls `pushConsentDefaults(DEFAULT_CONSENT)` in its `onMount`, which runs before GTM processes any events via the async dataLayer queue.

### Step 2 — Push defaults synchronously (optional, high-assurance)

For the strictest Consent Mode compliance, push denied defaults as an inline script in `src/app.html` **before** the GTM snippet:

```html
<script>
	window.dataLayer = window.dataLayer || [];
	window.dataLayer.push([
		'consent',
		'default',
		{
			analytics_storage: 'denied',
			ad_storage: 'denied',
			ad_user_data: 'denied',
			ad_personalization: 'denied',
		},
	]);
</script>
```

This ensures the defaults are in the queue before GTM initializes, even on the first page load.

### Step 3 — Add a privacy policy page

`ConsentBanner.svelte` links to `/privacy`. Add your privacy policy at `src/routes/privacy/+page.svelte` and register it:

```ts
// src/lib/seo/routes.ts
{ path: '/privacy', indexable: true, priority: 0.3 },
```

### Step 4 — Add a "manage consent" link

Import `ManageConsent.svelte` in your privacy policy page or a cookie settings section:

```svelte
<script lang="ts">
	import ManageConsent from '$lib/privacy/ManageConsent.svelte';
</script>

<ManageConsent />
```

---

## Persistence

`ConsentBanner.svelte` persists the consent choice in `localStorage` under the key `consent-choice`:

| Stored value  | Meaning                              |
| ------------- | ------------------------------------ |
| `'analytics'` | Analytics-only consent granted       |
| `'denied'`    | All signals denied                   |
| _(absent)_    | No choice made yet — show the banner |

On subsequent visits, the banner re-applies the saved choice without displaying again.

---

## Third-party Consent Management Platforms (CMPs)

If compliance assurance or a consent audit trail is required (regulated industries, large sites), use a third-party CMP instead of the dormant banner:

- **Cookiebot** — auto-scans cookies, full audit log, IAB TCF certified
- **OneTrust** — enterprise-grade, multi-regulation support
- **Termly** — small/medium business, simpler setup

Third-party CMPs replace `ConsentBanner.svelte` and `ManageConsent.svelte`. Keep using `pushConsentDefaults()` and `updateConsent()` from `consent.ts` to bridge the CMP's consent signals into GTM.

---

## References

- Google Consent Mode concepts: [developers.google.com/tag-platform/security/concepts/consent-mode](https://developers.google.com/tag-platform/security/concepts/consent-mode)
- Template consent seam: `src/lib/analytics/consent.ts`
- Existing analytics consent docs: [docs/analytics/consent-and-privacy.md](../analytics/consent-and-privacy.md)
- Module registry: [docs/modules/README.md](README.md)
