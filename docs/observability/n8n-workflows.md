# n8n Workflow Conventions

These conventions apply to websites that use n8n as an optional automation layer. They are documented here, not in n8n, because they are part of the website's operational contract.

The site must function correctly whether or not n8n is running. See [docs/automations/README.md](../automations/README.md) for the full automation posture.

---

## Workflow naming convention

```
site:<project>:<domain>:<action>
```

**Examples:**

```
site:acme:lead:capture
site:acme:contact:notify-owner
site:acme:cms:rebuild-on-content-change
site:acme:report:weekly-summary
site:acme:backup:verify-nightly
site:acme:auth:user-welcome
```

**Rules:**

- All lowercase, colon-delimited.
- `<project>` is the site identifier (e.g., `acme`, `mycorp`).
- `<domain>` is the business area (e.g., `lead`, `contact`, `cms`, `auth`, `payment`).
- `<action>` is the specific action (e.g., `capture`, `notify-owner`, `rebuild`).
- No spaces. No slashes.

---

## Required workflow metadata

Each workflow must document the following in the workflow's notes or a linked runbook:

| Field                    | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| **Owner**                | Who is responsible for this workflow?                    |
| **Trigger**              | What starts this workflow? (Webhook, cron, manual)       |
| **Inputs**               | What payload does it expect?                             |
| **Outputs**              | What does it do on success?                              |
| **Secrets used**         | Which env vars does it read? (Names only — never values) |
| **Idempotency key**      | Which payload field prevents duplicate processing?       |
| **Retry behavior**       | How many retries? What backoff?                          |
| **Failure behavior**     | What happens on permanent failure?                       |
| **Manual recovery path** | How to re-run or recover from a stuck execution?         |

---

## Runtime payload

When the SvelteKit app emits a webhook event to n8n, it uses the provider-neutral automation contract:

```ts
import type { AutomationEvent } from '$lib/server/automation/automation-provider';

const event: AutomationEvent<'lead.created'> = {
	event: 'lead.created',
	version: 1,
	occurred_at: new Date().toISOString(),
	idempotency_key: `lead.created:${submissionId}`,
	data: {
		submission_id: submissionId,
		name: formData.name,
		email: formData.email,
		source_path: '/contact',
		request_id: locals.requestId,
		// Do not include passwords, tokens, or sensitive values
	},
};
```

**`data.request_id`** allows correlating n8n execution logs with SvelteKit server logs.

**`version`** allows n8n to handle schema evolution without breaking.

**`idempotency_key`** allows receivers to deduplicate worker retries.

See [docs/automations/runtime-event-contract.md](../automations/runtime-event-contract.md) for the source-of-truth contract.

---

## Failure policy

| Failure type                             | Handling                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| Expected validation failures             | Handle directly in the workflow (e.g., missing required field → return 422) |
| Transient failures (network, rate limit) | Retry with exponential backoff (max 3–5 retries)                            |
| Permanent failures (invalid data, 4xx)   | Send to manual review queue or alert channel; do not retry indefinitely     |
| Unknown failures                         | Trigger the central Error Workflow; alert the owner                         |

**Rules:**

- No infinite retry loops.
- Retries must have a maximum count and an escalation path.
- Permanent failures must result in a human notification, not silent discard.
- The central Error Workflow must catch anything that falls through.

---

## Webhook delivery posture from the SvelteKit side

```ts
// Request handlers enqueue. Provider delivery happens in automation:worker.
await enqueueLeadCreated({
	submissionId,
	sourcePath: '/contact',
	requestId: locals.requestId,
});
```

Never call the webhook provider directly in a user-facing server action. Insert an
outbox row in the same transaction as the primary write, then let `bun run
automation:worker` deliver and retry.

---

## Security posture

- **Do not expose the n8n editor publicly.** Bind to `127.0.0.1` and access through an SSH tunnel, VPN, or Caddy basic auth.
- **Authenticate every webhook.** The default `header` auth mode uses n8n's
  built-in Header Auth credential and returns 401 on mismatch with no code.
  HMAC mode is the stronger opt-in. See
  [docs/automations/n8n-workflow-contract.md](../automations/n8n-workflow-contract.md)
  for both flows.
- **Keep n8n patched.** Subscribe to n8n release notes for security advisories.
- **Avoid Code nodes unless necessary.** Use built-in nodes when possible; Code nodes bypass type safety.
- **Never paste secrets into workflow notes or documentation.** Use n8n credentials or environment variables.
- **Run a separate n8n instance per client.** n8n is not multi-tenant; one
  shared instance leaks credentials, workflow definitions, and execution
  history across clients.
- **Treat n8n as production infrastructure** once it handles leads, customers, publishing, revenue, or important content.
- **Back up n8n's internal database** as part of the regular backup plan once workflows are in production. (n8n shares the per-client Postgres instance, so the standard PITR backup covers both site data and n8n state atomically.)

---

## When n8n is the right call

n8n is the default automation path for sites built from this template. Set
`AUTOMATION_PROVIDER=noop` only when a site has no automation needs at all —
this is an explicit operator choice that production preflight allows.
`AUTOMATION_PROVIDER=webhook` remains as an escape hatch for Make, Zapier,
or custom HTTP receivers; production preflight requires its URL+secret too.
