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

| Field | Description |
|-------|-------------|
| **Owner** | Who is responsible for this workflow? |
| **Trigger** | What starts this workflow? (Webhook, cron, manual) |
| **Inputs** | What payload does it expect? |
| **Outputs** | What does it do on success? |
| **Secrets used** | Which env vars does it read? (Names only — never values) |
| **Idempotency key** | Which payload field prevents duplicate processing? |
| **Retry behavior** | How many retries? What backoff? |
| **Failure behavior** | What happens on permanent failure? |
| **Manual recovery path** | How to re-run or recover from a stuck execution? |

---

## Recommended website-to-n8n payload

When the SvelteKit app emits a webhook event to n8n, use this shape:

```ts
import type { WorkflowEventPayload } from '$lib/observability/types';

const event: WorkflowEventPayload = {
  request_id: locals.requestId,
  site_id: 'acme',                           // matches project name in workflow naming
  environment: process.env.NODE_ENV ?? 'development',
  event_type: 'lead.created',
  occurred_at: new Date().toISOString(),
  idempotency_key: `lead-${formData.email}-${Date.now()}`,
  payload_version: '1',
  payload: {
    name: formData.name,
    email: formData.email,
    source: 'contact-form'
    // Do not include passwords, tokens, or sensitive values
  }
};
```

**`request_id`** allows correlating n8n execution logs with SvelteKit server logs.

**`idempotency_key`** allows n8n to detect and ignore duplicate webhook deliveries on retries.

**`payload_version`** allows n8n to handle schema evolution without breaking.

---

## Failure policy

| Failure type | Handling |
|-------------|---------|
| Expected validation failures | Handle directly in the workflow (e.g., missing required field → return 422) |
| Transient failures (network, rate limit) | Retry with exponential backoff (max 3–5 retries) |
| Permanent failures (invalid data, 4xx) | Send to manual review queue or alert channel; do not retry indefinitely |
| Unknown failures | Trigger the central Error Workflow; alert the owner |

**Rules:**
- No infinite retry loops.
- Retries must have a maximum count and an escalation path.
- Permanent failures must result in a human notification, not silent discard.
- The central Error Workflow must catch anything that falls through.

---

## Webhook delivery posture from the SvelteKit side

```ts
// Non-blocking webhook call — n8n downtime must not break the user-facing form
if (env.N8N_WEBHOOK_URL) {
  fetch(env.N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': env.N8N_WEBHOOK_SECRET
    },
    body: JSON.stringify(event)
  }).catch((err) => {
    logger.warn('n8n webhook delivery failed (non-blocking)', {
      requestId: locals.requestId,
      errorMessage: err.message
    });
  });
}
```

Never `await` the webhook call in a user-facing server action. Use fire-and-forget.

---

## Security posture

- **Do not expose the n8n editor publicly.** Bind to `127.0.0.1` and access through an SSH tunnel or VPN.
- **Validate webhook payloads.** Verify the `x-webhook-secret` header in n8n's webhook node.
- **Keep n8n patched.** Subscribe to n8n release notes for security advisories.
- **Avoid Code nodes unless necessary.** Use built-in nodes when possible; Code nodes bypass type safety.
- **Never paste secrets into workflow notes or documentation.** Use n8n credentials or environment variables.
- **Treat n8n as production infrastructure** once it handles leads, customers, publishing, revenue, or important content.
- **Back up n8n's internal database** as part of the regular backup plan once workflows are in production.

---

## n8n is optional

Sites that do not use n8n do not need any of these conventions. The `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET` env vars are in `.env.example` but empty. All webhook code must check `N8N_WEBHOOK_URL` and skip silently when unset.
