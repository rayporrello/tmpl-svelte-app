#!/usr/bin/env bash
# Restores a Postgres database from a pg_dump custom-format backup.
#
# DESTRUCTIVE: drops and recreates all objects in the target database.
# Requires explicit --confirm flag to prevent accidental runs.
#
# Usage:
#   bash scripts/restore-db.sh <backup-file> --confirm
#
# DATABASE_URL must be set in the environment.
#
# Example:
#   export DATABASE_URL=postgres://user:password@host:5432/dbname
#   bash scripts/restore-db.sh backups/db/db-20250428T120000Z.pgdump --confirm
set -euo pipefail

BACKUP_FILE="${1:-}"
CONFIRM="${2:-}"

# ── Usage ──────────────────────────────────────────────────────────────────────

usage() {
  cat >&2 <<'EOF'
Usage: bash scripts/restore-db.sh <backup-file> --confirm

  <backup-file>   Path to the .pgdump file produced by backup-db.sh
  --confirm       Required. Acknowledges that this will OVERWRITE the database
                  at DATABASE_URL. There is no undo.

DATABASE_URL must be set in the environment.

Recommended before restore:
  1. Take a fresh backup first:   bun run backup:db
  2. Verify your backup:          bun run backup:verify -- <file>
  3. Then run this script.

See docs/operations/restore.md for full procedures.
EOF
}

# ── Guards ─────────────────────────────────────────────────────────────────────

if [[ -z "$BACKUP_FILE" ]]; then
  echo "Error: no backup file specified." >&2
  echo "" >&2
  usage
  exit 1
fi

if [[ "$CONFIRM" != "--confirm" ]]; then
  echo "Error: you must pass --confirm to proceed with a destructive restore." >&2
  echo "" >&2
  echo "  bash scripts/restore-db.sh ${BACKUP_FILE} --confirm" >&2
  echo "" >&2
  echo "This guard exists because restore OVERWRITES the target database." >&2
  echo "Read docs/operations/restore.md before proceeding." >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Error: DATABASE_URL is not set." >&2
  echo "" >&2
  echo "Set it before running:" >&2
  echo "  export DATABASE_URL=postgres://user:password@host:5432/dbname" >&2
  exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Error: backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "Error: pg_restore is not installed or not on PATH." >&2
  echo "" >&2
  echo "Install PostgreSQL client tools:" >&2
  echo "  macOS:         brew install libpq && brew link --force libpq" >&2
  echo "  Fedora/RHEL:   sudo dnf install postgresql" >&2
  echo "  Ubuntu/Debian: sudo apt install postgresql-client" >&2
  exit 1
fi

# ── Warning banner ─────────────────────────────────────────────────────────────

echo "┌─────────────────────────────────────────────────────────────────────┐"
echo "│  DESTRUCTIVE RESTORE                                                │"
echo "│                                                                     │"
echo "│  This will DROP and RECREATE all objects in the target database.   │"
echo "│  There is no undo. Unconfirmed data loss is permanent.             │"
echo "│                                                                     │"
echo "│  Backup file: ${BACKUP_FILE}"
echo "│                                                                     │"
echo "│  If this is production, stop here and read:                        │"
echo "│    docs/operations/restore.md                                       │"
echo "└─────────────────────────────────────────────────────────────────────┘"
echo ""

# ── Restore ────────────────────────────────────────────────────────────────────

echo "Restoring from ${BACKUP_FILE}..."
echo ""

# --clean:             drop objects before recreating them
# --if-exists:         suppress errors when objects don't exist yet
# --no-owner:          don't restore original ownership (often incompatible with target user)
# --no-acl:            don't restore original permissions (same reason)
# --single-transaction: wrap in one transaction — rolls back entirely on failure
pg_restore \
  --dbname="${DATABASE_URL}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --single-transaction \
  --no-password \
  "$BACKUP_FILE"

# ── Done ───────────────────────────────────────────────────────────────────────

echo ""
echo "OK: restore complete."
echo ""
echo "Verify the application is healthy:"
echo "  curl -fsS https://<domain>/healthz"
echo "  curl -fsS https://<domain>/readyz"
