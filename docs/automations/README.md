# Automations

This template is automation-ready without being tied to one automation product. n8n remains the default provider, but clones can switch runtime delivery to Make, Zapier, a custom HTTP receiver, console logging, or nothing by changing environment configuration instead of form/action code.

---

## Design principle

The SvelteKit app owns one generic event contract. Providers only decide where that same event is delivered.

Runtime automation flow:

1. A server action validates input and saves the primary record to Postgres.
2. The same transaction inserts a minimized outbox event in `automation_events`.
3. `bun run automation:worker` claims pending rows with Postgres locking.
4. The worker joins back to source tables, sends the typed event, retries with backoff, and dead-letters exhausted failures.

The user-facing form stays successful after the DB transaction commits. Provider downtime affects the worker, not the request lifecycle.

---

## Providers

`AUTOMATION_PROVIDER` defaults to `n8n` when unset.

| Provider  | Use case                                        | Config                                                |
| --------- | ----------------------------------------------- | ----------------------------------------------------- |
| `n8n`     | Default self-hosted automation operator         | `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`               |
| `webhook` | Make, Zapier, or any generic HTTP POST receiver | `AUTOMATION_WEBHOOK_URL`, `AUTOMATION_WEBHOOK_SECRET` |
| `console` | Development visibility without outbound calls   | none                                                  |
| `noop`    | Sites that intentionally disable automation     | none                                                  |

HTTP providers with no URL return a clean `not_configured` skip result. `console` logs metadata through the structured logger. `noop` returns a deliberate `disabled` skip result.

---

## Runtime Event Contract

Every provider receives the same versioned JSON envelope:

```ts
{
	event: 'lead.created',
	version: 1,
	occurred_at: '2026-04-29T12:00:00.000Z',
	idempotency_key: 'lead.created:sub-123',
	data: {
		submission_id: 'sub-123',
		name: 'Alice Example',
		email: 'alice@example.com',
		source_path: '/contact',
		request_id: 'req-abc'
	}
}
```

See [runtime-event-contract.md](runtime-event-contract.md) for the full TypeScript contract and event catalog.

When adding a new business form, also follow [docs/forms/README.md](../forms/README.md).
Scaffolded forms use `business_form.submitted` by default, which carries only
source identifiers. Add a bespoke event type only when a project needs a
provider payload with project-specific fields; bespoke events need an envelope,
enqueue helper, handler registry entry, docs, and tests.

Migration note for existing n8n workflows:

```diff
- { id, type, createdAt, payload }
+ { event, version, occurred_at, data }
```

Update any active workflow expressions from `type`/`createdAt`/`payload` to `event`/`occurred_at`/`data` before deploying this change.

---

## What Ships

- A production-ready contact form at `src/routes/contact/`
- `enqueueLeadCreated()` / `emitLeadCreated()` at `src/lib/server/automation/events.ts`
- `enqueueBusinessFormSubmitted()` for scaffolded typed forms
- Automation handler registry at `src/lib/server/automation/registry.ts`
- `bun run automation:worker` for durable delivery, retry, and dead-lettering
- `AutomationProvider` at `src/lib/server/automation/automation-provider.ts`
- Static provider resolver at `src/lib/server/automation/providers/index.ts`
- Four providers: `n8n`, `webhook`, `console`, `noop`
- `automation_events` table for minimized outbox state
- `automation_dead_letters` table for failed delivery diagnostics without full payload copies

Dead letters store `event_id`, `event_type`, and `error` only. They do not store full payloads because runtime event data can contain contact information.

---

## Content Automations

Content automations are separate from runtime events. Any external automation that writes files to `content/` must follow the same schema as Sveltia CMS.

Examples:

- HR system creates `content/team/{slug}.yml`
- Review platform creates `content/testimonials/{slug}.yml`
- ATS creates `content/jobs/{slug}.md` after a jobs collection is added
- Broken-link monitor crawls `/sitemap.xml` and sends an alert

See [content-automation-contract.md](content-automation-contract.md) for the rules every content-writing automation must follow.

---

## Further Reading

- [runtime-event-contract.md](runtime-event-contract.md) — generic runtime event contract
- [security-and-secrets.md](security-and-secrets.md) — secrets, provider env vars, and HMAC signing
- [content-automation-contract.md](content-automation-contract.md) — rules for writing content files from automation
- [n8n-patterns.md](n8n-patterns.md) — examples for the default n8n provider
- [docs/cms/README.md](../cms/README.md) — how content files work
