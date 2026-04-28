# Restore Guide

How to restore a Postgres database or uploads archive from a backup. Read this **before** you need it — restoring under pressure is when mistakes happen.

---

## Before any destructive restore

1. **Confirm which environment you are targeting.** Restoring to production is irreversible. Restoring to dev is low-stakes. Know which is which before running anything.
2. **Take a fresh backup of the current state first.** Even if the data is broken, it preserves your starting point.
   ```bash
   bun run backup:db
   ```
3. **Verify the backup you intend to restore from.**
   ```bash
   bun run backup:verify -- <backup-file>
   ```
4. **Stop the application if necessary.** For database restores, the app can remain running if you're comfortable with it reading inconsistent data during the restore window. For a clean restore, stop it first.

---

## Restore the database

### Using the restore script (recommended)

The script requires an explicit `--confirm` flag to prevent accidental runs.

```bash
export DATABASE_URL=postgres://user:password@host:5432/dbname
bash scripts/restore-db.sh backups/db/db-20250428T120000Z.pgdump --confirm
```

Or via `bun run`:

```bash
bun run restore:db -- backups/db/db-20250428T120000Z.pgdump --confirm
```

The script uses `--clean --if-exists` to drop objects before recreating them, and wraps everything in a single transaction. If any part fails, the restore is rolled back and the database is left in its pre-restore state.

### Manual pg_restore

If you prefer to run pg_restore directly:

```bash
pg_restore \
  --dbname="$DATABASE_URL" \
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
- Does not auto-detect environment — you must explicitly set `DATABASE_URL`
- Prints a warning banner with the backup filename before restoring

Additional habits:

- Never export `DATABASE_URL` pointing at production in your shell profile
- Use different terminal profiles or clear exports before switching environments
- When in doubt: `echo $DATABASE_URL` and confirm the host before running restore

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
4. If restoring on production: notify stakeholders of the recovery window and any data gap.

---

## Related

- [backups.md](backups.md) — backup procedures and off-host storage
- [docs/deployment/runbook.md](../deployment/runbook.md) — deployment, rollback by SHA, post-deploy smoke
