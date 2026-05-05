# Automations

n8n is the default automation path for sites built from this template. It is
self-hosted, free, and matches the "lead-gen websites on a Linux box" model
this template is built around. The website captures the lead in Postgres
first; the worker delivers events to n8n from a durable outbox so a brief n8n
outage cannot lose leads.

For the wire-level contract — payload shape, headers, auth modes, retry and
dead-letter behavior, the standard "lead → Slack → email" workflow shape, and
what to do when n8n is down — see
[n8n-workflow-contract.md](n8n-workflow-contract.md).

---

## Reliability principle

> The website's job is to capture the lead reliably. n8n's job is to fan it
> out to Slack, email, CRM, sheets. Those are independent failure domains.

The form action does NOT call n8n. It writes the source record and the
outbox event in one Postgres transaction:

1. A server action validates input and saves the primary record to Postgres.
2. **In the same transaction** it inserts a minimized outbox row in `automation_events`.
3. `bun run automation:worker:daemon` (a required per-site worker container in production) claims
   pending rows with Postgres `SKIP LOCKED`.
4. The worker joins back to source tables, builds the typed event, sends it
   to n8n with auth + observability headers, retries transient failures with
   exponential backoff (60s → 1h cap), and dead-letters after `max_attempts`.

Result: a failed n8n deployment does not affect the user response. A
restored n8n picks up the backlog from the outbox automatically. A lead that
exhausts retries lands in `automation_dead_letters` with the error string,
ready for manual replay.

---

## Providers

`AUTOMATION_PROVIDER` defaults to `n8n`. Production preflight (`bun run deploy:preflight`)
and launch (`bun run check:launch`) **fail** if the resolved provider is missing
required config — silent skips are not allowed in production.

| Provider  | Use                                                                     | Required env                                                  | Production gate                                                                                                                     |
| --------- | ----------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `n8n`     | Per-client n8n instance for sites that need workflow orchestration.     | `N8N_WEBHOOK_URL` (HTTPS), `N8N_WEBHOOK_SECRET`               | Required: URL must be HTTPS, secret must be set. Run `bun run n8n:enable` before installing the n8n Quadlet for this client.        |
| `webhook` | Escape hatch for Make, Zapier, or any generic HTTP POST receiver.       | `AUTOMATION_WEBHOOK_URL` (HTTPS), `AUTOMATION_WEBHOOK_SECRET` | Required: URL must be HTTPS, secret must be set.                                                                                    |
| `console` | Local dev visibility without outbound calls. Worker logs the envelope.  | none                                                          | **Forbidden in production.** Preflight and launch both fail with a hint to use `n8n` or explicit `noop`.                            |
| `noop`    | Sites that have no automations. Worker marks events delivered silently. | none                                                          | Allowed when set explicitly. Used as the explicit "this site has no automation" signal so leads aren't lost to a misconfigured n8n. |

If a site has no automation needs yet, set `AUTOMATION_PROVIDER=noop`
deliberately rather than leaving n8n configured-but-empty. Preflight will
pass; the operator's intent is recorded.

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
- `bun run automation:worker:daemon` for durable production delivery, retry, and dead-lettering
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

- [n8n-workflow-contract.md](n8n-workflow-contract.md) — wire-level contract: headers, auth modes, payload, replay, what to do when n8n is down
- [runtime-event-contract.md](runtime-event-contract.md) — TypeScript event contract used by the worker and providers
- [security-and-secrets.md](security-and-secrets.md) — secrets, provider env vars, auth modes
- [content-automation-contract.md](content-automation-contract.md) — rules for writing content files from automation
- [n8n-patterns.md](n8n-patterns.md) — concrete workflow examples for n8n
- [docs/cms/README.md](../cms/README.md) — how content files work
