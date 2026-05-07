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
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
START_NS=$(date +%s%N)

PASS=true

record_backup_attempt() {
  local status="$1"
  local summary="$2"
  local end_ns elapsed_ms source
  end_ns=$(date +%s%N)
  elapsed_ms=$(( (end_ns - START_NS) / 1000000 ))
  source="backup:all db=${DB_STATUS:-unknown} uploads=${UPLOADS_STATUS:-unknown} push=${PUSH_STATUS:-unknown}"
  bun "${ROOT_DIR}/scripts/backup-record.ts" \
    --kind=legacy-all \
    --status="${status}" \
    --source="${source}" \
    --duration-ms="${elapsed_ms}" \
    --summary="${summary}" || true
}

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

# ── Off-host push (when BACKUP_REMOTE is set) ─────────────────────────────────

PUSH_STATUS="SKIPPED"
if [[ -n "${BACKUP_REMOTE:-}" ]]; then
  echo "=== Off-host push ==="
  if bash "${SCRIPT_DIR}/backup-push.sh"; then
    PUSH_STATUS="OK"
  else
    PUSH_STATUS="FAILED"
    PASS=false
  fi
  echo ""
fi

# ── Summary ────────────────────────────────────────────────────────────────────

echo "=== Backup summary ==="
echo "  Database: ${DB_STATUS}"
echo "  Uploads:  ${UPLOADS_STATUS}"
echo "  Push:     ${PUSH_STATUS}"
echo ""

if [[ "$PASS" == "true" ]]; then
  record_backup_attempt pass "Backup legacy-all completed"
  echo "All backups completed."
  echo ""
  echo "Verify with:   bun run backup:verify"

  if [[ "$PUSH_STATUS" == "SKIPPED" ]]; then
    echo ""
    echo "─────────────────────────────────────────────────────────────────"
    echo "  OFF-HOST REMINDER"
    echo "  Backups stored only on this server are not real backups."
    echo "  Set BACKUP_REMOTE to enable automatic off-host push, or copy"
    echo "  backups/ to a separate location manually before relying on them."
    echo "  See docs/operations/backups.md for setup."
    echo "─────────────────────────────────────────────────────────────────"
  fi
else
  echo "One or more backups FAILED. Check output above." >&2
  record_backup_attempt fail "Backup legacy-all failed"
  exit 1
fi
