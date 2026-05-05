#!/usr/bin/env bash
# backup-pitr-check.sh — verify the PITR chain is intact and recent.
#
# Two checks combined:
#   1. At least one base backup exists in R2 within PITR_RETENTION_DAYS.
#   2. WAL archives are fresh (delegates to backup-wal-check.sh).
#
# Run weekly via deploy/systemd/backup-check.timer. Run manually before
# deploys with: bun run backup:pitr:check
#
# Failure here is the loudest possible signal: PITR is not currently
# achievable. Wake up the operator.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_SLUG="${PROJECT_SLUG:-$(jq -r '.project.projectSlug' "$ROOT_DIR/site.project.json" 2>/dev/null || true)}"
if [[ -z "${PROJECT_SLUG}" || "${PROJECT_SLUG}" == "null" ]]; then
	echo "FAIL backup:pitr:check could not determine project slug." >&2
	exit 1
fi

CONTAINER="${PROJECT_SLUG}-postgres"
MAX_BASE_AGE_DAYS="${PITR_RETENTION_DAYS:-14}"

if ! podman container exists "${CONTAINER}"; then
	echo "FAIL backup:pitr:check container ${CONTAINER} not found." >&2
	exit 1
fi

# Fetch the latest base backup timestamp via wal-g backup-list --json.
LIST_JSON="$(podman exec "${CONTAINER}" /usr/local/bin/wal-g backup-list --json 2>/dev/null || true)"
if [[ -z "${LIST_JSON}" || "${LIST_JSON}" == "null" || "${LIST_JSON}" == "[]" ]]; then
	echo "FAIL backup:pitr:check no base backups exist in R2." >&2
	echo "NEXT: Run bun run backup:base manually and verify wal-g credentials." >&2
	exit 1
fi

LATEST_TS="$(echo "${LIST_JSON}" | jq -r 'sort_by(.time) | last | .time')"
if [[ -z "${LATEST_TS}" || "${LATEST_TS}" == "null" ]]; then
	echo "FAIL backup:pitr:check could not parse base backup timestamp." >&2
	echo "${LIST_JSON}" >&2
	exit 1
fi

LATEST_EPOCH="$(date -u -d "${LATEST_TS}" +%s)"
NOW_EPOCH="$(date -u +%s)"
AGE_DAYS=$(( (NOW_EPOCH - LATEST_EPOCH) / 86400 ))

# Daily base backups should mean the latest is < 2 days old. We treat 3+
# as a failure to give one missed run a grace window before paging.
if (( AGE_DAYS > 2 )); then
	echo "FAIL backup:pitr:check latest base backup is ${AGE_DAYS}d old (expected <= 2d)." >&2
	echo "NEXT: Investigate ${PROJECT_SLUG}-backup-base.timer / .service via journalctl." >&2
	exit 1
fi

# Also check WAL freshness — PITR needs both pieces.
"${ROOT_DIR}/scripts/backup-wal-check.sh"

echo "OK   backup:pitr:check latest base backup ${AGE_DAYS}d old; WAL fresh; retention ${MAX_BASE_AGE_DAYS}d."
