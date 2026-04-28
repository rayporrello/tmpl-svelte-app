#!/usr/bin/env bash
# Backs up static/uploads/ to a timestamped .tar.gz archive with SHA256 checksum.
#
# Usage:
#   bun run backup:uploads
#   UPLOADS_DIR=path/to/uploads bash scripts/backup-uploads.sh
#
# Output: backups/uploads/uploads-<timestamp>.tar.gz
#         backups/uploads/uploads-<timestamp>.tar.gz.sha256
set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────────

UPLOADS_DIR="${UPLOADS_DIR:-static/uploads}"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
BACKUP_DIR="${BACKUP_DIR:-backups/uploads}"
BACKUP_FILE="${BACKUP_DIR}/uploads-${TIMESTAMP}.tar.gz"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

# ── Guards ─────────────────────────────────────────────────────────────────────

if [[ ! -d "$UPLOADS_DIR" ]]; then
  echo "Uploads directory not found: ${UPLOADS_DIR}"
  echo "Nothing to back up."
  exit 0
fi

# Count real files, excluding .gitkeep placeholders.
FILE_COUNT=$(find "$UPLOADS_DIR" -type f ! -name '.gitkeep' | wc -l | tr -d ' ')

if [[ "$FILE_COUNT" -eq 0 ]]; then
  echo "No files to back up in ${UPLOADS_DIR} (empty or .gitkeep only). Skipping."
  exit 0
fi

# ── Backup ─────────────────────────────────────────────────────────────────────

mkdir -p "$BACKUP_DIR"

# Remove partial artifacts if tar fails mid-run.
trap 'rm -f "$BACKUP_FILE" "$CHECKSUM_FILE"; echo "Backup failed — partial files removed." >&2' ERR

echo "Backing up ${FILE_COUNT} file(s) from ${UPLOADS_DIR} → ${BACKUP_FILE}"

# -C: change to parent dir so the archive preserves uploads/ as a relative path.
tar -czf "$BACKUP_FILE" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"

# ── Checksum ───────────────────────────────────────────────────────────────────

# Generate a SHA256 checksum sidecar for integrity verification.
# Stores the hash alongside the archive filename (basename only, dir-agnostic).
if command -v sha256sum >/dev/null 2>&1; then
  HASH=$(sha256sum "$BACKUP_FILE" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
  HASH=$(shasum -a 256 "$BACKUP_FILE" | awk '{print $1}')
else
  HASH=""
  echo "Note: sha256sum/shasum not found — skipping checksum generation."
fi

if [[ -n "$HASH" ]]; then
  echo "${HASH}  $(basename "$BACKUP_FILE")" > "$CHECKSUM_FILE"
fi

trap - ERR

# ── Summary ────────────────────────────────────────────────────────────────────

echo "OK: ${BACKUP_FILE}"
[[ -f "$CHECKSUM_FILE" ]] && echo "Checksum: ${CHECKSUM_FILE}"
echo ""
echo "To verify:  bun run backup:verify -- ${BACKUP_FILE}"
echo ""
echo "IMPORTANT: copy this file off-host before treating it as a real backup."
echo "           See docs/operations/backups.md for off-host options."
