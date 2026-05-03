# Automation Security and Secrets

Automation providers use one event contract and one signing scheme. Keep provider-specific behavior in the receiver workflow or scenario, not in the SvelteKit sender.

---

## Environment Variables

| Variable                    | Provider  | Purpose                                                         |
| --------------------------- | --------- | --------------------------------------------------------------- |
| `AUTOMATION_PROVIDER`       | all       | `n8n`, `webhook`, `console`, or `noop`; defaults to `n8n`       |
| `N8N_WEBHOOK_URL`           | `n8n`     | n8n HTTP Trigger URL                                            |
| `N8N_WEBHOOK_SECRET`        | `n8n`     | Shared HMAC secret for n8n delivery                             |
| `AUTOMATION_WEBHOOK_URL`    | `webhook` | Generic HTTP POST receiver URL for Make, Zapier, or custom APIs |
| `AUTOMATION_WEBHOOK_SECRET` | `webhook` | Shared HMAC secret for generic webhook delivery                 |

`console` and `noop` require no provider-specific URL or secret.

HTTP providers with an empty URL skip cleanly with `reason: 'not_configured'`. The app still builds, starts, and serves forms without an automation receiver.

---

## Secret Management

Follow the template's standard SOPS + age workflow. See [docs/deployment/secrets.md](../deployment/secrets.md).

- Real webhook URLs and secrets belong in encrypted `secrets.yaml`, not in source code.
- `.env.example` documents variable names with empty or safe example values.
- Never commit real webhook URLs; treat them as credentials.
- Receiver-side credentials, such as GitHub tokens or CRM API keys, belong in the receiver's credential store.

---

## HMAC Signing

All production HTTP provider calls should be signed with HMAC-SHA256 over the exact JSON request body.

```ts
import { createHmac } from 'node:crypto';

const body = JSON.stringify(event);
const signature = createHmac('sha256', secret).update(body, 'utf8').digest('hex');

await fetch(url, {
	method: 'POST',
	headers: {
		'Content-Type': 'application/json',
		'X-Webhook-Signature': signature,
	},
	body,
});
```

We send a 64-char hex digest, no prefix. Receivers expecting GitHub-style `sha256=<hex>` must either prepend it client-side or configure the receiver to accept raw hex.

Receivers should verify the signature by computing the same digest over the raw request body and comparing with a timing-safe comparison.

---

## Local Development

Use `AUTOMATION_PROVIDER=console` to inspect worker-built events without making outbound calls.

Use `AUTOMATION_PROVIDER=noop` to disable automation explicitly.

For n8n local testing, expose the n8n HTTP Trigger URL with a tunnel if needed, then set:

```bash
AUTOMATION_PROVIDER=n8n
N8N_WEBHOOK_URL=https://your-tunnel.example/webhook/YOUR_ID
N8N_WEBHOOK_SECRET=a-long-random-string
```

For Make, Zapier, or a custom receiver:

```bash
AUTOMATION_PROVIDER=webhook
AUTOMATION_WEBHOOK_URL=https://hooks.example.com/receiver
AUTOMATION_WEBHOOK_SECRET=a-long-random-string
```

Never commit tunnel URLs or local receiver credentials.

---

## Production Checklist

- [ ] `AUTOMATION_PROVIDER` is set intentionally or left unset to use `n8n`.
- [ ] The selected HTTP provider has its URL set.
- [ ] The selected HTTP provider has a strong shared secret.
- [ ] The receiver verifies `X-Webhook-Signature`.
- [ ] Failed delivery does not propagate to the user-facing form.
- [ ] Dead-letter records do not persist full webhook payloads.
- [ ] Receiver credentials are stored in the receiver's credential store, not this repo.
