# deploy:apply

`deploy:apply` performs a web image swap with a migration gate.

## Steps

1. run `deploy:preflight`
2. resolve client slug from `CLIENT_SLUG` or `site.project.json`
3. ask `web-data-platform` whether Drizzle migrations are current
4. pull the new web image with Podman
5. update `Image=` in `deploy/quadlets/web.container`
6. run `systemctl --user daemon-reload`
7. restart the `deployment.unitName` service from `site.project.json`
8. poll `/readyz`
9. run `deploy:smoke`
10. record release evidence in the local ops ledger

## Migration Gate Policy

`deploy:apply` requires a valid `web-data-platform` checkout. If
`WEB_DATA_PLATFORM_PATH` is unset, the default is the sibling path
`../web-data-platform`. The path must contain a `package.json` with
`scripts["web:fleet-migration-status"]`.

The gate is fail-closed. If the platform repo is missing or invalid, fix the
path before deploying:

```bash
export WEB_DATA_PLATFORM_PATH="$HOME/web-data-platform"
```

For rare approved manual exceptions, `--skip-migration-gate` bypasses the gate
with a warning. Before using it, confirm migrations and app/fleet-worker grants
were applied manually.

## What It Does Not Do

- run migrations directly
- manage Postgres
- restart a worker
- run backups or restore drills
- edit Caddy site blocks

## Failure Recovery

For web image failures, use `bun run rollback --to previous`. For database
recovery, use the web-data-platform restore workflow.
