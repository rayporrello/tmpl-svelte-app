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

There is no automatic retention policy. Prune manually:

```bash
# Remove database backups older than 30 days
find backups/db/ -name '*.pgdump' -mtime +30 -delete

# Remove upload backups older than 30 days
find backups/uploads/ -name '*.tar.gz' -mtime +30 -delete
find backups/uploads/ -name '*.sha256' -mtime +30 -delete
```

---

## Database backup

`backup-db.sh` uses `pg_dump --format=custom`. Custom format:

- Is compressed (no separate gzip step needed)
- Supports selective object restore with `pg_restore`
- Is the most flexible format for disaster recovery

The backup file contains a complete snapshot of all tables, sequences, constraints, and indexes. It does **not** include the `CREATE DATABASE` statement — you restore into an existing (empty) database.

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

Production backups must be copied off-host. Options (choose one):

### rsync to a second server

```bash
# From the backup server or via cron on the app server:
rsync -avz --progress backups/ backup-user@backup-host:/path/to/site-backups/
```

### S3-compatible storage (Cloudflare R2, Backblaze B2, AWS S3)

```bash
# Using rclone (https://rclone.org) — supports all S3-compatible providers
rclone copy backups/ remote:bucket-name/site-backups/

# Or with the AWS CLI (compatible with R2 and B2):
aws s3 sync backups/ s3://bucket-name/site-backups/ \
  --endpoint-url https://your-account.r2.cloudflarestorage.com
```

### Automating off-host sync

Add off-host sync as a final step in a cron job or after `bun run backup:all`. Example cron (run daily at 3 AM):

```
0 3 * * * cd /path/to/site && \
  set -a && source .env && set +a && \
  bun run backup:all && \
  rclone copy backups/ remote:bucket/site-backups/
```

Off-host sync is **not** implemented in these scripts by default — it depends on your infrastructure provider and credentials. The scripts handle the local backup half; you own the transfer.

---

## Production setup checklist

Before going live, confirm:

- [ ] `DATABASE_URL` is set in your production environment
- [ ] `pg_dump` / `pg_restore` are installed on the server (`sudo dnf install postgresql`)
- [ ] `bun run backup:db` runs successfully
- [ ] `bun run backup:verify` passes
- [ ] A restore to a temporary database has been tested (see above)
- [ ] Off-host backup destination is configured and backups are being copied there
- [ ] A cron job or scheduled task runs backups automatically (daily minimum)
- [ ] You have tested the full restore path at least once — see [restore.md](restore.md)

---

## Related

- [restore.md](restore.md) — restore procedures
- [docs/deployment/runbook.md](../deployment/runbook.md) — deployment and rollback
- [docs/deployment/secrets.md](../deployment/secrets.md) — SOPS secrets (encrypted secrets.yaml is safe to back up in Git)
