# Paid Ads Upgrade Paths

The base template includes the browser analytics spine (GTM → GA4) and server conversion events. When a project's paid advertising spend justifies additional infrastructure, the following upgrade paths are available.

**Decision rule**: Use advanced paid-ad infrastructure only when conversion value and ad spend justify the extra setup, hosting, and maintenance cost.

---

## Server-side GTM (server container)

**What it is**: An additional server that acts as a GTM container — tags run server-side before forwarding data to GA4, Google Ads, and other destinations.

**Benefits**: Better data quality, reduced page weight, privacy improvements, ad blocker evasion for measurement.

**Cost**: Additional server (typically $20–100/mo on a managed provider like [Stape](https://stape.io)), ongoing maintenance, more complex GTM setup.

**When to consider**: High-value campaigns where you need better measurement fidelity than browser GTM alone provides.

**Resources**:

- [Google's server-side tagging guide](https://developers.google.com/tag-platform/tag-manager/server-side)
- [Stape managed server-side GTM](https://stape.io)

**Template action**: No code change needed — add a server-side GTM container URL to your GTM web container's server container settings.

---

## GA4 Measurement Protocol

**What it is**: Direct HTTP POST to Google's analytics endpoint from your server.

**When to use**: Trusted server-confirmed conversions (payment confirmed, lead stored in DB) that augment browser GTM collection.

**When NOT to use**: As a replacement for browser collection. GA4 MP reports may show incomplete session data when used alone.

**Template action**: Activate the example provider at `src/lib/server/analytics/ga4-measurement-protocol.example.ts`. See [server-conversions.md](server-conversions.md) for activation steps.

**Resources**:

- [GA4 Measurement Protocol docs](https://developers.google.com/analytics/devguides/collection/protocol/ga4)

---

## Google Ads enhanced conversions (server-side)

**What it is**: Send hashed first-party data (email, phone) to Google Ads alongside conversion events. Improves attribution for users who block cookies.

**When to use**: When you are spending meaningfully on Google Ads and have user-provided first-party data (opt-in email, phone from form submission).

**Requires**: Consent (ad_storage granted or enhanced conversions opt-in), hashed PII handling, Google Ads conversion setup.

**Template action**: Implement in a custom `ServerAnalyticsProvider` that calls the Google Ads API. Do not implement in the base template.

---

## Meta Conversions API (CAPI)

**What it is**: Server-side counterpart to the Meta Pixel — sends conversion events directly from your server to Meta.

**When to use**: When you are spending meaningfully on Meta (Facebook/Instagram) Ads and need better conversion attribution beyond the browser Pixel.

**Requires**: Meta Business Manager access, CAPI access token, consent (ad_storage), careful PII hashing.

**Template action**: Implement as a custom `ServerAnalyticsProvider`. Do not implement in the base template.

---

## LinkedIn Insight Tag (server-side)

**What it is**: Server-side conversion API for LinkedIn Ads.

**When to use**: B2B campaigns on LinkedIn where conversion attribution matters.

**Template action**: Implement as a custom `ServerAnalyticsProvider` if and when needed.

---

## CRM and offline conversion uploads

**What it is**: Sending conversion data from your CRM back to Google Ads or Meta as "offline conversions."

**When to use**: When conversions happen offline (phone call, sales meeting) or after a delay (SaaS trial → paid).

**Template action**: This is a CRM-level integration, not a template concern. Wire from your CRM or n8n automation, not from SvelteKit server actions.

---

## Summary: what to build when

| Paid ad spend          | What to add                                                            |
| ---------------------- | ---------------------------------------------------------------------- |
| < $1k/mo               | GTM → GA4 browser collection is sufficient.                            |
| $1k–5k/mo              | Add server conversion events (GA4 MP) for high-value form submissions. |
| > $5k/mo, Google-heavy | Consider server-side GTM for better measurement fidelity.              |
| > $5k/mo, Meta-heavy   | Add Meta CAPI for server-side conversion matching.                     |
| High-volume B2B        | LinkedIn CAPI + CRM offline conversion upload.                         |
| Enterprise             | Full server-side GTM + all CAPI integrations + consent CMP.            |

These thresholds are rough heuristics — the right answer depends on your conversion value, audience, and willingness to maintain infrastructure.
