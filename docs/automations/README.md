# Automations

The durable outbox and worker are part of the default production appliance.
External workflow delivery is optional per ADR-024. `AUTOMATION_PROVIDER` unset
or `noop` is valid in production: the required worker still processes outbox
rows, but no external delivery is attempted.

n8n is an opt-in external automation path for sites that need workflow
orchestration. Per ADR-027 it is not bundled with the website appliance; use
n8n.cloud or a separately hosted n8n instance. The website captures the lead in
Postgres first, then the worker delivers events from a durable outbox so a
brief receiver outage cannot lose leads.

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

`AUTOMATION_PROVIDER` values are `noop`, `n8n`, `webhook`, and `console`.
Unset resolves to `noop`. Production preflight (`bun run deploy:preflight`) and
launch (`bun run check:launch`) **fail** only when the selected provider is not
production-valid or is missing its provider-specific config.

| Provider  | Use                                                                                         | Required env                                                  | Production gate                                                                                          |
| --------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `n8n`     | External n8n instance (shared self-hosted or n8n.cloud) using the n8n-specific body shape.  | `N8N_WEBHOOK_URL` (HTTPS), `N8N_WEBHOOK_SECRET`               | Required: URL must be HTTPS, secret must be set. n8n is external per ADR-027.                            |
| `webhook` | External non-n8n platform: Make, Zapier, custom backend, or any generic HTTP POST receiver. | `AUTOMATION_WEBHOOK_URL` (HTTPS), `AUTOMATION_WEBHOOK_SECRET` | Required: URL must be HTTPS, secret must be set.                                                         |
| `console` | Local dev visibility without outbound calls. Worker logs the envelope.                      | none                                                          | **Forbidden in production.** Preflight and launch both fail with a hint to use `n8n` or explicit `noop`. |
| `noop`    | Sites that have no automations. Worker marks events delivered silently.                     | none                                                          | Allowed when set explicitly or when `AUTOMATION_PROVIDER` is unset.                                      |

Provider-specific secrets are conditional. n8n secrets are required only when
`AUTOMATION_PROVIDER=n8n`; generic webhook secrets are required only when
`AUTOMATION_PROVIDER=webhook`. If a site has no automation needs yet, leave the
provider unset or set `AUTOMATION_PROVIDER=noop` deliberately. Preflight will
pass; the worker remains installed and durable outbox behavior is still present.

The three real production cases are:

- **No automation:** `AUTOMATION_PROVIDER=noop`. The outbox worker logs and
  completes rows without external delivery.
- **External non-n8n platform:** `AUTOMATION_PROVIDER=webhook` with URL and
  secret. Use this for Zapier, Make, or custom HTTPS receivers.
- **External n8n:** `AUTOMATION_PROVIDER=n8n` with `N8N_WEBHOOK_URL` and
  `N8N_WEBHOOK_SECRET`, pointing at n8n.cloud or a separately hosted n8n
  instance.

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
- [ADR-024](../planning/adrs/ADR-024-lead-gen-website-appliance.md) — default lead-gen appliance contract
- [ADR-027](../planning/adrs/ADR-027-lead-gen-bundle-excludes-n8n.md) — n8n is external, not bundled
