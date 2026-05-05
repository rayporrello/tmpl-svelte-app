#!/usr/bin/env bash
# backup-wal-check.sh — verify WAL archive freshness against R2.
#
# Postgres' archive_timeout=60 means we expect a new WAL segment in R2 at
# least every minute on a healthy site. This script checks the latest
# archived WAL is recent enough; if it isn't, the WAL chain is broken and
# PITR is no longer reliable. Exits non-zero so the systemd unit's
# OnFailure= can alert.
#
# Tunable: WAL_FRESHNESS_MAX_SECONDS (default 600 = 10 minutes). Allows for
# brief network blips without false-alarming.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_SLUG="${PROJECT_SLUG:-$(jq -r '.project.projectSlug' "$ROOT_DIR/site.project.json" 2>/dev/null || true)}"
if [[ -z "${PROJECT_SLUG}" || "${PROJECT_SLUG}" == "null" ]]; then
	echo "FAIL backup:wal:check could not determine project slug." >&2
	exit 1
fi

CONTAINER="${PROJECT_SLUG}-postgres"
MAX_SECONDS="${WAL_FRESHNESS_MAX_SECONDS:-600}"

if ! podman container exists "${CONTAINER}"; then
	echo "FAIL backup:wal:check container ${CONTAINER} not found." >&2
	exit 1
fi

# wal-g wal-show prints a list of timelines and the latest WAL file per line.
# We grab the most recent timestamp from `wal-g backup-list` (which reports
# the latest WAL associated with each base backup). For per-WAL freshness,
# wal-g wal-verify integrity is authoritative but slower; this lighter check
# catches the common "archive_command stopped firing" failure mode.
LATEST_RAW="$(podman exec "${CONTAINER}" /usr/local/bin/wal-g wal-show --json 2>/dev/null || true)"
if [[ -z "${LATEST_RAW}" ]]; then
	echo "FAIL backup:wal:check wal-g wal-show returned no output." >&2
	echo "NEXT: Confirm R2 credentials in ${PROJECT_SLUG}.prod.env and re-run." >&2
	exit 1
fi

# Pull the largest end_ts across timelines. wal-show output is per-timeline
# and includes ISO-8601 timestamps. jq finds the max for us.
LATEST_TS="$(echo "${LATEST_RAW}" | jq -r '[.[].end_ts // empty] | max // empty')"
if [[ -z "${LATEST_TS}" || "${LATEST_TS}" == "null" ]]; then
	echo "FAIL backup:wal:check could not parse a timestamp from wal-show output." >&2
	echo "${LATEST_RAW}" >&2
	exit 1
fi

LATEST_EPOCH="$(date -u -d "${LATEST_TS}" +%s)"
NOW_EPOCH="$(date -u +%s)"
AGE_SECONDS=$(( NOW_EPOCH - LATEST_EPOCH ))

if (( AGE_SECONDS > MAX_SECONDS )); then
	echo "FAIL backup:wal:check latest WAL is ${AGE_SECONDS}s old (max ${MAX_SECONDS}s)." >&2
	echo "NEXT: Check the postgres container logs for archive_command failures: journalctl --user -u ${PROJECT_SLUG}-postgres -n 100" >&2
	exit 1
fi

echo "OK   backup:wal:check latest WAL ${AGE_SECONDS}s old (under ${MAX_SECONDS}s)."

if [[ -n "${BACKUP_HEALTHCHECK_URL:-}" ]]; then
	curl -fsS --retry 3 -m 10 "${BACKUP_HEALTHCHECK_URL}/wal-fresh" >/dev/null || true
fi
