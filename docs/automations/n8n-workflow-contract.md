# n8n Workflow Contract

This is the wire contract for n8n workflows that receive events from the
platform fleet worker. n8n is external to the website repo.

## Ownership

- Website repo: writes source rows and minimized outbox rows.
- Platform repo: reads client provider config, runs the fleet worker, and sends
  HTTP deliveries.
- n8n: receives authenticated events and fans them out to Slack, email, CRM, or
  other systems.

Production webhook URL and secret live in `platform-infrastructure/secrets.yaml`.
Local one-shot worker tests may still use `.env` values in a website clone.

## Request

```http
POST <N8N_WEBHOOK_URL>
Content-Type: application/json
X-Site-Auth: <N8N_WEBHOOK_SECRET>
X-Site-Event-Id: <slug>:<eventId>:<eventType>
X-Site-Event-Type: lead.created
X-Site-Timestamp: <ISO-8601 UTC>
```

```json
{
	"event": "lead.created",
	"version": 1,
	"occurred_at": "2026-05-08T12:00:00.000Z",
	"idempotency_key": "client-a:event-uuid:lead.created",
	"data": {
		"submission_id": "sub-uuid",
		"name": "Alice Example",
		"email": "alice@example.com",
		"source_path": "/contact",
		"request_id": "req-abc"
	}
}
```

## Receiver Rules

- Authenticate every webhook.
- Deduplicate by `idempotency_key`.
- Return a 2xx response only after n8n has accepted the event.
- Keep workflow logs and execution history scoped per client.
- Do not assume database access; n8n receives HTTP events only.

## Failure Behavior

The form action is unaffected by n8n outages because the source row and outbox
row already committed. The fleet worker retries transient failures with backoff
and dead-letters exhausted events in the client's own database.

Inspect dead letters through the platform repo's fleet tooling.

## PII

The outbox row stores minimized references. The delivery envelope may contain
the fields needed by the receiver, so n8n execution history must be treated as
client production data.
