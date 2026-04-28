#!/usr/bin/env bash
# Postgres database backup using pg_dump custom format.
# Requires: DATABASE_URL set in environment, pg_dump on PATH.
#
# Usage:
#   bun run backup:db
#   DATABASE_URL=postgres://... bash scripts/backup-db.sh
#
# Output: backups/db/db-<timestamp>.pgdump
# Restore: bash scripts/restore-db.sh <file> --confirm
set -euo pipefail

# ── Guards ─────────────────────────────────────────────────────────────────────

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Error: DATABASE_URL is not set." >&2
  echo "" >&2
  echo "Set it before running:" >&2
  echo "  export DATABASE_URL=postgres://user:password@host:5432/dbname" >&2
  echo "  bun run backup:db" >&2
  echo "" >&2
  echo "  Or source your rendered .env first:" >&2
  echo "  set -a && source .env && set +a && bun run backup:db" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "Error: pg_dump is not installed or not on PATH." >&2
  echo "" >&2
  echo "Install PostgreSQL client tools:" >&2
  echo "  macOS:         brew install libpq && brew link --force libpq" >&2
  echo "  Fedora/RHEL:   sudo dnf install postgresql" >&2
  echo "  Ubuntu/Debian: sudo apt install postgresql-client" >&2
  exit 1
fi

# ── Paths ──────────────────────────────────────────────────────────────────────

TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
BACKUP_DIR="${BACKUP_DIR:-backups/db}"
BACKUP_FILE="${BACKUP_DIR}/db-${TIMESTAMP}.pgdump"

mkdir -p "$BACKUP_DIR"

# Remove partial file if pg_dump fails mid-run.
trap 'rm -f "$BACKUP_FILE"; echo "Backup failed — partial file removed." >&2' ERR

# ── Backup ─────────────────────────────────────────────────────────────────────

echo "Backing up database → ${BACKUP_FILE}"

# Custom format: compressed, supports selective restore with pg_restore.
# --no-password: fail instead of prompting (we expect credentials in DATABASE_URL).
pg_dump \
  --format=custom \
  --no-password \
  --dbname="${DATABASE_URL}" \
  --file="${BACKUP_FILE}"

trap - ERR

# ── Summary ────────────────────────────────────────────────────────────────────

echo "OK: ${BACKUP_FILE}"
echo ""
echo "To verify:  bun run backup:verify -- ${BACKUP_FILE}"
echo "To restore: bash scripts/restore-db.sh ${BACKUP_FILE} --confirm"
echo ""
echo "IMPORTANT: copy this file off-host before treating it as a real backup."
echo "           See docs/operations/backups.md for off-host options."
