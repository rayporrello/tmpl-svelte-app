# Server Conversion Events

Server-side conversion events complement browser GTM/GA4 collection. They exist to record high-confidence conversions that have been validated server-side — a form submission that passed validation, a payment that was confirmed, a subscription that was created in the database.

---

## Why server conversion events exist

Browser analytics can be blocked by ad blockers, privacy browsers, or network conditions. For conversions that matter (leads, signups, purchases), a server-side signal gives you a fallback measurement path and enables future integration with ad platform conversion APIs (Meta CAPI, Google Ads enhanced conversions).

---

## When to fire them

**Always after validation and primary operation success.**

```
Request arrives
  → Validate form data (Superforms + Valibot)
  → If invalid: return fail(400) — NO analytics event
  → Execute primary operation (send email, insert DB row, call webhook)
  → If operation fails: return error — NO analytics event
  → Operation succeeded
  → Emit server analytics event ← here
  → Return success to user
```

---

## Failure policy

Analytics failures must never break a successful form submission.

`emitServerAnalyticsEvent()` wraps the provider call in a try/catch. If the analytics provider throws, the error is logged as a warning and the function returns normally. Your server action continues to return success to the user.

---

## Default provider: no-op

The template ships with a no-op provider (`noop-provider.ts`). It does nothing. Server events are disabled (`ANALYTICS_SERVER_EVENTS_ENABLED=false`) by default.

---

## How to wire a server event in a contact/lead form

In your `+page.server.ts` (after Superforms validation and email send succeed):

```ts
import { emitServerAnalyticsEvent } from '$lib/server/analytics/events';

// After email/webhook succeeds:
await emitServerAnalyticsEvent({
	name: 'generate_lead',
	eventId: crypto.randomUUID(),
	metadata: { form_name: 'contact' },
	// Do NOT include form.data.name, form.data.email, or form.data.message
});
```

The contact-example route has this commented out with instructions. Uncomment and activate when ready.

---

## How to activate a real provider

### Option A — GA4 Measurement Protocol

See `src/lib/server/analytics/ga4-measurement-protocol.example.ts`. This is the most common upgrade for projects already using GTM/GA4.

1. Set env vars:
   ```bash
   ANALYTICS_SERVER_EVENTS_ENABLED=true
   GA4_MEASUREMENT_ID=G-XXXXXXXXXX
   GA4_MEASUREMENT_PROTOCOL_API_SECRET=your-secret
   ```
2. In `src/hooks.server.ts`, activate the provider:
   ```ts
   import { setAnalyticsProvider } from '$lib/server/analytics/events';
   import { ga4MpProvider } from '$lib/server/analytics/ga4-measurement-protocol.example';
   // Call once at server startup:
   setAnalyticsProvider(ga4MpProvider);
   ```
3. Rename the `.example.ts` file to remove the `.example` suffix when you're ready to commit it as active code.

### Option B — Custom provider

Implement `ServerAnalyticsProvider` from `src/lib/server/analytics/types.ts`:

```ts
import type { ServerAnalyticsProvider } from '$lib/server/analytics/types';

export const myProvider: ServerAnalyticsProvider = {
	async emit(event) {
		// Send to Meta CAPI, LinkedIn CAPI, Segment, etc.
	},
};
```

Then call `setAnalyticsProvider(myProvider)` in `hooks.server.ts`.

---

## GA4 Measurement Protocol caveats

From [Google's documentation](https://developers.google.com/analytics/devguides/collection/protocol/ga4):

- GA4 MP is designed to **augment** browser-collected events (via GTM/gtag/Firebase), not replace them.
- Pure server-to-server GA4 via MP may result in **partial reporting**: missing session data, attribution gaps, and user deduplication issues.
- For best results, send MP events alongside browser collection — they complement each other using `event_id` for deduplication.
- GA4's reporting UI and attribution models are primarily designed for browser-collected data.

Use GA4 MP for **trusted server-confirmed conversions** (lead form success, payment confirmed), not as a replacement for the GTM → GA4 browser collection path.

---

## PII policy

Server analytics events **must not** contain:

- User names
- Email addresses
- Phone numbers
- IP addresses (do not log client IP in event metadata)
- Free-text message content from form submissions
- Any field whose value originates from user-controlled input and could identify an individual

Use opaque identifiers (`event_id`, internal record IDs) and aggregation-safe metadata (`form_name`, `product_category`) only.
