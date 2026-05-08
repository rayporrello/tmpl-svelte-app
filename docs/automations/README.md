# Automations

The website writes durable outbox rows. Production delivery is handled by the
platform fleet worker.

## Principle

The user-facing form action never calls n8n, Zapier, Make, or any webhook
receiver. It writes the source row and minimized outbox event in one Postgres
transaction. Delivery happens later.

## What Lives Here

- `src/lib/server/automation/events.ts` enqueue helpers
- `src/lib/server/automation/envelopes.ts` envelope builders
- `src/lib/server/automation/registry.ts` event registry
- `scripts/automation-worker.ts` one-shot local development worker
- `automation_events` and `automation_dead_letters` schema

## What Moved To Platform

Production provider config and daemon delivery moved out of this repo:

- provider name
- webhook URL
- webhook secret
- auth mode/header
- fleet-worker concurrency and polling
- dead-letter fleet views

The platform worker reads provider config from platform secrets per client and
sends each delivery with an idempotency key shaped like
`<slug>:<eventId>:<eventType>`.

## Local Worker

Use the one-shot worker when testing local outbox behavior:

```bash
bun run automation:worker
```

Optional local provider env vars remain supported:

- `AUTOMATION_PROVIDER`
- `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`,
  `N8N_WEBHOOK_AUTH_MODE`, `N8N_WEBHOOK_AUTH_HEADER`
- `AUTOMATION_WEBHOOK_URL`, `AUTOMATION_WEBHOOK_SECRET`,
  `AUTOMATION_WEBHOOK_AUTH_MODE`, `AUTOMATION_WEBHOOK_AUTH_HEADER`

These are local-dev values in this repo. Production values live in
`platform-infrastructure/secrets.yaml`.

## Dead Letters

Dead letters store `event_id`, `event_type`, error text, and timestamps only.
They must not contain full webhook payloads or contact PII.

## Further Reading

- [runtime-event-contract.md](runtime-event-contract.md)
- [n8n-workflow-contract.md](n8n-workflow-contract.md)
- [security-and-secrets.md](security-and-secrets.md)
- [../forms/README.md](../forms/README.md)
- [ADR-031](../planning/adrs/ADR-031-shared-infrastructure-cell.md)
