#!/usr/bin/env bash
# Runs all backup scripts: database and uploads.
#
# Usage:
#   bun run backup:all
#   DATABASE_URL=postgres://... bash scripts/backup-all.sh
#
# Each sub-script handles its own guards. This script reports which succeeded.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PASS=true

# ── Database ───────────────────────────────────────────────────────────────────

echo "=== Database backup ==="
if bash "${SCRIPT_DIR}/backup-db.sh"; then
  DB_STATUS="OK"
else
  DB_STATUS="FAILED"
  PASS=false
fi

echo ""

# ── Uploads ────────────────────────────────────────────────────────────────────

echo "=== Uploads backup ==="
if bash "${SCRIPT_DIR}/backup-uploads.sh"; then
  UPLOADS_STATUS="OK"
else
  UPLOADS_STATUS="FAILED"
  PASS=false
fi

echo ""

# ── Summary ────────────────────────────────────────────────────────────────────

echo "=== Backup summary ==="
echo "  Database: ${DB_STATUS}"
echo "  Uploads:  ${UPLOADS_STATUS}"
echo ""

if [[ "$PASS" == "true" ]]; then
  echo "All backups completed."
  echo ""
  echo "Verify with:   bun run backup:verify"
  echo ""
  echo "─────────────────────────────────────────────────────────────────"
  echo "  OFF-HOST REMINDER"
  echo "  Backups stored only on this server are not real backups."
  echo "  Copy backups/ to a separate location before relying on them."
  echo "  See docs/operations/backups.md for off-host options."
  echo "─────────────────────────────────────────────────────────────────"
else
  echo "One or more backups FAILED. Check output above." >&2
  exit 1
fi
