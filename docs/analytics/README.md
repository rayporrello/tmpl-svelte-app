# Analytics

This template ships a professional analytics spine that every project inherits without needing to rethink the stack. It is **not** a mandatory tracking platform — it is a dormant seam that activates through env vars.

---

## Tiered architecture

| Tier                      | What                            | Default state        | How to activate                                                                  |
| ------------------------- | ------------------------------- | -------------------- | -------------------------------------------------------------------------------- |
| Google Search Console     | Indexing health, query data     | Required launch task | Verify property, submit sitemap (see [launch-checklist.md](launch-checklist.md)) |
| GTM web container         | Browser analytics entry point   | Dormant              | Set `PUBLIC_GTM_ID` + `PUBLIC_ANALYTICS_ENABLED=true`                            |
| GA4 through GTM           | Marketing analytics             | Dormant (inside GTM) | Configure GA4 tag in GTM after GTM is live                                       |
| SvelteKit SPA page views  | Deterministic dataLayer events  | Dormant              | Activates automatically when GTM is enabled                                      |
| Cloudflare Web Analytics  | Privacy-first sanity layer      | Optional/dormant     | Set `PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN`                                      |
| Server conversion events  | Typed post-validation events    | Dormant no-op        | Set `ANALYTICS_SERVER_EVENTS_ENABLED=true` + provider                            |
| GA4 Measurement Protocol  | Server-to-server GA4            | Example file only    | Activate per project (upgrade path)                                              |
| Server-side GTM / Ad APIs | Paid-acquisition infrastructure | **Not included**     | Upgrade path only — see [paid-ads-upgrade.md](paid-ads-upgrade.md)               |

---

## Template policy

> GTM web + GA4 is the default production analytics path. SvelteKit emits SPA-safe `dataLayer` page views on initial load and every client navigation. Server actions may emit typed conversion events after validation succeeds. Cloudflare Web Analytics is supported as a parallel privacy-first sanity layer. Server-side GTM, GA4 Measurement Protocol, and ad-platform conversion APIs are paid-acquisition upgrades, not default website infrastructure.

---

## What is always included (zero configuration)

- `src/lib/analytics/` — typed browser helpers (events, page views, attribution, consent seam)
- `src/lib/components/analytics/AnalyticsHead.svelte` — GTM + Cloudflare injection (disabled by default)
- `src/lib/components/analytics/AnalyticsBody.svelte` — GTM noscript fallback
- `src/lib/server/analytics/` — typed server events + no-op provider
- `scripts/check-analytics.ts` — structural validation (wired into `bun run validate`)

None of these inject external scripts or call external servers when `PUBLIC_ANALYTICS_ENABLED=false` (the default).

---

## What is dormant (env-var activated)

Set these in production only:

```bash
PUBLIC_ANALYTICS_ENABLED=true       # master switch
PUBLIC_GTM_ID=GTM-XXXXXXX           # your GTM web container ID
PUBLIC_GA4_MEASUREMENT_ID=G-XXXXX  # informational — GA4 lives inside GTM
```

Optionally:

```bash
PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN=your-token  # privacy-first sanity layer
```

For server-side conversion events (after activation — see [server-conversions.md](server-conversions.md)):

```bash
ANALYTICS_SERVER_EVENTS_ENABLED=true
GA4_MEASUREMENT_ID=G-XXXXX
GA4_MEASUREMENT_PROTOCOL_API_SECRET=your-secret
```

---

## What NOT to do

- Do not add a direct `gtag.js` GA4 snippet when GTM is active. GA4 lives inside GTM.
- Do not send PII (names, emails, message bodies) to any analytics event.
- Do not track every click automatically. Use `trackCtaClick()` / `trackOutboundLink()` deliberately.
- Do not enable analytics in staging or preview without `PUBLIC_ANALYTICS_STAGING_OVERRIDE=true`.
- Do not add new event names without documenting them in [event-taxonomy.md](event-taxonomy.md).
- Do not use Cloudflare Web Analytics as your conversion attribution source.
- Do not use GA4 Measurement Protocol as a replacement for browser GTM collection.
- Do not add server-side GTM, Meta CAPI, or LinkedIn CAPI without justifying the paid-ad spend.

---

## Privacy and retention

Analytics data is separate from operational website data. The contact form stores leads in Postgres, and automation delivery records are pruned by `bun run privacy:prune`; see [docs/privacy/data-retention.md](../privacy/data-retention.md).

When enabling GA4, review the GA4 property retention controls and keep User-ID, custom dimensions, and event parameters free of PII. Server conversion events should use opaque IDs and aggregation-safe metadata only.

---

## Further reading

- [gtm-ga4-setup.md](gtm-ga4-setup.md) — step-by-step GTM + GA4 configuration
- [event-taxonomy.md](event-taxonomy.md) — approved event names and parameters
- [server-conversions.md](server-conversions.md) — server-side conversion events
- [attribution-capture.md](attribution-capture.md) — UTM and click ID capture
- [cloudflare-web-analytics.md](cloudflare-web-analytics.md) — Cloudflare analytics setup
- [consent-and-privacy.md](consent-and-privacy.md) — consent mode and privacy decisions
- [paid-ads-upgrade.md](paid-ads-upgrade.md) — server-side GTM, Meta CAPI, GA4 MP
- [client-onboarding-checklist.md](client-onboarding-checklist.md) — for client handoff
- [launch-checklist.md](launch-checklist.md) — pre-launch analytics verification
