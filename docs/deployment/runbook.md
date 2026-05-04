# Deployment Runbook

Step-by-step guide for first-time setup, rolling deploys, rollbacks, and post-deploy smoke testing. Covers the Podman + Caddy self-hosted model (ADR-007).

---

## Prerequisites

| Requirement             | Notes                                                           |
| ----------------------- | --------------------------------------------------------------- |
| Linux host with systemd | Tested on Fedora / RHEL 9+; works on any modern systemd distro  |
| Podman ≥ 4.4            | Rootless operation required (`loginctl enable-linger <user>`)   |
| Caddy ≥ 2.7             | Via package manager or direct binary                            |
| Postgres client tools   | `psql`, `pg_dump`, `pg_restore` for migrations/backups/restores |
| GHCR access             | `podman login ghcr.io -u <github-user> --password-stdin`        |
| SOPS + age key          | See [secrets.md](secrets.md)                                    |

---

## First-Time Host Bootstrap

### 1. Enable rootless Podman / user lingering

```bash
loginctl enable-linger $USER
systemctl --user enable --now podman.socket
```

### 2. Install Caddy

```bash
# Fedora / RHEL
sudo dnf install caddy

# Or via official Caddy repo — see https://caddyserver.com/docs/install
```

### 3. Render secrets to the host

```bash
# On the dev machine:
bun run secrets:render -- secrets.yaml ~/secrets/<project>.prod.env

# Verify the output file exists and has the right variables:
bun run secrets:check
```

Then SCP the rendered env file to the host:

```bash
scp ~/secrets/<project>.prod.env user@host:~/secrets/<project>.prod.env
chmod 600 ~/secrets/<project>.prod.env
```

### 4. Check out the project and install units

```bash
git clone git@github.com:<owner>/<name>.git ~/<project>
cd ~/<project>

mkdir -p ~/.config/containers/systemd
mkdir -p ~/.config/systemd/user

# Copy generated units after init:site has rendered project-specific values
cp deploy/quadlets/web.network ~/.config/containers/systemd/<project>.network
cp deploy/quadlets/web.container ~/.config/containers/systemd/<project>-web.container

# Optional bundled Postgres path. Skip these two files when using managed Postgres.
cp deploy/quadlets/postgres.volume ~/.config/containers/systemd/<project>-postgres-data.volume
cp deploy/quadlets/postgres.container ~/.config/containers/systemd/<project>-postgres.container

# Optional runtime automation outbox worker. It is safe to enable without n8n;
# with no provider URL configured the worker idles/skips delivery clearly.
cp deploy/systemd/automation-worker.service ~/.config/systemd/user/<project>-automation-worker.service
cp deploy/systemd/automation-worker.timer ~/.config/systemd/user/<project>-automation-worker.timer

# Edit Image=, EnvironmentFile=, Network=, HostName=, and any loopback ports if needed
$EDITOR ~/.config/containers/systemd/<project>-web.container
```

If using the bundled Postgres container, keep these env values aligned:

- `DATABASE_URL=postgres://...@<project>-postgres:5432/...` for web/worker containers
- `DATABASE_DIRECT_URL=postgres://...@127.0.0.1:5432/...` for host-side migrations, backups, and restores
- `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` for the Postgres container

Managed Postgres users should skip the Postgres Quadlet files and set
`DATABASE_URL` to the managed service URL. `DATABASE_DIRECT_URL` is only needed
when host-side tools need a different connection URL.

### 5. Pull the first image

```bash
podman login ghcr.io -u <github-user> --password-stdin <<< "$GHCR_PAT"
podman pull ghcr.io/<owner>/<name>:<sha>
```

### 6. Start Postgres and run migrations

If using bundled Postgres:

```bash
systemctl --user daemon-reload
systemctl --user enable --now <project>-postgres
systemctl --user status <project>-postgres
```

Run migrations explicitly before starting or restarting the web service:

```bash
cd ~/<project>
set -a
source ~/secrets/<project>.prod.env
set +a
bun run db:migrate
```

Do not hide destructive database changes inside service startup. Review
migration SQL before deploy when schema changes are non-trivial.

### 7. Start the web service and worker timer

```bash
systemctl --user daemon-reload
systemctl --user enable --now <project>-web
systemctl --user status <project>-web

# Optional but recommended when the runtime automation outbox is used
systemctl --user enable --now <project>-automation-worker.timer
systemctl --user list-timers | grep <project>-automation-worker
```

### 8. Configure and start Caddy

```bash
# Copy and fill the example Caddyfile. Host-installed Caddy proxies to the
# loopback PublishPort in deploy/quadlets/web.container.
cp deploy/Caddyfile.example /etc/caddy/Caddyfile
$EDITOR /etc/caddy/Caddyfile   # replace example.com with real domain

# Validate config
sudo caddy validate --config /etc/caddy/Caddyfile

# Reload Caddy
sudo systemctl reload caddy
```

---

## Rolling Deploy from CI

CI (`.github/workflows/ci.yml`) builds, scans, and pushes the image to GHCR on every push to `main`. The image is tagged with the full 40-character commit SHA.

On the host:

```bash
# 1. Find the SHA of the commit you want to deploy
SHA=$(git rev-parse <branch-or-tag>)

# 2. Pull the new image (CI already pushed it to GHCR)
podman pull ghcr.io/<owner>/<name>:$SHA

# 3. Update the Quadlet Image= line
sed -i "s|Image=ghcr.io/<owner>/<name>:.*|Image=ghcr.io/<owner>/<name>:$SHA|" \
  ~/.config/containers/systemd/<project>-web.container

# 4. Apply pending migrations explicitly before restarting web
cd ~/<project>
set -a
source ~/secrets/<project>.prod.env
set +a
bun run db:migrate

# 5. Reload and restart
systemctl --user daemon-reload
systemctl --user restart <project>-web

# 6. Verify the unit is healthy
systemctl --user status <project>-web
```

If `bun run db:migrate` fails, stop the deploy and keep the current web unit
running. The template does not run migrations automatically from container
startup because failed or destructive migrations should be operator-visible.

---

## Rollback by SHA

```bash
# 1. Choose the SHA to roll back to (from git log or GHCR tags)
PREV_SHA=<previous-full-sha>

# 2. The previous image should still be in the local store.
#    If it was pruned, pull it first:
# podman pull ghcr.io/<owner>/<name>:$PREV_SHA

# 3. Update the Quadlet
sed -i "s|Image=ghcr.io/<owner>/<name>:.*|Image=ghcr.io/<owner>/<name>:$PREV_SHA|" \
  ~/.config/containers/systemd/<project>-web.container

# 4. Reload and restart
systemctl --user daemon-reload
systemctl --user restart <project>-web
```

Total downtime: typically <5 seconds (restart without pull).

---

## Viewing Logs

```bash
# Follow live logs from the app
journalctl --user -u <project>-web -f

# Last 200 lines
journalctl --user -u <project>-web -n 200

# Caddy access logs
sudo journalctl -u caddy -f

# Bundled Postgres and automation worker
journalctl --user -u <project>-postgres -f
journalctl --user -u <project>-automation-worker.service -f
```

---

## Caddyfile Updates

```bash
# Validate before applying
sudo caddy validate --config /etc/caddy/Caddyfile

# Reload (zero-downtime)
sudo systemctl reload caddy
```

---

## Post-Deploy Smoke

Run these after every deploy to verify the site is up and healthy. This is where reachability is tested — `check:launch` is structural-only and does not make network requests.

```bash
# 1. Health endpoint (process liveness)
curl -fsS https://<domain>/healthz
# Expected: {"ok":true,...}

# 2. Readiness endpoint (Postgres connectivity)
curl -fsS https://<domain>/readyz
# Expected: {"ok":true,...}

# 3. Sitemap (valid XML)
curl -fsS https://<domain>/sitemap.xml | head -5
# Expected: <?xml version="1.0"...

# 4. Robots.txt
curl -fsS https://<domain>/robots.txt
# Expected: User-agent: *

# 5. Security headers (spot check)
curl -sI https://<domain>/ | grep -Ei "x-frame-options|x-content-type-options|referrer-policy|permissions-policy|content-security-policy"
# Expected: security headers and CSP are present
```

If any check fails:

1. `journalctl --user -u <project>-web -n 50` — look for startup errors
2. `systemctl --user status <project>-web` — check health state
3. `podman logs <container-id>` — container stdout/stderr

---

## Common Operations

| Task               | Command                                                      |
| ------------------ | ------------------------------------------------------------ | --------------------------------- |
| Restart app        | `systemctl --user restart <project>-web`                     |
| Stop app           | `systemctl --user stop <project>-web`                        |
| Check app health   | `systemctl --user status <project>-web`                      |
| Check Postgres     | `systemctl --user status <project>-postgres`                 |
| Run worker once    | `systemctl --user start <project>-automation-worker.service` |
| Check worker timer | `systemctl --user list-timers                                | grep <project>-automation-worker` |
| View containers    | `podman ps`                                                  |
| Prune old images   | `podman image prune --filter "dangling=true"`                |
| Force-remove image | `podman rmi ghcr.io/<owner>/<name>:<sha>`                    |

---

## Backup and Restore

### Manual / pre-destructive snapshot

Take a backup before any destructive operation (database migration, configuration change, restore from older backup).

```bash
# Prune expired runtime records first in scheduled production maintenance
bun run privacy:prune -- --apply

# Back up database and uploads (auto-pushes off-host when BACKUP_REMOTE is set)
bun run backup:all

# Verify most recent backup
bun run backup:verify

# Restore database (requires --confirm; see restore guide first)
bash scripts/restore-db.sh backups/db/db-<timestamp>.pgdump --confirm
```

Backups are stored in `backups/` (gitignored). Without an off-host destination they're co-located with the app — see below.

### Scheduled off-host backups (turnkey path)

The template ships a turnkey rclone + systemd timer + Healthchecks.io path. After deploy, set up once per host:

```bash
# 1. Install rclone and configure a remote
curl https://rclone.org/install.sh | sudo bash
rclone config   # for Cloudflare R2: choose Amazon S3 → Cloudflare R2

# 2. Install postgres client (for pg_dump)
sudo dnf install postgresql

# 3. Add backup secrets to secrets.yaml, render
sops secrets.yaml   # add BACKUP_REMOTE and BACKUP_HEALTHCHECK_URL
bun run secrets:render -- secrets.yaml ~/secrets/<project>.prod.env

# 4. Install the systemd units (init:site already replaced <project> placeholders)
cp deploy/systemd/backup.service ~/.config/systemd/user/<project>-backup.service
cp deploy/systemd/backup.timer   ~/.config/systemd/user/<project>-backup.timer
systemctl --user daemon-reload
systemctl --user enable --now <project>-backup.timer

# 5. Verify
systemctl --user list-timers | grep <project>-backup
systemctl --user start <project>-backup.service     # manual fire to test rclone + Healthchecks
journalctl --user -u <project>-backup.service -f
```

The unit fires daily at 03:00 (with 0–5 min jitter), runs `privacy:prune --apply`, then `backup:all`, which auto-pushes to `BACKUP_REMOTE`. Healthchecks pings `<url>/start`, `<url>` on success, `<url>/fail` on error.

Do not auto-prune inside backup scripts. Retention windows belong to the project, so scheduled jobs should call `privacy:prune` explicitly before backup — the shipped systemd service does this in the right order.

Full procedures: [docs/operations/backups.md](../operations/backups.md) · [docs/operations/restore.md](../operations/restore.md) · [docs/privacy/data-retention.md](../privacy/data-retention.md)

---

## Graceful shutdown

The container's entrypoint is `bun serve.js`, not `bun build/index.js` directly. `serve.js` (at the repo root) registers `SIGTERM` and `SIGINT` handlers that delay `process.exit(0)` by `SHUTDOWN_TIMEOUT_MS` (default 8000ms) so in-flight HTTP responses can finish before the process exits.

This matters during rolling restarts: `systemctl --user restart <project>-web` sends SIGTERM. Without the wrapper, `svelte-adapter-bun`'s `Bun.serve()` exits immediately and truncates active responses — including Postgres queries that were mid-flight, which can leak connections from the postgres-js pool until the next idle reaping.

Tuning `SHUTDOWN_TIMEOUT_MS`:

- Short-running marketing pages: keep at 8000ms (default).
- Long-polling endpoints or slow upstream calls: raise to match your worst-case request latency, and keep the web Quadlet `StopTimeout` higher than `SHUTDOWN_TIMEOUT_MS` so Podman does not escalate to SIGKILL during normal restarts. The Quadlet's `Restart=on-failure` plus Caddy's `health_uri /healthz` (default `health_interval 10s`) routes traffic away within the same window.
- Local development: `bun run dev` does not use this wrapper — the Vite dev server has its own HMR shutdown.

If you ever need to bypass the wrapper for debugging, run `bun build/index.js` directly inside the container (`podman exec -it <container> bun build/index.js`). Do not change the `Containerfile` `CMD` — see ADR-018.

---

## Related

- [Containerfile](../../Containerfile) — multi-stage Bun runtime image
- [deploy/env.example](../env.example) — runtime env var reference
- [deploy/quadlets/web.container](../quadlets/web.container) — Quadlet unit template
- [deploy/Caddyfile.example](../Caddyfile.example) — Caddy config reference
- [secrets.md](secrets.md) — SOPS + age secrets workflow
- [docs/operations/backups.md](../operations/backups.md) — backup procedures
- [docs/operations/restore.md](../operations/restore.md) — restore guide
- [ADR-007](../planning/adrs/ADR-007-podman-caddy-infrastructure.md) — Podman + Caddy decision
- [ADR-018](../planning/adrs/ADR-018-production-runtime-and-deployment-contract.md) — runtime contract
