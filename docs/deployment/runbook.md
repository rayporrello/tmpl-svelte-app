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

`web-data-platform` `launch:site` installs `deploy/quadlets/web.container` as
the per-client Quadlet symlink. It must include:

```ini
Network=web-platform.network
PublishPort=127.0.0.1:<loopbackPort>:3000
EnvironmentFile=%h/secrets/<slug>.prod.env
```

Then:

```bash
systemctl --user daemon-reload
```

## Deploy New Image

```bash
bun run launch:deploy -- --client=<slug> --image=ghcr.io/<owner>/<repo>:<sha> --sha=<sha> --safety=rollback-safe
```

`launch:deploy` checks the platform launch checklist, then delegates to
`deploy:apply`. `deploy:apply` pulls the image, updates `Image=`, restarts the
configured `<slug>-web.service`, polls `/readyz`, runs smoke, and records
release evidence.

## Migration Gate

Migrations are applied by the web-data-platform repo:

```bash
bun run --cwd ../web-data-platform web:fleet-migration-status -- --client=<slug> --repo=<website-root>
```

The website deploy CLI hard-fails when the platform CLI is missing, invalid, or
reports migration drift/failure. `--skip-migration-gate` exists only for an
approved manual migration exception.

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
