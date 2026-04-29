# Deployment Runbook

Step-by-step guide for first-time setup, rolling deploys, rollbacks, and post-deploy smoke testing. Covers the Podman + Caddy self-hosted model (ADR-007).

---

## Prerequisites

| Requirement             | Notes                                                          |
| ----------------------- | -------------------------------------------------------------- |
| Linux host with systemd | Tested on Fedora / RHEL 9+; works on any modern systemd distro |
| Podman ≥ 4.4            | Rootless operation required (`loginctl enable-linger <user>`)  |
| Caddy ≥ 2.7             | Via package manager or direct binary                           |
| GHCR access             | `podman login ghcr.io -u <github-user> --password-stdin`       |
| SOPS + age key          | See [secrets.md](secrets.md)                                   |

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
bun run secrets:render production

# Verify the output file exists and has the right variables:
bun run secrets:check
```

Then SCP the rendered env file to the host:

```bash
scp ~/secrets/<project>.prod.env user@host:~/secrets/<project>.prod.env
chmod 600 ~/secrets/<project>.prod.env
```

### 4. Install Quadlet units

```bash
mkdir -p ~/.config/containers/systemd

# Copy and fill in placeholders (init:site does this automatically in Batch B)
cp deploy/quadlets/web.container ~/.config/containers/systemd/<project>-web.container
cp deploy/quadlets/web.network   ~/.config/containers/systemd/<project>.network

# Edit Image=, EnvironmentFile=, Network=, HostName= to match your project
$EDITOR ~/.config/containers/systemd/<project>-web.container
```

### 5. Pull the first image

```bash
podman login ghcr.io -u <github-user> --password-stdin <<< "$GHCR_PAT"
podman pull ghcr.io/<owner>/<name>:<sha>
```

### 6. Start the service

```bash
systemctl --user daemon-reload
systemctl --user enable --now <project>-web
systemctl --user status <project>-web
```

### 7. Configure and start Caddy

```bash
# Copy and fill the example Caddyfile
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

# 4. Reload and restart
systemctl --user daemon-reload
systemctl --user restart <project>-web

# 5. Verify the unit is healthy
systemctl --user status <project>-web
```

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

# 2. Sitemap (valid XML)
curl -fsS https://<domain>/sitemap.xml | head -5
# Expected: <?xml version="1.0"...

# 3. Robots.txt
curl -fsS https://<domain>/robots.txt
# Expected: User-agent: *

# 4. Security headers (spot check)
curl -sI https://<domain>/ | grep -E "x-frame-options|x-content-type-options|referrer-policy"
# Expected: all four headers present; CSP present if Batch B is deployed
```

If any check fails:

1. `journalctl --user -u <project>-web -n 50` — look for startup errors
2. `systemctl --user status <project>-web` — check health state
3. `podman logs <container-id>` — container stdout/stderr

---

## Common Operations

| Task               | Command                                       |
| ------------------ | --------------------------------------------- |
| Restart app        | `systemctl --user restart <project>-web`      |
| Stop app           | `systemctl --user stop <project>-web`         |
| Check health       | `systemctl --user status <project>-web`       |
| View containers    | `podman ps`                                   |
| Prune old images   | `podman image prune --filter "dangling=true"` |
| Force-remove image | `podman rmi ghcr.io/<owner>/<name>:<sha>`     |

---

## Backup and Restore

Take a backup before any destructive operation (database migration, configuration change, restore from older backup).

```bash
# Prune expired runtime records first in scheduled production maintenance
bun run privacy:prune -- --apply

# Back up database and uploads
bun run backup:all

# Verify most recent backup
bun run backup:verify

# Restore database (requires --confirm; see restore guide first)
bash scripts/restore-db.sh backups/db/db-<timestamp>.pgdump --confirm
```

Backups are stored in `backups/` (gitignored). Copy them off-host — a backup on the same server as the app is not a real backup.

Do not auto-prune inside backup scripts. Retention windows belong to the project, so scheduled jobs should call `privacy:prune` explicitly before backup after the operator has reviewed a dry-run.

Full procedures: [docs/operations/backups.md](../operations/backups.md) · [docs/operations/restore.md](../operations/restore.md) · [docs/privacy/data-retention.md](../privacy/data-retention.md)

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
