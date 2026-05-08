# Deployment

Sites built from this template deploy as web-only SvelteKit containers on a
rootless Podman host with host-installed Caddy. Shared production infrastructure
is operated from `platform-infrastructure`.

## Artifacts In This Repo

| Artifact                        | Purpose                                      |
| ------------------------------- | -------------------------------------------- |
| `Containerfile`                 | Multi-stage Bun web image                    |
| `serve.js`                      | SIGTERM-aware runtime wrapper                |
| `deploy/env.example`            | Web runtime env reference                    |
| `deploy/quadlets/web.container` | Web Quadlet joined to `web-platform.network` |
| `deploy/Caddyfile.example`      | Per-site host Caddy snippet                  |
| `scripts/deploy-preflight.ts`   | Structural web deploy readiness checks       |
| `scripts/deploy-apply.ts`       | Migration-gated web image swap               |
| `scripts/deploy-smoke.ts`       | URL-driven post-deploy smoke                 |

Deleted by the shared-infra redirect: production Postgres Quadlets, worker
Quadlet, site-local network Quadlet, backup timers, restore timers, PITR scripts,
and the Postgres image recipe.

## Runtime Contract

The web container:

- joins `web-platform.network`
- reaches Postgres at `web-platform-postgres`
- publishes a unique loopback port for host Caddy
- reads env from `~/secrets/<slug>.prod.env`, rendered by the platform repo

The platform repo owns:

- `web-platform.network`
- shared Postgres and WAL/archive policy
- fleet worker
- production secrets rendering
- client provisioning and migrations
- cluster backups and restore drills

## Deploy Commands

```bash
bun run deploy:preflight
bun run deploy:apply -- --image=ghcr.io/<owner>/<repo>:<sha> --sha=<sha>
bun run deploy:smoke -- --url https://your-domain.example
```

`deploy:apply` asks the platform CLI whether Drizzle migrations are current
before swapping the image. During Phase 1 only, a missing platform repo produces
a warning and skips the migration gate so the website cleanup can land before
the platform CLI exists.

## Related

- [secrets.md](secrets.md)
- [runbook.md](runbook.md)
- [../operations/deploy-apply.md](../operations/deploy-apply.md)
- [../operations/rollback.md](../operations/rollback.md)
- [../operations/architecture.md](../operations/architecture.md)
- [ADR-031](../planning/adrs/ADR-031-shared-infrastructure-cell.md)
