# GTM + GA4 Setup Guide

Step-by-step setup for Google Tag Manager (web container) and GA4 on a site built from this template.

---

## Prerequisites

- A Google account with access to create GTM and GA4 properties
- Production domain confirmed and DNS resolving
- `bun run check:launch` passing (site URL set, no placeholder values)

---

## Step 1 — Create a GA4 property

1. Go to [analytics.google.com](https://analytics.google.com) → **Admin** → **Create property**.
2. Enter your site name and URL.
3. Select your industry and reporting time zone.
4. Under **Data collection**, choose **Web**.
5. Copy the **Measurement ID** — it looks like `G-XXXXXXXXXX`.
6. Add it to your production env: `PUBLIC_GA4_MEASUREMENT_ID=G-XXXXXXXXXX` (informational — GA4 is configured in GTM, not directly in code).

---

## Step 2 — Create a GTM web container

1. Go to [tagmanager.google.com](https://tagmanager.google.com) → **Create account** (or use an existing account).
2. Create a **Container** → select **Web**.
3. Copy the **Container ID** — it looks like `GTM-XXXXXXX`.
4. Add it to your production env: `PUBLIC_GTM_ID=GTM-XXXXXXX`.

---

## Step 3 — Enable analytics in production

In your production env file (never in `.env` for staging/dev):

```bash
PUBLIC_ANALYTICS_ENABLED=true
PUBLIC_GTM_ID=GTM-XXXXXXX
PUBLIC_GA4_MEASUREMENT_ID=G-XXXXXXXXXX
```

Run `bun run check:analytics` to confirm the config is valid.

---

## Step 4 — Disable GA4 Enhanced Measurement page views

Before configuring page view tags, disable Enhanced Measurement's built-in page view tracking, otherwise it will fire alongside the explicit `page_view` events the template emits.

1. In GA4 → **Admin** → your Web data stream → **Enhanced measurement** (gear icon).
2. Toggle **Page views** OFF.
3. Leave other Enhanced Measurement events (scrolls, outbound clicks, file downloads) ON or OFF per project preference.

> **Why**: GA4 Enhanced Measurement fires an automatic page_view on every History Change. The template emits its own explicit `page_view` to dataLayer. If both are active you will see every navigation counted twice in GA4.

---

## Step 5 — Configure GA4 in GTM with the custom page_view trigger

The template emits an explicit `page_view` event to `window.dataLayer` on every SvelteKit navigation (initial load and all client navigations). Configure GTM to fire the GA4 tag on this event only.

**⚠️ Use the custom event trigger (below) — do NOT use an "All Pages" trigger as well.** Using both would fire the GA4 tag twice on initial page load.

1. **Triggers → New** → Trigger Configuration → **Custom Event**.
2. Event name: `page_view` (exact match).
3. Save the trigger as "SvelteKit page_view".
4. **Tags → New** → Tag Configuration → **Google Tag**.
5. Set the Tag ID to your GA4 Measurement ID (`G-XXXXXXXXXX`).
6. Set the firing trigger to **SvelteKit page_view** (the trigger you just created).
7. Save.

This single trigger fires on every SvelteKit navigation (initial + subsequent), giving GA4 a deterministic and deduplicated page view signal.

---

## Step 6 — Test with GTM Preview and GA4 DebugView

GTM Preview mode automatically activates **GA4 DebugView** for your browser session — no extra configuration needed.

1. In GTM → **Preview** → enter your production URL → click **Connect**.
2. Your site opens in a new tab with the GTM debug pane at the bottom.
3. Navigate to a second page. Confirm two `page_view` events appear in the GTM debug pane (one for initial load, one for the navigation).
4. Confirm the GA4 Google Tag fires on each `page_view` event.
5. In GA4 → **Admin** → **DebugView** (under Property column, near the bottom).
   - DebugView shows individual events from your current browser session in near-real time (~2–5 second delay).
   - Confirm `page_view` events appear with the correct `page_path` and `page_title` parameters.
   - If you see two `page_view` events for a single navigation, you have a duplicate trigger — see Troubleshooting below.
6. **GA4 → Reports → Realtime**: shows aggregate traffic from all users in the last 30 minutes. Less useful for individual event debugging; prefer DebugView.

> **Realtime vs DebugView**: Use DebugView to verify individual event parameters and deduplication. Use Realtime to confirm the site is receiving traffic in general.

---

## Step 7 — Publish the GTM container

1. In GTM → **Submit** → add a version name (e.g. "Initial GA4 setup").
2. Click **Publish**.
3. Re-test in production with GTM Preview mode to confirm the published container fires correctly.

---

## Step 8 — Confirm staging is disabled

Verify `PUBLIC_ANALYTICS_ENABLED` is `false` (or not set) in your staging/dev env. Run:

```bash
bun run check:analytics
```

It will warn if analytics appears enabled on a non-production domain.

---

## Troubleshooting

### Duplicate page views

Three common causes — check all three if you see duplicates in GA4 DebugView:

1. **"All Pages" GTM trigger + custom `page_view` trigger on the same GA4 tag.** Remove the "All Pages" trigger; use only the custom `page_view` trigger (see Step 5).
2. **GA4 Enhanced Measurement page views are still enabled.** Go to GA4 → Admin → Data stream → Enhanced measurement → toggle Page views OFF (see Step 4).
3. **`AnalyticsHead.svelte` imported more than once** (rare). Confirm it appears only in root `+layout.svelte`, not in any nested layout.

To diagnose: use GA4 DebugView (Admin → DebugView). Each SvelteKit navigation should show exactly one `page_view` event. If you see two, open the GTM Preview pane and check which tag fires twice.

### Missing page views on navigation

- The template uses `afterNavigate` from `$app/navigation`. Confirm `AnalyticsHead.svelte` is imported in `+layout.svelte`.
- Check the browser console for errors during navigation.
- Use GTM Preview to confirm `page_view` events appear in the tag manager debug view.

### GA4 Realtime delay or confusion

- GA4 Realtime aggregates all users — it is not useful for debugging individual events.
- Use **DebugView** (GA4 → Admin → DebugView) instead: it shows your device's events within ~2–5 seconds and displays every parameter. DebugView is activated automatically when GTM Preview is open.
- If DebugView shows no events, confirm the GTM Preview pane is connected and the GA4 tag is firing in GTM.

### GTM Preview not connecting

- Preview mode requires the GTM script to be loaded. Confirm `PUBLIC_ANALYTICS_ENABLED=true` and `PUBLIC_GTM_ID` is set in the environment you're testing.
- Check for ad blockers — they often block GTM. Test in an incognito window without extensions.

### Ad blocker differences

- Ad blockers commonly block GTM, GA4, and Cloudflare Analytics. Expect 5–25% of users to be unmeasured depending on your audience.
- This is one reason Cloudflare Web Analytics is a useful sanity check — it uses a different measurement approach.

### Staging accidentally polluting production data

- Never set `PUBLIC_GTM_ID` in staging/dev environments.
- Use separate GA4 properties for staging if you need to test the full analytics stack.
- The `PUBLIC_ANALYTICS_STAGING_OVERRIDE=true` flag exists for deliberate staging testing only.
