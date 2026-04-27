# Automation Security and Secrets

How to handle secrets, credentials, and webhook security for n8n automations.

---

## Environment variables for n8n integration

Two variables are reserved for n8n:

```bash
N8N_WEBHOOK_URL=        # The n8n webhook endpoint (HTTP Trigger node URL)
N8N_WEBHOOK_SECRET=     # Shared secret for HMAC request signing
```

These are listed in `.env.example` as empty placeholders. They are not required for the app to build or run — the webhook code must check for their presence and skip silently if they are not set.

```ts
const url = env.N8N_WEBHOOK_URL;
if (!url) return; // n8n not configured — skip without error
```

---

## Secret management

Follow the template's standard SOPS + age workflow. See [docs/deployment/secrets.md](../deployment/secrets.md).

- Real webhook URLs and secrets belong in `secrets.yaml` (encrypted), not in code or `.env.example`
- The `.env.example` file documents the variable names with empty values
- Never commit the actual webhook URL — it is equivalent to a credential
- n8n credentials (GitHub token, email provider, etc.) live in n8n's own credential store, not in this repo

---

## Production webhook signing

All production webhook calls from SvelteKit to n8n must be signed using HMAC-SHA256 with the shared secret:

```ts
import { createHmac } from 'node:crypto';

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

// In the server action:
const body = JSON.stringify(event);
const signature = sign(body, env.N8N_WEBHOOK_SECRET);

fetch(env.N8N_WEBHOOK_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Webhook-Signature': `sha256=${signature}`
  },
  body
});
```

In n8n, verify the signature using the same secret in the HTTP Trigger node's authentication settings, or in a Code node at the start of the workflow.

**Do not use unsigned webhooks in production.** An unsigned webhook endpoint is a public API that anyone can call.

---

## n8n GitHub access

n8n needs a GitHub Personal Access Token (or GitHub App installation token) to write content files through the GitHub API.

Least-privilege setup:
- Create a dedicated GitHub account or GitHub App for n8n automation
- Grant access only to the specific repository
- Use `Contents: write` scope only (or equivalent GitHub App permission)
- Store the token in n8n's GitHub credential — not in this repo or `.env.example`
- Rotate the token annually or when team composition changes

---

## Local development

For local development, n8n webhooks are typically not active. The `N8N_WEBHOOK_URL` variable should be empty in the local `.env`. The server code must handle this gracefully — no webhook call, no error.

If you need to test webhook delivery locally:
1. Use n8n's local development instance (self-hosted or n8n Desktop)
2. Use `ngrok` or a similar tunnel to expose a local n8n instance
3. Set `N8N_WEBHOOK_URL` in your local `.env` to the tunnel URL

Never commit the tunnel URL or local n8n credentials to the repo.

---

## Checklist before enabling automations in production

- [ ] `N8N_WEBHOOK_URL` is set in the production environment (via SOPS + age secrets workflow)
- [ ] `N8N_WEBHOOK_SECRET` is a strong random secret (at least 32 bytes, generated with `openssl rand -hex 32`)
- [ ] n8n HTTP Trigger node verifies the `X-Webhook-Signature` header
- [ ] Webhook delivery is non-blocking (server action does not await the fetch)
- [ ] n8n failure does not propagate an error to the end user
- [ ] n8n GitHub token has minimum required permissions
- [ ] n8n GitHub token is stored in n8n credential store, not in this repo
