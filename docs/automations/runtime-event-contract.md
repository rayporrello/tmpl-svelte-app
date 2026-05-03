# Runtime Event Contract

Runtime automation events use one provider-neutral JSON envelope. n8n, Make, Zapier, custom webhooks, console logging, and noop all receive or process this same shape.

---

## TypeScript Contract

```ts
export type AutomationProviderName = 'n8n' | 'webhook' | 'console' | 'noop';

export interface LeadCreatedAutomationData {
	submission_id: string;
	name: string;
	email: string;
	source_path?: string | null;
	request_id?: string | null;
}

export interface AutomationEventDataMap {
	'lead.created': LeadCreatedAutomationData;
}

export type AutomationEventName = keyof AutomationEventDataMap;

export type AutomationEvent<TName extends AutomationEventName = AutomationEventName> = {
	event: TName;
	version: 1;
	occurred_at: string;
	idempotency_key?: string;
	data: AutomationEventDataMap[TName];
};

export type AutomationSendResult =
	| { ok: true; provider: AutomationProviderName; delivered: true; status?: number }
	| {
			ok: true;
			provider: AutomationProviderName;
			delivered: false;
			skipped: true;
			reason: 'disabled' | 'not_configured';
	  }
	| {
			ok: false;
			provider: AutomationProviderName;
			failure: 'timeout' | 'network' | 'http' | 'configuration';
			error: string;
			status?: number;
	  };

export interface AutomationProvider {
	send(event: AutomationEvent): Promise<AutomationSendResult>;
}
```

The implemented type source of truth is
`src/lib/server/automation/automation-provider.ts`. Worker delivery handlers are
registered in `src/lib/server/automation/registry.ts`.

---

## Event Catalog

| Event          | Version | Trigger                                      |
| -------------- | ------- | -------------------------------------------- |
| `lead.created` | `1`     | Contact form submitted and saved to Postgres |

Add new events only when a real form/action emits them. Follow
[docs/forms/README.md](../forms/README.md) for the source table, outbox,
registry, and testing checklist.

---

## `lead.created`

```json
{
	"event": "lead.created",
	"version": 1,
	"occurred_at": "2026-04-29T12:00:00.000Z",
	"idempotency_key": "lead.created:sub-123",
	"data": {
		"submission_id": "sub-123",
		"name": "Alice Example",
		"email": "alice@example.com",
		"source_path": "/contact",
		"request_id": "req-abc"
	}
}
```

Field notes:

- `submission_id` is the Postgres contact submission ID.
- `idempotency_key` is stable for the source record and lets receivers deduplicate retries.
- `source_path` is the page path that produced the lead when known.
- `request_id` correlates receiver logs with SvelteKit server logs.

---

## Delivery Rules

- Providers make one delivery attempt per worker attempt.
- HTTP providers send `Content-Type: application/json`.
- HTTP providers sign with `X-Webhook-Signature` when a secret is configured.
- HTTP providers with no URL return `not_configured`.
- `console` returns delivered after logging metadata.
- `noop` returns `disabled`.
- Retries, backoff, and outbox scheduling are owned by `bun run automation:worker`.
