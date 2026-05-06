# Deployment

Documentation for deploying sites built from this template. The deployment model uses **rootless Podman + host-installed Caddy**: the app publishes a loopback-only port, Caddy is the public reverse proxy, and each site runs its own dedicated Postgres container.

---

## What is documented here

| File                                                         | Status   | Purpose                                                                                  |
| ------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------- |
| [secrets.md](secrets.md)                                     | Complete | SOPS + age secrets workflow — encrypting, committing, and rendering secrets              |
| [runbook.md](runbook.md)                                     | Complete | Step-by-step deploy guide: bootstrap, rolling deploy, rollback by SHA, post-deploy smoke |
| [../operations/backups.md](../operations/backups.md)         | Complete | Backup procedures for database and uploads; off-host storage options                     |
| [../operations/restore.md](../operations/restore.md)         | Complete | Restore guide: database, uploads, test restore, production safety                        |
| [../privacy/data-retention.md](../privacy/data-retention.md) | Complete | Runtime data retention policy and pruning workflow                                       |

---

## Deployment artifacts

| Artifact                              | Location           | Purpose                                                                                                  |
| ------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------- |
| `.dockerignore`                       | repo root          | Keeps secrets, git metadata, dev deps, and generated output out of image build contexts                  |
| `Containerfile`                       | repo root          | Multi-stage Bun runtime image (builder + production-only runtime deps)                                   |
| `Containerfile.node.example`          | repo root          | Reference-only recipe for adapter-node swap (not maintained, not CI-tested)                              |
| `serve.js`                            | repo root          | SIGTERM-aware entrypoint that wraps `build/index.js` for graceful Quadlet restarts                       |
| `deploy/env.example`                  | `deploy/`          | Runtime env var reference for container / Quadlet                                                        |
| `deploy/quadlets/web.container`       | `deploy/quadlets/` | Systemd user unit via Podman Quadlet                                                                     |
| `deploy/quadlets/web.network`         | `deploy/quadlets/` | Project-local Podman network                                                                             |
| `deploy/Containerfile.postgres`       | repo root          | Custom Postgres 18 + WAL-G image for the bundled PITR backup path; built and pushed by CI alongside web  |
| `deploy/quadlets/postgres.container`  | `deploy/quadlets/` | Bundled Postgres+WAL-G container wired to the project network with archive_command + loopback host tools |
| `deploy/quadlets/postgres.volume`     | `deploy/quadlets/` | Persistent Postgres data volume                                                                          |
| `deploy/quadlets/worker.container`    | `deploy/quadlets/` | Long-lived per-site automation outbox worker (`automation:worker:daemon`); replaces the systemd timer    |
| `deploy/quadlets/n8n.container`       | `deploy/quadlets/` | Optional per-client n8n editor + webhook (activate with `bun run n8n:enable`)                            |
| `deploy/quadlets/n8n.volume`          | `deploy/quadlets/` | Persistent n8n state volume (most state lives in the per-client Postgres)                                |
| `deploy/systemd/backup-base.service`  | `deploy/systemd/`  | One-shot WAL-G base backup; pushes to R2                                                                 |
| `deploy/systemd/backup-base.timer`    | `deploy/systemd/`  | Daily 03:15 UTC base backup timer (with random jitter)                                                   |
| `deploy/systemd/backup-check.service` | `deploy/systemd/`  | Verifies the latest base backup + WAL chain are fresh                                                    |
| `deploy/systemd/backup-check.timer`   | `deploy/systemd/`  | 6-hour PITR freshness check (loud failure if PITR is at risk)                                            |
| `deploy/systemd/backup.service`       | `deploy/systemd/`  | Legacy nightly pg_dump unit — runs `privacy:prune` then `backup:all` (convenience export, optional)      |
| `deploy/systemd/backup.timer`         | `deploy/systemd/`  | Legacy daily 03:00 timer (with jitter) that fires `backup.service`                                       |
| `deploy/Caddyfile.example`            | `deploy/`          | Caddy reverse proxy with TLS, HSTS, compression, optional rate-limit and immutable-asset header snippets |
| `scripts/deploy-preflight.ts`         | `scripts/`         | Local structural deploy readiness: env, Caddy, Quadlet, Postgres, worker, launch blockers                |
| `scripts/deploy-smoke.ts`             | `scripts/`         | URL-driven post-deploy smoke: health, readiness, discovery files, contact GET, security headers          |

---

## Quick start

```bash
# 1. Build the image locally
podman build --format docker -f Containerfile -t my-site .

# 2. Test it
podman run --rm -p 127.0.0.1:3000:3000 \
  -e ORIGIN=http://127.0.0.1:3000 \
  -e PUBLIC_SITE_URL=http://127.0.0.1:3000 \
  -e DATABASE_URL=postgres://project_app_user:yourpassword@host.containers.internal:5432/project_app \
  my-site

# 3. Verify liveness
curl -fsS http://127.0.0.1:3000/healthz
```

For production bootstrap, rolling deploys, rollback by SHA, and post-deploy smoke testing — see [runbook.md](runbook.md).

Before copying units to a host, run:

```bash
bun run deploy:preflight
```

After the site is live, run:

```bash
bun run deploy:smoke -- --url https://your-domain.example
```

---

## Lead-gen production contract

ADR-024 defines the default production profile as a reliable lead-gen website
appliance. A normal production launch includes the SvelteKit web container, the
dedicated Postgres container, the long-lived outbox worker, PITR backup config,
privacy retention, and Postmark lead notification.

Postmark is required for production launch: set `POSTMARK_SERVER_TOKEN`,
`CONTACT_TO_EMAIL`, and `CONTACT_FROM_EMAIL` in the rendered production env.
The console email provider is allowed for local/dev and test, but it is not a
launch-ready production notification path unless `LAUNCH_ALLOW_CONSOLE_EMAIL=1`
is set as an explicit waiver.

n8n is optional per client. `AUTOMATION_PROVIDER` unset or `noop` is a valid
production configuration; the worker still runs and performs durable outbox
processing without external delivery. When `AUTOMATION_PROVIDER=n8n`, set
`N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET`. When
`AUTOMATION_PROVIDER=webhook`, set `AUTOMATION_WEBHOOK_URL` and
`AUTOMATION_WEBHOOK_SECRET`.

---

## Secrets workflow

The SOPS + age secrets workflow is fully documented and implemented. See [secrets.md](secrets.md) for:

- How secrets are encrypted, committed, and rendered to `.env`
- The `bun run secrets:render` and `bun run secrets:check` commands
- How to add new secrets
- How to rotate or revoke keys

Decision: [ADR-013](../planning/adrs/ADR-013-sops-age-secrets-management.md)

---

## Infrastructure model

Sites built from this template are self-hosted on a Linux server:

- **App container**: Podman running the SvelteKit + Bun image
- **Reverse proxy**: host-installed Caddy (handles TLS, HSTS, compression, access logging) proxying to `127.0.0.1:<app_port>`
- **Automation layer**: the required per-site outbox worker container; optional per-client n8n container when this client needs n8n
- **Database**: required bundled `<project>-postgres` container/cluster with app and optional n8n databases isolated by role
- **Process management**: systemd user units via Podman Quadlet

The default reachability model is deliberate: `deploy/quadlets/web.container`
publishes `127.0.0.1:3000:3000`, and `deploy/Caddyfile.example` proxies to
`127.0.0.1:3000`. If several sites share one host, pick a different loopback
port per site and change both files together.

This is not a Vercel/Netlify/cloud-platform deployment. The template is designed for solo/founder-led projects on a VPS or dedicated server.

---

## Related

- [ADR-007](../planning/adrs/ADR-007-podman-caddy-infrastructure.md) — Podman + Caddy decision
- [ADR-013](../planning/adrs/ADR-013-sops-age-secrets-management.md) — secrets management decision
- [ADR-018](../planning/adrs/ADR-018-production-runtime-and-deployment-contract.md) — production runtime contract
- [docs/operations/backups.md](../operations/backups.md) — backup procedures
- [docs/operations/restore.md](../operations/restore.md) — restore guide
- [docs/privacy/data-retention.md](../privacy/data-retention.md) — runtime data retention and pruning
