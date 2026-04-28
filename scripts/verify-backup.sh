#!/usr/bin/env bash
# Verifies a backup file: existence, non-empty, format integrity, checksum.
#
# Usage:
#   bun run backup:verify                              # verifies most recent backup
#   bun run backup:verify -- backups/db/db-*.pgdump   # verifies specific file
#   bash scripts/verify-backup.sh <backup-file>
#
# Supported formats: .pgdump (pg_dump custom), .tar.gz (uploads archive)
set -euo pipefail

BACKUP_FILE="${1:-}"
PASS=true

# ── Usage ──────────────────────────────────────────────────────────────────────

usage() {
  cat >&2 <<'EOF'
Usage: bash scripts/verify-backup.sh [backup-file]

If no file is given, verifies the most recent backup found in backups/.

Examples:
  bash scripts/verify-backup.sh backups/db/db-20250428T120000Z.pgdump
  bash scripts/verify-backup.sh backups/uploads/uploads-20250428T120000Z.tar.gz
EOF
}

# ── Auto-detect most recent backup if no arg given ─────────────────────────────

if [[ -z "$BACKUP_FILE" ]]; then
  BACKUP_FILE=$(find backups/ -type f \( -name '*.pgdump' -o -name '*.tar.gz' \) 2>/dev/null \
    | grep -v '\.sha256$' \
    | sort -r \
    | head -1 || true)

  if [[ -z "$BACKUP_FILE" ]]; then
    echo "Error: no backup file specified and none found in backups/." >&2
    echo "" >&2
    usage
    exit 1
  fi

  echo "No file specified — verifying most recent backup: ${BACKUP_FILE}"
  echo ""
fi

# ── Existence ──────────────────────────────────────────────────────────────────

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "FAIL: file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

# ── Non-empty ─────────────────────────────────────────────────────────────────

if [[ ! -s "$BACKUP_FILE" ]]; then
  echo "FAIL: file is empty: ${BACKUP_FILE}" >&2
  PASS=false
else
  echo "OK:   file exists and is non-empty"
fi

# ── Format-specific integrity check ───────────────────────────────────────────

case "$BACKUP_FILE" in
  *.pgdump)
    if command -v pg_restore >/dev/null 2>&1; then
      if pg_restore --list "$BACKUP_FILE" >/dev/null 2>&1; then
        ENTRY_COUNT=$(pg_restore --list "$BACKUP_FILE" 2>/dev/null | grep -c '^[0-9]' || true)
        echo "OK:   pg_dump custom format is valid (${ENTRY_COUNT} catalog entries)"
      else
        echo "FAIL: pg_restore --list failed — dump may be corrupt" >&2
        PASS=false
      fi
    else
      echo "NOTE: pg_restore not found — skipping format integrity check"
    fi
    ;;
  *.tar.gz|*.tgz)
    if tar -tzf "$BACKUP_FILE" >/dev/null 2>&1; then
      ENTRY_COUNT=$(tar -tzf "$BACKUP_FILE" | wc -l | tr -d ' ')
      echo "OK:   tar archive is valid (${ENTRY_COUNT} entries)"
    else
      echo "FAIL: tar -tzf failed — archive may be corrupt" >&2
      PASS=false
    fi
    ;;
  *)
    echo "NOTE: unknown format — skipping format-specific integrity check"
    ;;
esac

# ── Checksum verification ─────────────────────────────────────────────────────

CHECKSUM_FILE="${BACKUP_FILE}.sha256"

if [[ -f "$CHECKSUM_FILE" ]]; then
  EXPECTED_HASH=$(awk '{print $1}' "$CHECKSUM_FILE")

  if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL_HASH=$(sha256sum "$BACKUP_FILE" | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then
    ACTUAL_HASH=$(shasum -a 256 "$BACKUP_FILE" | awk '{print $1}')
  else
    ACTUAL_HASH=""
    echo "NOTE: sha256sum/shasum not found — skipping checksum verification"
  fi

  if [[ -n "$ACTUAL_HASH" ]]; then
    if [[ "$EXPECTED_HASH" == "$ACTUAL_HASH" ]]; then
      echo "OK:   SHA256 checksum matches"
    else
      echo "FAIL: SHA256 checksum mismatch — file may be corrupt or tampered" >&2
      echo "      Expected: ${EXPECTED_HASH}" >&2
      echo "      Actual:   ${ACTUAL_HASH}" >&2
      PASS=false
    fi
  fi
else
  echo "NOTE: no .sha256 checksum sidecar found — skipping checksum verification"
fi

# ── Result ─────────────────────────────────────────────────────────────────────

echo ""
if [[ "$PASS" == "true" ]]; then
  echo "Verification passed: ${BACKUP_FILE}"
  exit 0
else
  echo "Verification FAILED: ${BACKUP_FILE}" >&2
  exit 1
fi
