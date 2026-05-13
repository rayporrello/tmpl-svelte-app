# Deployment

Sites built from this template deploy as web-only SvelteKit containers on a
rootless Podman host with host-installed Caddy. Shared production infrastructure
is operated from `web-data-platform`.

## Artifacts In This Repo

| Artifact                        | Purpose                                      |
| ------------------------------- | -------------------------------------------- |
| `Containerfile`                 | Multi-stage Bun web image                    |
| `serve.js`                      | SIGTERM-aware runtime wrapper                |
| `deploy/env.example`            | Web runtime env reference                    |
| `deploy/quadlets/web.container` | Web Quadlet joined to `web-platform.network` |
| `deploy/Caddyfile.example`      | Per-site host Caddy snippet                  |
| `scripts/launch-deploy.ts`      | First-launch deploy wrapper                  |
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
- reads env from `~/secrets/<slug>.prod.env`, rendered by the web-data-platform repo

The web-data-platform repo owns:

- `web-platform.network`
- shared Postgres and WAL/archive policy
- fleet worker
- production secrets rendering
- client provisioning and migrations
- cluster backups and restore drills

## Deploy Commands

```bash
bun run deploy:preflight
bun run launch:deploy -- --client=<slug> --image=ghcr.io/<owner>/<repo>:<sha> --sha=<sha> --safety=rollback-safe
```

`launch:deploy` checks the `web-data-platform` launch checklist, delegates to
`deploy:apply`, then runs the platform `web:test-contact-delivery` end-to-end
smoke. On a green smoke, it marks the contact-delivery checklist item done.

`deploy:apply` asks the web-data-platform CLI whether Drizzle migrations are
current before swapping the image. The migration gate is fail-closed now that
`web:fleet-migration-status` is live. Use `--skip-migration-gate` only for an
approved manual migration exception. Use `deploy:apply` directly only for a
lower-level image swap where the launch checklist and contact-delivery wrapper
are intentionally out of scope.

To rerun the website smoke without a deploy:

```bash
bun run deploy:smoke -- --url https://your-domain.example
```

## Related

- [secrets.md](secrets.md)
- [runbook.md](runbook.md)
- [../operations/connect-to-platform.md](../operations/connect-to-platform.md)
- [../operations/deploy-apply.md](../operations/deploy-apply.md)
- [../operations/rollback.md](../operations/rollback.md)
- [../operations/architecture.md](../operations/architecture.md)
- [ADR-031](../planning/adrs/ADR-031-shared-infrastructure-cell.md)
