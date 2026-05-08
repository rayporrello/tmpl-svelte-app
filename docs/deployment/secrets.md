# Secrets Management

This template still uses SOPS + age, but production secret ownership changed.

## Source Of Truth

| Scope               | File                                   | Purpose                                                              |
| ------------------- | -------------------------------------- | -------------------------------------------------------------------- |
| Platform production | `platform-infrastructure/secrets.yaml` | Source of truth for shared cluster and all client production secrets |
| Website development | `secrets.yaml` in this repo, optional  | Dev-only convenience if a clone needs encrypted local values         |
| Runtime render      | `~/secrets/<slug>.prod.env`            | Plaintext per-client env rendered by platform scripts                |

Production website clones no longer carry production secrets.

## Website Runtime Env

The platform-rendered website env contains values such as:

- `ORIGIN`
- `PUBLIC_SITE_URL`
- `CLIENT_SLUG`
- `DATABASE_URL`
- `DATABASE_POOL_MAX`
- `DATABASE_STATEMENT_TIMEOUT_MS`
- `SESSION_SECRET`
- `POSTMARK_SERVER_TOKEN`
- `CONTACT_FROM_EMAIL`
- `CONTACT_TO_EMAIL`
- `SMOKE_TEST_SECRET`
- `HEALTH_ADMIN_PASSWORD_HASH`

Automation provider secrets are not rendered for the web container. They are
read by the platform fleet worker.

## Dev-Only Automation Env

These optional values may appear in local `.env` for `bun run automation:worker`:

- `AUTOMATION_PROVIDER`
- `N8N_WEBHOOK_*`
- `AUTOMATION_WEBHOOK_*`

They are not production deploy/preflight requirements in this repo.

## Rules

- Never commit plaintext `.env` files.
- Commit `secrets.yaml` only if it is encrypted.
- Do not add OpenBao, Doppler, Infisical, or another secret manager to this
  template without an explicit project request.
- Add new website runtime env vars to `src/lib/server/env.ts`,
  `.env.example`, and `deploy/env.example`.
- Add production secret categories to the platform repo docs and examples.

See [ADR-013](../planning/adrs/ADR-013-sops-age-secrets-management.md) and
[ADR-031](../planning/adrs/ADR-031-shared-infrastructure-cell.md).
