# Cloudflare Web Analytics

Cloudflare Web Analytics is an optional privacy-first sanity layer supported by this template. It runs alongside GTM/GA4 and provides an independent view of traffic without ad blockers having the same impact.

---

## What it is good for

- **Sanity checking GA4 numbers** — if GA4 shows 1,000 sessions and Cloudflare shows 1,200 visits, the gap is probably ad blocker traffic. Cloudflare is harder to block because it uses a first-party endpoint on Cloudflare's network.
- **Privacy-first measurement** — Cloudflare Web Analytics does not use cookies, fingerprinting, or `localStorage` for its displayed analytics. See [cloudflare.com/web-analytics](https://www.cloudflare.com/web-analytics/).
- **Zero-cost baseline** — included in Cloudflare's free plan when your domain uses Cloudflare DNS.
- **Lightweight** — a single beacon script with no cookie banner implications.

---

## What it is NOT

- **Not a conversion tracking tool.** Cloudflare Web Analytics does not support custom events, goal tracking, or funnel analysis. Use GTM/GA4 for those.
- **Not an ad attribution source.** It does not capture UTMs, click IDs, or any ad platform signal. Do not use it to measure paid campaign performance.
- **Not a replacement for GA4.** It provides aggregate traffic data — no session-level analysis, no user journeys, no cohorts.

---

## How to enable

1. Add your site to [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) in the Cloudflare dashboard.
2. Copy the analytics token (a 32+ character alphanumeric string).
3. Add to your production env:
   ```bash
   PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN=your-token
   ```
4. Ensure `PUBLIC_ANALYTICS_ENABLED=true` — Cloudflare Web Analytics only injects when the master analytics switch is on.

---

## Why numbers will differ from GA4

Expect Cloudflare to report **more** visits than GA4 because:

- GA4 is blocked by many ad blockers, privacy-focused browsers, and browser extensions.
- Cloudflare's beacon uses a first-party network path that is harder to block.
- GA4 deduplicates using cookies and user IDs; Cloudflare uses a different methodology.
- Bots and crawlers are filtered differently in each system.

A 10–30% difference is normal. A larger gap may indicate GTM misconfiguration or unusually high ad-blocker usage in your audience.

---

## CSP

The template automatically adds Cloudflare's script host to CSP `script-src` and `connect-src` when `PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN` is set and `PUBLIC_ANALYTICS_ENABLED=true`. No manual CSP edits are needed.

Hosts added:

- `script-src`: `https://static.cloudflareinsights.com`
- `connect-src`: `https://cloudflareinsights.com`
