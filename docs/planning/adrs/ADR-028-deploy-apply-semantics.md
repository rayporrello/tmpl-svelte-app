# ADR-028 — deploy:apply Semantics

Status: Accepted, updated by ADR-031  
Date: 2026-05-08

## Decision

`deploy:apply` is a migration-gated web image swap.

Behavior:

1. run website deploy preflight
2. resolve the client slug from env or `site.project.json`
3. ask the platform CLI whether Drizzle migrations are current
4. pull the new web image
5. update `Image=` in `deploy/quadlets/web.container`
6. reload user systemd and restart `web.service`
7. poll `/readyz`
8. run `deploy:smoke`
9. record release evidence locally

## Phase 1 Soft Gate

During the website cleanup phase, the platform CLI may not exist yet. In that
case `deploy:apply` warns and proceeds:

```text
[deploy:apply] platform-infrastructure CLI not found at PLATFORM_REPO_PATH — migration gate skipped. Confirm migrations applied manually before deploy.
```

After the platform migration CLI lands, this becomes a hard gate.

## Non-Goals

`deploy:apply` does not run migrations itself, manage Postgres, restart a worker,
or make backup/restore decisions.
