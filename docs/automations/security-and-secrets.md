# Automation Security And Secrets

Production automation provider secrets are owned by `web-data-platform`.
The website repo keeps only local-dev provider env support for one-shot worker
testing.

## Production

The platform registry/secrets define, per client:

- provider (`noop`, `n8n`, or `webhook`)
- webhook URL
- webhook secret
- auth mode/header

The fleet worker injects the correct provider config when it delivers each
client's outbox rows. The website web container does not receive these secrets.

## Local Development

For local one-shot worker tests, `.env` may include:

```env
AUTOMATION_PROVIDER=n8n
N8N_WEBHOOK_URL=https://your-tunnel.example/webhook/YOUR_ID
N8N_WEBHOOK_SECRET=a-long-random-string
N8N_WEBHOOK_AUTH_MODE=header
N8N_WEBHOOK_AUTH_HEADER=X-Site-Auth
```

or:

```env
AUTOMATION_PROVIDER=webhook
AUTOMATION_WEBHOOK_URL=https://hooks.example.com/receiver
AUTOMATION_WEBHOOK_SECRET=a-long-random-string
AUTOMATION_WEBHOOK_AUTH_MODE=header
AUTOMATION_WEBHOOK_AUTH_HEADER=X-Site-Auth
```

`AUTOMATION_PROVIDER=console` is local development only. `noop` completes rows
without outbound delivery.

## Rules

- Never log provider secrets.
- Never store raw provider payloads in `automation_dead_letters`.
- Never call providers from user-facing form actions.
- Production provider rotation happens in the web-data-platform repo, not here.
