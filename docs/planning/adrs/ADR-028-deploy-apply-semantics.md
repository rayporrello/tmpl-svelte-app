# ADR-028 — deploy:apply Semantics

Status: Accepted, updated by ADR-031 and the fail-closed gate hardening
Date: 2026-05-08

## Decision

`deploy:apply` is a migration-gated web image swap.

Behavior:

1. run website deploy preflight
2. resolve the client slug from env or `site.project.json`
3. ask the web-data-platform CLI whether Drizzle migrations are current
4. pull the new web image
5. update `Image=` in `deploy/quadlets/web.container`
6. reload user systemd and restart `web.service`
7. poll `/readyz`
8. run `deploy:smoke`
9. record release evidence locally

## Migration Gate Availability

The web-data-platform migration CLI now exists. `deploy:apply` therefore
hard-fails when `WEB_DATA_PLATFORM_PATH` is missing, invalid, or does not expose
`scripts["web:fleet-migration-status"]`.

The only bypass is explicit:

```bash
bun run deploy:apply -- --image=<image> --sha=<sha> --safety=rollback-safe --skip-migration-gate
```

That flag is for an approved manual migration exception and emits a warning.

## Non-Goals

`deploy:apply` does not run migrations itself, manage Postgres, restart a worker,
or make backup/restore decisions.
