# deploy:apply

`deploy:apply` performs a web image swap with a migration gate.

## Steps

1. run `deploy:preflight`
2. resolve client slug from `CLIENT_SLUG` or `site.project.json`
3. ask `platform-infrastructure` whether Drizzle migrations are current
4. pull the new web image with Podman
5. update `Image=` in `deploy/quadlets/web.container`
6. run `systemctl --user daemon-reload`
7. restart `web.service`
8. poll `/readyz`
9. run `deploy:smoke`
10. record release evidence in the local ops ledger

## Phase 1 Soft Gate

Until the platform CLI exists, a missing `PLATFORM_REPO_PATH` soft-skips the
migration gate and emits:

```text
[deploy:apply] platform-infrastructure CLI not found at PLATFORM_REPO_PATH — migration gate skipped. Confirm migrations applied manually before deploy.
```

This is temporary. The platform migration gate becomes hard once the platform
repo implements `platform:fleet-migration-status`.

## What It Does Not Do

- run migrations directly
- manage Postgres
- restart a worker
- run backups or restore drills
- edit Caddy site blocks

## Failure Recovery

For web image failures, use `bun run rollback --to previous`. For database
recovery, use the platform restore workflow.
