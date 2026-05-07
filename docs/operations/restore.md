# Restore Guide

How to restore a Postgres database or uploads archive from a backup. Read this **before** you need it — restoring under pressure is when mistakes happen.

Two restore paths:

- **PITR via WAL-G** (production default) — restore the website Postgres cluster to any moment in the last 14 days.
- **pg_dump restore** (convenience / cross-host export) — restore a logical snapshot. Use when handing a copy to a client, rebuilding from a portable export, or inspecting data in a scratch database.

If you are choosing under pressure: PITR is almost always the right answer.
Faster, more recent, atomic across all databases.

Before touching production, check the latest non-destructive proof in
[restore-drill.md](restore-drill.md). It shows where the weekly drill writes
evidence and how to run one immediately.

---

## Before any destructive restore

1. **Confirm which environment you are targeting.** Restoring to production is irreversible. Restoring to dev is low-stakes. Know which is which before running anything.
2. **Take a fresh backup of the current state first.** Even if the data is broken, it preserves your starting point.
   ```bash
   bun run backup:base    # PITR base backup
   bun run backup:db      # logical pg_dump (also works as a quick sanity export)
   ```
3. **Verify the backup you intend to restore from.**
   ```bash
   # PITR: confirm a recent base + WAL exist
   bun run backup:pitr:check
   # pg_dump: verify checksum of a specific file
   bun run backup:verify -- <backup-file>
   ```
4. **Stop the application if necessary.** For database restores, the app can remain running if you're comfortable with it reading inconsistent data during the restore window. For a clean restore, stop it first.
5. **Check privacy impact.** A database restore can reintroduce contact submissions or automation records that were pruned or manually deleted after the backup was taken.

---

## Restore the database (PITR — preferred for bundled Postgres)

PITR restores the website Postgres cluster to a chosen point in time. The
procedure restores into a fresh container with a new volume; the operator
promotes by swapping volumes on the existing `<project>-postgres` Quadlet. The
original data stays available as a rollback for at least 24 hours.

### 1. Decide on a target

```bash
# What restore points are available?
podman exec <project>-postgres /usr/local/bin/wal-g backup-list --json
podman exec <project>-postgres /usr/local/bin/wal-g wal-show --json
```

Pick a recovery target between the start of the latest usable base backup
and the latest archived WAL. Express it as ISO-8601 UTC (e.g.
`2026-05-05T14:30:00Z`).

### 2. Run a non-destructive drill first

When in doubt, prove the restore works against a temp container before
touching production:

```bash
bun run backup:restore:drill -- --target-time=2026-05-05T14:30:00Z
```

The drill spins up a parallel Postgres on a different port, restores into
a scratch volume, replays WAL up to the target, runs a sanity SELECT, and
tears down. **If it fails, do not proceed with the production restore —
fix WAL-G config first.**

### 3. Stop the live app and worker

```bash
systemctl --user stop <project>-web <project>-worker
# Leave <project>-postgres running for now — we'll swap its volume.
```

The worker must be stopped so it does not continue draining the outbox
during the restore window. Web must be stopped so users do not write data
we are about to discard.

### 4. Restore into a new volume

```bash
podman volume create <project>-postgres-data-restored

SOURCE_IMAGE="$(podman inspect --format '{{.ImageName}}' <project>-postgres)"
podman run -d --name <project>-postgres-restore --rm \
  -v <project>-postgres-data-restored:/var/lib/postgresql/data \
  -e POSTGRES_PASSWORD=temp-restore-password \
  -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_ENDPOINT \
  -e AWS_REGION -e WALG_S3_PREFIX -e WALG_COMPRESSION_METHOD \
  --entrypoint /bin/sh "$SOURCE_IMAGE" -c 'sleep infinity'

podman exec <project>-postgres-restore /usr/local/bin/wal-g \
  backup-fetch /var/lib/postgresql/data LATEST

podman exec <project>-postgres-restore sh -c 'cat >> /var/lib/postgresql/data/postgresql.auto.conf <<EOF
restore_command = '\''/usr/local/bin/wal-g wal-fetch %f %p'\''
recovery_target_time = '\''2026-05-05T14:30:00Z'\''
recovery_target_action = '\''pause'\''
EOF
touch /var/lib/postgresql/data/recovery.signal
chown postgres:postgres /var/lib/postgresql/data/postgresql.auto.conf /var/lib/postgresql/data/recovery.signal'

podman exec -u postgres -d <project>-postgres-restore \
  /usr/local/bin/docker-entrypoint.sh postgres
```

Watch the logs (`podman logs -f <project>-postgres-restore`) until you
see "recovery has paused" — Postgres reached the target and is waiting
for confirmation.

### 5. Verify the restored data

```bash
podman exec -u postgres <project>-postgres-restore \
  psql -d <project>_app -c 'SELECT count(*) FROM contact_submissions;'
```

If the counts and a few sample rows look right, promote.

### 6. Promote the restored volume

```bash
systemctl --user stop <project>-postgres
podman volume rename <project>-postgres-data <project>-postgres-data-pre-restore
podman volume rename <project>-postgres-data-restored <project>-postgres-data

podman exec <project>-postgres-restore \
  pg_ctl promote -D /var/lib/postgresql/data
podman stop <project>-postgres-restore

systemctl --user start <project>-postgres
systemctl --user start <project>-web <project>-worker
```

If something is wrong, the original data is in
`<project>-postgres-data-pre-restore` — rename it back to roll forward.

### 7. Take a fresh base backup

After a successful restore, the WAL timeline bumped. Make a clean base
backup so subsequent PITR works against the new timeline:

```bash
bun run backup:base
```

### 8. Drop the rollback volume once you're confident

Wait at least 24 hours before this step:

```bash
podman volume rm <project>-postgres-data-pre-restore
```

Removing it commits to the new timeline.

---

## Restore the database (pg_dump fallback)

### Using the restore script (recommended)

The script requires an explicit `--confirm` flag to prevent accidental runs.

```bash
export DATABASE_DIRECT_URL=postgres://user:password@127.0.0.1:5432/dbname
bash scripts/restore-db.sh backups/db/db-20250428T120000Z.pgdump --confirm
```

Or via `bun run`:

```bash
bun run restore:db -- backups/db/db-20250428T120000Z.pgdump --confirm
```

The script uses `DATABASE_DIRECT_URL` first when it is present, then falls back to `DATABASE_URL`. It uses `--clean --if-exists` to drop objects before recreating them, and wraps everything in a single transaction. If any part fails, the restore is rolled back and the database is left in its pre-restore state.

### Manual pg_restore

If you prefer to run pg_restore directly:

```bash
pg_restore \
  --dbname="${DATABASE_DIRECT_URL:-$DATABASE_URL}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --single-transaction \
  --verbose \
  backups/db/db-20250428T120000Z.pgdump
```

Flags explained:

| Flag                   | Why                                                          |
| ---------------------- | ------------------------------------------------------------ |
| `--clean`              | Drop objects before recreating — ensures a clean slate       |
| `--if-exists`          | Suppress errors when objects don't exist yet (first restore) |
| `--no-owner`           | Don't try to reassign ownership to original DB user          |
| `--no-acl`             | Don't restore original permission grants                     |
| `--single-transaction` | Atomic: rolls back entirely on failure                       |
| `--verbose`            | Show progress — useful when diagnosing slow restores         |

### What pg_restore does NOT do

- It does not create the database itself. The target database must already exist. Create it if needed:
  ```bash
  createdb --host=127.0.0.1 --username=site_user site_db
  ```
- It does not run Drizzle migrations. After restore, run:
  ```bash
  bun run db:migrate
  ```
  Only needed if the schema has changed since the backup was taken.

---

## Restore uploads

Extract the archive to restore `static/uploads/`:

```bash
# Preview what's in the archive
tar -tzf backups/uploads/uploads-20250428T120000Z.tar.gz

# Restore to the original location (overwrites existing files)
tar -xzf backups/uploads/uploads-20250428T120000Z.tar.gz -C .
```

The archive was created with `-C . uploads/` so it extracts to `static/uploads/` relative to the project root.

To restore to a different location (e.g., to inspect before applying):

```bash
mkdir /tmp/uploads-inspect
tar -xzf backups/uploads/uploads-20250428T120000Z.tar.gz -C /tmp/uploads-inspect
ls /tmp/uploads-inspect/uploads/
```

---

## Testing a restore

A backup is not trustworthy until a restore has been tested. Test the restore path before you need it in an emergency.

### Test database restore (temporary database)

```bash
# 1. Create a scratch database
createdb --host=127.0.0.1 --username=site_user site_restore_test

# 2. Restore into it
pg_restore \
  --dbname="postgres://site_user:password@127.0.0.1:5432/site_restore_test" \
  --no-owner --no-acl \
  backups/db/db-20250428T120000Z.pgdump

# 3. Spot-check the data
psql postgres://site_user:password@127.0.0.1:5432/site_restore_test \
  -c "SELECT COUNT(*) FROM contact_submissions;"
psql postgres://site_user:password@127.0.0.1:5432/site_restore_test \
  -c "\dt"

# 4. Drop the scratch database
dropdb --host=127.0.0.1 --username=site_user site_restore_test
```

### Test uploads restore

```bash
# Extract to a temp dir, inspect, then discard
mkdir /tmp/uploads-restore-test
tar -xzf backups/uploads/uploads-20250428T120000Z.tar.gz -C /tmp/uploads-restore-test
ls -lhR /tmp/uploads-restore-test/
rm -rf /tmp/uploads-restore-test
```

---

## Avoiding production accidents

**The most common mistake: running a restore against production when you meant dev.**

Guards built into the restore script:

- Requires `--confirm` flag — prevents piped or accidental execution
- Does not auto-detect environment — you must explicitly set `DATABASE_DIRECT_URL` or `DATABASE_URL`
- Prints a warning banner with the backup filename before restoring

Additional habits:

- Never export `DATABASE_DIRECT_URL` or `DATABASE_URL` pointing at production in your shell profile
- Use different terminal profiles or clear exports before switching environments
- When in doubt: `echo ${DATABASE_DIRECT_URL:-$DATABASE_URL}` and confirm the host before running restore

---

## Rollback vs restore

Not all disaster recovery scenarios require a restore from backup:

| Scenario                 | Best approach                                                                |
| ------------------------ | ---------------------------------------------------------------------------- |
| Bad code deploy          | Rollback by SHA — see [runbook.md](../deployment/runbook.md#rollback-by-sha) |
| Bad database migration   | `pg_restore` from pre-migration backup                                       |
| Accidental data deletion | `pg_restore` from most recent backup                                         |
| Server failure           | Restore backup to new server; re-deploy image                                |
| Corrupted uploads        | Extract uploads archive                                                      |

For code rollbacks, the Quadlet SHA-based rollback (typically <5 seconds) is faster than any backup restore. Reserve restore for data loss scenarios.

---

## After a successful restore

1. Restart the application:
   ```bash
   systemctl --user restart <project>-web
   ```
2. Run post-deploy smoke checks:
   ```bash
   curl -fsS https://<domain>/healthz
   curl -fsS https://<domain>/readyz
   ```
3. Verify application behavior manually — spot-check critical pages and data.
4. Re-run retention pruning:
   ```bash
   bun run privacy:prune
   bun run privacy:prune -- --apply
   ```
5. If any user deletion request was fulfilled after the restored backup was taken, re-apply that deletion before normal operation resumes.
6. If restoring on production: notify stakeholders of the recovery window and any data gap.

Backups retained only for disaster recovery should not be used as an alternate live data source. If a deletion request has been fulfilled in live systems, keep older backup copies beyond normal use until they age out on the documented backup schedule.

---

## Related

- [backups.md](backups.md) — backup procedures and off-host storage
- [docs/deployment/runbook.md](../deployment/runbook.md) — deployment, rollback by SHA, post-deploy smoke
