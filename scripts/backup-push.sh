#!/usr/bin/env bash
# Pushes local backups/ to off-host storage via rclone, with optional
# Healthchecks-style monitoring pings.
#
# Required env:
#   BACKUP_REMOTE          rclone remote spec, e.g. r2:bucket/site-backups
#                          Configure once with: rclone config
#
# Optional env:
#   BACKUP_HEALTHCHECK_URL Healthchecks.io ping URL (or compatible service).
#                          Pings <url>/start, <url> on success, <url>/fail on error.
#                          Without this, silent failures will not alert.
#   BACKUP_DIR             local backup directory (default: backups)
#
# Usage:
#   bun run backup:push
#   BACKUP_REMOTE=r2:bucket/path bash scripts/backup-push.sh
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-backups}"

# ── Guards ─────────────────────────────────────────────────────────────────────

if [[ -z "${BACKUP_REMOTE:-}" ]]; then
  echo "Error: BACKUP_REMOTE is not set." >&2
  echo "" >&2
  echo "Set it before running:" >&2
  echo "  export BACKUP_REMOTE=r2:bucket-name/site-backups" >&2
  echo "  bun run backup:push" >&2
  echo "" >&2
  echo "Configure the remote first if you haven't:" >&2
  echo "  rclone config" >&2
  exit 1
fi

if ! command -v rclone >/dev/null 2>&1; then
  echo "Error: rclone is not installed or not on PATH." >&2
  echo "" >&2
  echo "Install:" >&2
  echo "  curl https://rclone.org/install.sh | sudo bash" >&2
  echo "" >&2
  echo "Configure (once per host):" >&2
  echo "  rclone config" >&2
  exit 1
fi

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "Error: backup directory not found: ${BACKUP_DIR}" >&2
  echo "Run bun run backup:all first to create local backups." >&2
  exit 1
fi

# ── Healthchecks ping helper (no-op when URL unset) ───────────────────────────

ping() {
  local suffix="${1:-}"
  local url="${BACKUP_HEALTHCHECK_URL:-}"
  [[ -z "$url" ]] && return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "${url}${suffix}" || true
}

# ── Push ──────────────────────────────────────────────────────────────────────

ping "/start"

# Fail-ping on any error path before exit.
trap 'ping /fail; echo "Backup push failed." >&2' ERR

echo "Pushing ${BACKUP_DIR}/ → ${BACKUP_REMOTE}"

# --update: skip files that are newer at the destination.
# --transfers=4: parallelism cap; tune if uploads bottleneck.
rclone copy "$BACKUP_DIR" "$BACKUP_REMOTE" \
  --update \
  --transfers=4 \
  --stats=30s \
  --stats-one-line

trap - ERR
ping ""

echo "OK: pushed to ${BACKUP_REMOTE}"
