# Deployment Runbook

This website repo deploys the web container only. Shared Postgres, fleet worker,
production secrets, backups, and restore live in `web-data-platform`.

## Inputs

- client slug in `site.project.json`
- reserved `deployment.loopbackPort`
- platform-rendered env file: `~/secrets/<slug>.prod.env`
- GHCR web image ref
- host Caddy site block generated or installed by the platform workflow

## Install Web Quadlet

Copy or render `deploy/quadlets/web.container` for the client. It must include:

```ini
Network=web-platform.network
PublishPort=127.0.0.1:<loopbackPort>:3000
EnvironmentFile=%h/secrets/<slug>.prod.env
```

Then:

```bash
systemctl --user daemon-reload
systemctl --user enable --now <slug>-web.service
```

## Deploy New Image

```bash
bun run deploy:preflight
bun run deploy:apply -- --image=ghcr.io/<owner>/<repo>:<sha> --sha=<sha>
bun run deploy:smoke -- --url https://example.com
```

`deploy:apply` pulls the image, updates `Image=`, restarts `web.service`, polls
`/readyz`, runs smoke, and records release evidence.

## Migration Gate

Migrations are applied by the web-data-platform repo:

```bash
bun run --cwd ../web-data-platform web:run-fleet-migrations -- --client=<slug>
```

During Phase 1 only, the website deploy CLI warns and proceeds if the platform
CLI is not present. After the web-data-platform migration CLI lands, deployments must
hard-fail when migrations are pending.

## Rollback

Use image rollback for web-only failures:

```bash
bun run rollback --status
bun run rollback --to previous
systemctl --user daemon-reload
systemctl --user restart <slug>-web.service
```

If database state must move backward, use the web-data-platform restore runbook. This
repo does not own cluster restore.
