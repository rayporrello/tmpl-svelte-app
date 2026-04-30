# Backups

Backup procedures for Postgres databases and file uploads. Sites built from this template use `pg_dump` (custom format) for databases and `tar -czf` for uploads.

---

## What needs backing up

| Asset                      | Method                  | Notes                                                  |
| -------------------------- | ----------------------- | ------------------------------------------------------ |
| Postgres database          | `pg_dump` custom format | Contact submissions, automation events, dead letters   |
| `static/uploads/`          | `tar -czf` with SHA256  | User-uploaded images and any CMS-managed files         |
| `content/` (Markdown/YAML) | Git                     | Already versioned — no separate backup needed          |
| `secrets.yaml`             | Git                     | Safe to commit when encrypted with SOPS + age          |
| App code                   | Git + GHCR              | Every push tags an image by SHA — inherently versioned |

---

## Quick start

```bash
# Optional but recommended before scheduled production backups:
bun run privacy:prune -- --apply

# Back up everything
bun run backup:all

# Back up database only
bun run backup:db

# Back up uploads only
bun run backup:uploads

# Verify the most recent backup
bun run backup:verify

# Verify a specific file
bun run backup:verify -- backups/db/db-20250428T120000Z.pgdump
```

`DATABASE_URL` must be set before running database backups. Either export it or source your rendered `.env`:

```bash
# Option A: export directly
export DATABASE_URL=postgres://user:password@host:5432/dbname
bun run backup:db

# Option B: source .env (only for local dev — do not script this in production)
set -a && source .env && set +a
bun run backup:db
```

For scheduled production jobs, run `bun run privacy:prune -- --apply` before `bun run backup:db` or `bun run backup:all`. The backup scripts do not prune automatically because retention windows are a project decision, but pruning first prevents expired PII from being copied into fresh backups.

---

## Backup output

All backups land in `backups/` — gitignored, never committed.

```
backups/
  db/
    db-20250428T120000Z.pgdump        # pg_dump custom format (compressed)
  uploads/
    uploads-20250428T120000Z.tar.gz   # uploads archive
    uploads-20250428T120000Z.tar.gz.sha256  # SHA256 checksum sidecar
```

Timestamps are UTC (`YYYYMMDDTHHMMSSz`). Each run creates a new file — old files are not overwritten or rotated automatically.

### Pruning old backups

There is no automatic backup retention policy. Prune manually or via your scheduler:

```bash
# Remove database backups older than 30 days
find backups/db/ -name '*.pgdump' -mtime +30 -delete

# Remove upload backups older than 30 days
find backups/uploads/ -name '*.tar.gz' -mtime +30 -delete
find backups/uploads/ -name '*.sha256' -mtime +30 -delete
```

Choose backup retention alongside the live data retention policy in [docs/privacy/data-retention.md](../privacy/data-retention.md). Backups can contain deleted contact submissions until they age out, so keep backup windows no longer than your recovery needs justify.

---

## Database backup

`backup-db.sh` uses `pg_dump --format=custom`. Custom format:

- Is compressed (no separate gzip step needed)
- Supports selective object restore with `pg_restore`
- Is the most flexible format for disaster recovery

The backup file contains a complete snapshot of all tables, sequences, constraints, and indexes. It does **not** include the `CREATE DATABASE` statement — you restore into an existing (empty) database.

Database backups may contain personal data from `contact_submissions` and historical automation records. Store them with the same care as production data and restrict access to operators who need restore access.

### Verifying a database backup

```bash
# Quick integrity check (no database required)
bun run backup:verify -- backups/db/db-20250428T120000Z.pgdump

# Inspect what's inside
pg_restore --list backups/db/db-20250428T120000Z.pgdump | head -30

# Stronger verification: restore to a temporary database
createdb site_restore_test
pg_restore \
  --dbname="postgres://user:password@127.0.0.1:5432/site_restore_test" \
  --no-owner --no-acl \
  backups/db/db-20250428T120000Z.pgdump
# spot-check some data...
dropdb site_restore_test
```

Strong verification (restore to temp DB) is the only way to confirm a backup is truly usable. Do this at least once per project before going live.

---

## Uploads backup

`backup-uploads.sh` archives `static/uploads/` preserving the directory structure. A SHA256 checksum sidecar (`.sha256`) is generated alongside each archive.

To inspect archive contents without extracting:

```bash
tar -tzf backups/uploads/uploads-20250428T120000Z.tar.gz
```

To extract to a temporary location:

```bash
mkdir /tmp/uploads-restore-test
tar -xzf backups/uploads/uploads-20250428T120000Z.tar.gz -C /tmp/uploads-restore-test
ls /tmp/uploads-restore-test/uploads/
```

---

## Off-host storage — required for production

**A backup stored only on the same server as the application is not a real backup.** If the server fails, both the application data and the backup are lost simultaneously.

### Turnkey path (recommended)

The template ships an opinionated default: rclone + a systemd timer + Healthchecks.io pings. Set two env vars and enable a timer; nightly off-host sync runs from there.

**One-time host setup:**

```bash
# 1. Install rclone (any S3-compatible: Cloudflare R2, Backblaze B2, AWS S3, etc.)
curl https://rclone.org/install.sh | sudo bash

# 2. Configure the remote interactively. For Cloudflare R2, choose
#    "Amazon S3 Compliant Storage Providers" → "Cloudflare R2".
rclone config

# 3. Install the postgres client (for pg_dump):
sudo dnf install postgresql   # Fedora/RHEL
# sudo apt install postgresql-client   # Debian/Ubuntu
```

**Per-project setup:**

1. Set both env vars in your rendered `~/secrets/<project>.prod.env` (via SOPS in `secrets.yaml`):

   ```yaml
   BACKUP_REMOTE: 'r2:my-bucket/my-site-backups'
   BACKUP_HEALTHCHECK_URL: 'https://hc-ping.com/<uuid>'
   ```

2. Copy the systemd units (after `bun run init:site` replaces `<project>` placeholders):

   ```bash
   cp deploy/systemd/backup.service ~/.config/systemd/user/<project>-backup.service
   cp deploy/systemd/backup.timer ~/.config/systemd/user/<project>-backup.timer
   systemctl --user daemon-reload
   systemctl --user enable --now <project>-backup.timer
   ```

3. Verify:

   ```bash
   # Confirm the timer is scheduled
   systemctl --user list-timers | grep <project>-backup

   # Manual run (also tests the rclone config + Healthchecks ping)
   systemctl --user start <project>-backup.service
   journalctl --user -u <project>-backup.service -f
   ```

When `BACKUP_REMOTE` is set, `bun run backup:all` automatically runs `backup:push` after the local backups complete. When `BACKUP_HEALTHCHECK_URL` is set, `backup:push` pings `<url>/start`, `<url>` on success, `<url>/fail` on error.

### Manual options (if you skip the turnkey path)

If you don't want rclone + systemd, copy backups elsewhere yourself:

```bash
# rsync to a second server
rsync -avz --progress backups/ backup-user@backup-host:/path/to/site-backups/

# Or AWS CLI to any S3-compatible target (R2, B2, S3)
aws s3 sync backups/ s3://bucket-name/site-backups/ \
  --endpoint-url https://your-account.r2.cloudflarestorage.com
```

Schedule via cron, a different timer, or your CI — it's outside the scripts. Without something scheduled, backups don't actually run on a clock.

---

## Production setup checklist

Before going live, confirm:

- [ ] `DATABASE_URL` is set in your production environment
- [ ] `pg_dump` / `pg_restore` are installed on the server (`sudo dnf install postgresql`)
- [ ] `bun run backup:db` runs successfully
- [ ] `bun run backup:verify` passes
- [ ] A restore to a temporary database has been tested (see above)
- [ ] Off-host backup destination is configured (recommended: `BACKUP_REMOTE` set + rclone configured) and a successful push has been observed
- [ ] A scheduled task runs backups automatically (recommended: `<project>-backup.timer` enabled; daily minimum)
- [ ] The scheduled job runs `bun run privacy:prune -- --apply` before creating fresh database backups (the shipped systemd service does this)
- [ ] `BACKUP_HEALTHCHECK_URL` (or equivalent monitor) is set so silent failures alert
- [ ] Backup retention has been chosen and documented for the project
- [ ] You have tested the full restore path at least once — see [restore.md](restore.md)

---

## Related

- [restore.md](restore.md) — restore procedures
- [docs/deployment/runbook.md](../deployment/runbook.md) — deployment and rollback
- [docs/deployment/secrets.md](../deployment/secrets.md) — SOPS secrets (encrypted secrets.yaml is safe to back up in Git)
