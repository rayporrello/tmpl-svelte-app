# Ops Status Ledger

The ops-status ledger is local, inspectable state for deployment and
maintenance scripts. ADR-025 is the design source; this page is the
operator-facing contract.

## State Directory

By default, ledger files live at:

```text
~/.local/state/<project>/ops/
```

`<project>` comes from `project.projectSlug` in `site.project.json`.
Set `OPS_STATE_DIR` to override the location, which is how tests and
one-off diagnostics can redirect writes into a temporary directory.
The directory is created on first use.

## Channel Files

Each operational concern gets one JSON channel file:

```text
releases.json
restore-drill.json
```

Future passes may add channels such as smoke, backup, or migration state.
Channels are not pre-created.

A channel snapshot follows this shape:

```json
{
	"project": "project",
	"last_attempt_at": "2026-05-06T12:34:56.000Z",
	"last_success_at": "2026-05-06T12:34:56.000Z",
	"status": "pass",
	"stale_after_seconds": 86400,
	"detail": {}
}
```

The `detail` object is owned by the channel. For `releases.json`, it
contains release history with image refs, deployed SHAs, migration
filenames, and rollback-safety classification.

For `restore-drill.json`, `detail` follows this shape:

```json
{
	"attemptedAt": "2026-05-07T03:15:00.000Z",
	"succeededAt": "2026-05-07T03:15:00.000Z",
	"status": "pass",
	"targetTime": "2026-05-07T02:15:00.000Z",
	"durationMs": 42000,
	"backupSource": "WAL-G LATEST via project-postgres image=ghcr.io/owner/project:<sha>",
	"steps": [
		{
			"id": "DRILL-001",
			"severity": "pass",
			"summary": "Source container project-postgres present."
		}
	]
}
```

The channel uses `stale_after_seconds = 604800` (7 days). Failed drills update
`last_attempt_at` and preserve the previous `last_success_at` so operators can
see both the newest attempt and the newest successful proof.

## Atomic Writes And Locking

Channel writes are atomic:

1. Write the next snapshot to `<channel>.json.tmp`.
2. Rename the temp file over `<channel>.json`.

The rename is atomic on Linux when both files are on the same
filesystem. A sibling `<channel>.lock` file serializes concurrent
writers so operators do not end up with torn JSON.

If an interrupted run leaves a `.tmp` file behind, readers ignore it and
continue reading the last complete channel file.

## Event Log

Every state change can also append one JSON object to:

```text
events.ndjson
```

The log is newline-delimited JSON, one event per line, and is appended
with `O_APPEND` so multiple writers can safely add events. It rotates at
10 MB and keeps two old copies:

```text
events.ndjson
events.ndjson.1
events.ndjson.2
```

Older rotations are deleted. The ledger is local host state; ADR-025
intentionally does not add replication, backup, or a REST API. Operators
who need the ledger preserved across host loss can include the state
directory in their backup chain.
