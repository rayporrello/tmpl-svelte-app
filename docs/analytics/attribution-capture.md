# Attribution Capture

The template captures first-touch marketing attribution from URL parameters and persists it to `localStorage`. This payload can be included in form submissions so the server knows which campaign drove the lead.

---

## What is captured

| Parameter          | Source                                | Example                            |
| ------------------ | ------------------------------------- | ---------------------------------- |
| `utm_source`       | UTM                                   | `google`, `facebook`, `newsletter` |
| `utm_medium`       | UTM                                   | `cpc`, `social`, `email`           |
| `utm_campaign`     | UTM                                   | `spring-sale`, `brand-awareness`   |
| `utm_term`         | UTM                                   | `blue widgets`                     |
| `utm_content`      | UTM                                   | `hero-cta`, `sidebar-link`         |
| `gclid`            | Google Ads click ID                   | auto-appended by Google Ads        |
| `gbraid`           | Google Ads (web enhanced conversions) | auto-appended                      |
| `wbraid`           | Google Ads (app enhanced conversions) | auto-appended                      |
| `fbclid`           | Meta (Facebook) click ID              | auto-appended by Meta Ads          |
| `msclkid`          | Microsoft Ads click ID                | auto-appended by Microsoft         |
| `landing_page`     | Full URL of the first landing page    |
| `initial_referrer` | `document.referrer` on first landing  |
| `first_seen_at`    | ISO timestamp of capture              |

---

## First-touch behavior

Attribution is captured **once** — on the first visit that includes a tracking parameter or an external referrer. Subsequent visits do not overwrite it.

This gives you a stable first-touch attribution model for the session. If a project needs last-touch or multi-touch attribution, that logic must be built on top (see upgrade paths in [paid-ads-upgrade.md](paid-ads-upgrade.md)).

---

## When attribution is captured

`captureAttribution()` is called from `AnalyticsHead.svelte`'s `onMount` — once per initial page load, client-side only. It is not called during SSR.

Attribution is **only stored** when at least one tracking signal is present:

- A UTM or click ID parameter in the URL, OR
- An external referrer (a domain different from the current site's hostname)

Direct traffic with no parameters and no external referrer is not stored.

---

## How to include attribution in form submissions

Read the stored payload in a Svelte component before form submission:

```ts
import { getAttributionPayload } from '$lib/analytics/attribution.client';

// In a form component, after the user submits:
const attribution = getAttributionPayload();
// Include `attribution` in the form data sent to the server
// (e.g. as a hidden field or by adding to the Superforms data object)
```

In the server action, the attribution payload arrives as form data and can be forwarded to the CRM, n8n workflow, or analytics provider.

---

## Privacy considerations

- Attribution data is stored in `localStorage`, not cookies. It is not sent to third parties automatically.
- The payload contains only marketing signal parameters — no PII from the user.
- `localStorage` can be cleared by the user at any time.
- If `localStorage` is blocked (strict privacy mode, private browsing in some browsers), attribution capture degrades silently — no error is thrown.
- Do not send the full attribution payload to analytics events directly. If including in a GA4 event, extract only non-PII parameters (e.g. `utm_source`, `utm_medium`).

---

## Upgrade paths

Once Postgres is active (Phase 5), attribution payloads can be persisted server-side in a leads table, making them available for:

- CRM import
- n8n automation enrichment
- Ad platform offline conversion uploads (Google Ads, Meta)
- Attribution reporting over time

See [paid-ads-upgrade.md](paid-ads-upgrade.md) for more on ad-platform conversion APIs.
