# Runtime Event Contract

Design specification for Phase 5 typed automation events. **Not yet implemented.** This document defines the target shape so that implementation is consistent with the automation architecture.

---

## Overview

When Phase 5 runtime forms are implemented, server actions will:

1. Validate input (Superforms + Valibot)
2. Save the record to Postgres
3. Emit a typed webhook event to n8n (non-blocking)
4. Return the response to the user immediately — independent of whether n8n is available

The user experience is never affected by n8n downtime or latency.

---

## Event types (planned)

| Event type              | Trigger                         |
| ----------------------- | ------------------------------- |
| `lead.created`          | Contact form submitted          |
| `newsletter.subscribed` | Newsletter signup submitted     |
| `testimonial.submitted` | User testimonial form submitted |

Add new event types when new forms or actions are implemented. Keep the list minimal — only add types that have a corresponding n8n workflow.

---

## Event payload shape

```ts
interface AutomationEvent<T = Record<string, unknown>> {
	type: string; // e.g., 'lead.created'
	occurred_at: string; // ISO 8601 UTC timestamp
	source: string; // e.g., 'resolvhq.com/contact'
	payload: T; // event-specific data
}
```

### Example: lead.created

```json
{
	"type": "lead.created",
	"occurred_at": "2026-04-27T14:30:00Z",
	"source": "example.com/contact",
	"payload": {
		"name": "Jordan Kim",
		"email": "jordan@example.com",
		"message": "I'd like to learn more about your services.",
		"lead_id": "01JXYZ..."
	}
}
```

### Example: newsletter.subscribed

```json
{
	"type": "newsletter.subscribed",
	"occurred_at": "2026-04-27T14:31:00Z",
	"source": "example.com/",
	"payload": {
		"email": "alex@example.com",
		"subscriber_id": "01JXYZ..."
	}
}
```

---

## Webhook delivery requirements

- **Non-blocking:** The server action must return a response to the user before the webhook completes. Use `fetch()` without `await` (fire-and-forget) or wrap in a non-awaited promise.
- **Resilient:** n8n downtime must not cause the form submission to fail. Catch webhook errors and log them — never propagate them to the user.
- **Signed:** Production webhook calls must include an HMAC signature header. See [docs/automations/security-and-secrets.md](security-and-secrets.md).

```ts
// Pseudocode — non-blocking webhook emission
async function emitEvent(event: AutomationEvent): Promise<void> {
	const url = env.N8N_WEBHOOK_URL;
	if (!url) return; // n8n not configured — silently skip

	// Non-blocking — do not await
	fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Webhook-Signature': sign(event, env.N8N_WEBHOOK_SECRET),
		},
		body: JSON.stringify(event),
	}).catch((err) => {
		console.error('[automation] webhook delivery failed:', err);
	});
}
```

---

## Optional: automation_events table

For production sites with strict audit requirements, consider an `automation_events` table in Postgres:

```sql
CREATE TABLE automation_events (
  id          TEXT PRIMARY KEY,        -- ULID
  type        TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  source      TEXT NOT NULL,
  payload     JSONB NOT NULL,
  delivered   BOOLEAN DEFAULT FALSE,
  delivered_at TIMESTAMPTZ,
  error       TEXT
);
```

This enables retry logic, delivery confirmation, and audit history. It is optional — add it only when the project requires it.

---

## Implementation checklist (Phase 5)

- [ ] Add `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET` to `.env.example` and `secrets.example.yaml`
- [ ] Implement `emitEvent()` helper in `src/lib/automation/events.ts`
- [ ] Implement HMAC signing in `src/lib/automation/signing.ts`
- [ ] Wire `emitEvent()` into each form server action after the Postgres write
- [ ] Confirm webhook does not block form response on n8n timeout
- [ ] Test with n8n unavailable — form must still succeed
- [ ] Document each event type in this file when implemented
