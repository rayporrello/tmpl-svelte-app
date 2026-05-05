# Automation Security and Secrets

Automation providers use one event contract. Auth uses the same shared secret
in two interchangeable modes — Header auth (default) or HMAC body signing
(stronger, opt-in). Provider-specific behavior lives in the receiver
workflow, not in the SvelteKit sender.

The wire-level contract — payload shape, headers, both auth modes,
idempotency, replay, dead-letter handling — lives in
[n8n-workflow-contract.md](n8n-workflow-contract.md). This doc focuses on
secret management and the env contract.

---

## Environment Variables

| Variable                         | Provider  | Purpose                                                         |
| -------------------------------- | --------- | --------------------------------------------------------------- |
| `AUTOMATION_PROVIDER`            | all       | `n8n`, `webhook`, `console`, or `noop`; defaults to `n8n`       |
| `N8N_WEBHOOK_URL`                | `n8n`     | n8n HTTP Trigger URL (must be HTTPS in production)              |
| `N8N_WEBHOOK_SECRET`             | `n8n`     | Shared secret used by Header auth or HMAC                       |
| `N8N_WEBHOOK_AUTH_MODE`          | `n8n`     | `header` (default) or `hmac`                                    |
| `N8N_WEBHOOK_AUTH_HEADER`        | `n8n`     | Header name in `header` mode (default `X-Site-Auth`)            |
| `AUTOMATION_WEBHOOK_URL`         | `webhook` | Generic HTTP POST receiver URL for Make, Zapier, or custom APIs |
| `AUTOMATION_WEBHOOK_SECRET`      | `webhook` | Shared secret used by Header auth or HMAC                       |
| `AUTOMATION_WEBHOOK_AUTH_MODE`   | `webhook` | `header` (default) or `hmac`                                    |
| `AUTOMATION_WEBHOOK_AUTH_HEADER` | `webhook` | Header name in `header` mode (default `X-Site-Auth`)            |

`console` and `noop` require no provider-specific URL or secret.

**Production preflight is strict.** `bun run deploy:preflight` and
`bun run check:launch` both **fail** if `AUTOMATION_PROVIDER` is `n8n`/`webhook`
without a URL+secret, or if it is `console` (which is dev-only). Set
`AUTOMATION_PROVIDER=noop` explicitly when a site has no automation needs.

---

## Secret Management

Follow the template's standard SOPS + age workflow. See [docs/deployment/secrets.md](../deployment/secrets.md).

- Real webhook URLs and secrets belong in encrypted `secrets.yaml`, not in source code.
- `.env.example` documents variable names with empty or safe example values.
- Never commit real webhook URLs; treat them as credentials.
- Receiver-side credentials, such as GitHub tokens or CRM API keys, belong in the receiver's credential store.
- The shared secret should be a long random string. Generate with `openssl rand -base64 48`.

---

## Auth Modes

Pick one mode per site. The site uses the same `N8N_WEBHOOK_SECRET` value in
both — `N8N_WEBHOOK_AUTH_MODE` decides how it's transmitted.

### Header auth (default)

The site sends the secret as a header value:

```
X-Site-Auth: <N8N_WEBHOOK_SECRET>
```

n8n's Webhook node has built-in **Header Auth** that returns 401 on mismatch
without writing any code. This is the recommended default because it is the
simplest configuration that is hard to get wrong.

### HMAC body signing (opt-in)

Set `N8N_WEBHOOK_AUTH_MODE=hmac`. The site signs the JSON body with
HMAC-SHA256 and sends:

```
X-Webhook-Signature: <hex(HMAC-SHA256(body, secret))>
```

```ts
import { createHmac } from 'node:crypto';

const body = JSON.stringify(event);
const signature = createHmac('sha256', secret).update(body, 'utf8').digest('hex');
```

We send a 64-char hex digest, no prefix. Receivers expecting GitHub-style
`sha256=<hex>` must either prepend it client-side or configure the receiver
to accept raw hex. n8n requires a Code node after the Webhook node to verify
HMAC; use this mode when authenticating the body itself matters.

In both modes, the site also sends:

```
X-Site-Event-Id: <idempotency-key>
X-Site-Event-Type: <event-name>
X-Site-Timestamp: <ISO-8601 UTC>
```

These are observability headers — they let n8n logs and downstream systems
correlate without parsing the body.

---

## Local Development

Use `AUTOMATION_PROVIDER=console` to inspect worker-built events without
making outbound calls. The structured logger emits the envelope and metadata.

Use `AUTOMATION_PROVIDER=noop` to disable automation explicitly. The worker
still drains the outbox, just doesn't deliver — useful for sites that don't
need automations or for local testing where you don't care about the call.

For n8n local testing, expose the n8n HTTP Trigger URL with a tunnel if
needed, then set:

```bash
AUTOMATION_PROVIDER=n8n
N8N_WEBHOOK_URL=https://your-tunnel.example/webhook/YOUR_ID
N8N_WEBHOOK_SECRET=a-long-random-string
# Header auth is the default; uncomment to switch to HMAC.
# N8N_WEBHOOK_AUTH_MODE=hmac
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

- [ ] `AUTOMATION_PROVIDER` is set intentionally (`n8n`, `webhook`, or `noop`).
- [ ] If `n8n` or `webhook`: the URL is HTTPS and reachable from the production host.
- [ ] If `n8n` or `webhook`: the shared secret is a long random string.
- [ ] If `n8n` or `webhook`: `N8N_WEBHOOK_AUTH_MODE` matches what the receiving workflow validates.
- [ ] The receiver returns 2xx only after persisting the event idempotently
      (using `X-Site-Event-Id` to deduplicate).
- [ ] Failed delivery does not propagate to the user-facing form.
- [ ] Dead-letter records do not persist full webhook payloads.
- [ ] Receiver credentials are stored in the receiver's credential store, not this repo.
- [ ] The n8n editor UI is not exposed to the public internet (basic auth or VPN).
