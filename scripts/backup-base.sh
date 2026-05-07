#!/usr/bin/env bash
# backup-base.sh — daily WAL-G base backup for the bundled Postgres container.
#
# Runs wal-g backup-push from inside the project's Postgres container so it
# uses the same WAL-G binary, configuration, and credentials that
# archive_command uses. The container's environment provides AWS_*/WALG_*
# credentials (mapped from R2_* in the prod env file).
#
# Wired up to deploy/systemd/backup-base.service / backup-base.timer for the
# daily schedule. Run manually with: bun run backup:base
#
# Exits non-zero on any failure so the systemd unit's OnFailure= can fire.

set -euo pipefail

# Project slug — used to pick the right Postgres container when multiple
# sites share a host. Derived from site.project.json so the scripts work
# in any cloned project without per-site editing.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
START_NS=$(date +%s%N)

record_backup_attempt() {
	local status="$1"
	local summary="$2"
	local end_ns elapsed_ms
	end_ns=$(date +%s%N)
	elapsed_ms=$(( (end_ns - START_NS) / 1000000 ))
	bun "$ROOT_DIR/scripts/backup-record.ts" \
		--kind=base \
		--status="${status}" \
		--source="WAL-G backup-push via ${CONTAINER:-unknown}" \
		--duration-ms="${elapsed_ms}" \
		--summary="${summary}" || true
}

on_backup_error() {
	record_backup_attempt fail "Backup base failed"
}

trap on_backup_error ERR

PROJECT_SLUG="${PROJECT_SLUG:-$(jq -r '.project.projectSlug' "$ROOT_DIR/site.project.json" 2>/dev/null || true)}"
if [[ -z "${PROJECT_SLUG}" || "${PROJECT_SLUG}" == "null" ]]; then
	echo "FAIL backup:base could not determine project slug." >&2
	echo "NEXT: Set PROJECT_SLUG=<slug> or fix site.project.json before re-running." >&2
	record_backup_attempt fail "Backup base failed before project slug was resolved"
	exit 1
fi

CONTAINER="${PROJECT_SLUG}-postgres"

if ! command -v podman >/dev/null 2>&1; then
	echo "FAIL backup:base requires podman on PATH." >&2
	record_backup_attempt fail "Backup base failed because podman was missing"
	exit 1
fi

if ! podman container exists "${CONTAINER}"; then
	echo "FAIL backup:base could not find container ${CONTAINER}." >&2
	echo "NEXT: Confirm <project>-postgres is running: systemctl --user status ${PROJECT_SLUG}-postgres" >&2
	record_backup_attempt fail "Backup base failed because the Postgres container was missing"
	exit 1
fi

echo "backup:base start container=${CONTAINER}"

# wal-g backup-push reads PGDATA from inside the container; we pass the
# canonical path here.
podman exec "${CONTAINER}" /usr/local/bin/wal-g backup-push /var/lib/postgresql/data

END_NS=$(date +%s%N)
ELAPSED_MS=$(( (END_NS - START_NS) / 1000000 ))
echo "backup:base done container=${CONTAINER} elapsed_ms=${ELAPSED_MS}"
record_backup_attempt pass "Backup base completed"
trap - ERR

# Optional Healthchecks.io ping after a successful base backup.
if [[ -n "${BACKUP_HEALTHCHECK_URL:-}" ]]; then
	curl -fsS --retry 3 -m 10 "${BACKUP_HEALTHCHECK_URL}" >/dev/null || true
fi
