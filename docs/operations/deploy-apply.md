# deploy:apply

`deploy:apply` performs a web image swap with a migration gate.

## Steps

1. run `deploy:preflight`
2. resolve client slug from `CLIENT_SLUG` or `site.project.json`
3. ask `web-data-platform` whether Drizzle migrations are current
4. pull the new web image with Podman
5. update `Image=` in `deploy/quadlets/web.container`
6. run `systemctl --user daemon-reload`
7. restart `web.service`
8. poll `/readyz`
9. run `deploy:smoke`
10. record release evidence in the local ops ledger

## Phase 1 Soft Gate

Until the web-data-platform CLI exists, a missing `WEB_DATA_PLATFORM_PATH` soft-skips the
migration gate and emits:

```text
[deploy:apply] web-data-platform CLI not found at WEB_DATA_PLATFORM_PATH — migration gate skipped. Confirm migrations applied manually before deploy.
```

This is temporary. The web-data-platform migration gate becomes hard once the
web-data-platform repo implements `web:fleet-migration-status`.

## What It Does Not Do

- run migrations directly
- manage Postgres
- restart a worker
- run backups or restore drills
- edit Caddy site blocks

## Failure Recovery

For web image failures, use `bun run rollback --to previous`. For database
recovery, use the web-data-platform restore workflow.
