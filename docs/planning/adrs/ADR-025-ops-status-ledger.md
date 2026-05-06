# ADR-025: Ops status ledger as local append-only state

- Status: Accepted
- Date: 2026-05-06
- Related: ADR-024 (lead-gen website appliance contract). Pass 02
  introduced `OpsResult` for in-memory script results; this ADR
  introduces the persistent counterpart.

## Context

Pass 02 established a single in-memory shape (`OpsResult`) for script
output. Several upcoming reliability slices need state that persists
across script invocations and across deploys:

- Rollback (pass 04) needs to know which release is current, which
  was previous, and whether the previous release is rollback-safe.
- `deploy:apply` (pass 05) needs to record release metadata at the
  moment it succeeds.
- Restore-drill scheduling (pass 07) needs to record when the last
  drill ran and whether it passed.
- `health:live` (pass 08) needs to read all of the above without each
  consumer reinventing a state shape.

Without a shared substrate, every script will invent its own state
location and shape. That recreates exactly the drift problem ADR-024
solved at the launch-policy level and pass 02 solved at the
result-shape level.

The substrate must be:

- Operational tool, not application data — must keep working when
  the app's database is down or mid-migration.
- Inspectable by hand — `cat`, `jq`, `grep` should answer "what was
  the last release" without running TypeScript.
- Concurrency-safe — multiple ops scripts can run at once.
- Local — solo-operator template; no replication or service to run.

## Decision

Per-project ops state lives in a local directory of channel files
plus an append-only event log.

### State directory

- Default: `~/.local/state/<project>/ops/` where `<project>` is read
  from `site.project.json`.
- Override: `OPS_STATE_DIR` env var. Tests use this to redirect into
  a temp dir.
- The directory is created on first write.

### Channel files

State is split across **channel files** — one JSON file per concern.
Each channel file holds a snapshot of the form:

```json
{
  "project": "<slug>",
  "last_attempt_at": "2026-05-06T12:34:56Z",
  "last_success_at": "2026-05-06T12:30:00Z",
  "status": "pass | warn | fail | unknown",
  "stale_after_seconds": 86400,
  "detail": { ... channel-specific payload ... }
}
```

Channels added in their owning passes:

| Channel              | Owner pass         | Purpose                                                        |
| -------------------- | ------------------ | -------------------------------------------------------------- |
| `releases.json`      | pass 03 (this)     | release history (image, sha, time, migrations, safety class)   |
| `smoke.json`         | pass 06            | last smoke result, history pointer                             |
| `restore-drill.json` | pass 07            | last drill evidence, cadence info                              |
| `backup.json`        | pass 07 or earlier | last backup, last verify                                       |
| `migration.json`     | TBD                | applied-migration tracking if needed alongside Drizzle journal |

Other channels appear as later passes need them. Channels are not
pre-allocated.

### Atomic writes and locking

- Writes go to `<channel>.json.tmp`, then `rename` to `<channel>.json`.
  This is atomic on Linux for files on the same filesystem.
- A `<channel>.lock` sentinel + retry/backoff guards concurrent
  writers. Lock is released on successful write or on process exit.

### Event log

- A single `events.ndjson` next to channel files records every state
  change as one JSON object per line.
- Rotates at 10MB. Keeps two rotated copies (`events.ndjson.1`,
  `events.ndjson.2`). Older rotations are deleted.
- Append is atomic via `O_APPEND`.

These thresholds (10MB, 2 rotations) are tactical defaults; they can
change without an ADR amendment as long as the rotation contract
holds.

## Alternatives considered

- **Single `state.json`** instead of per-channel files. Rejected:
  every write contends, every read pulls the whole file, easier to
  corrupt under concurrent writers across unrelated concerns.
- **SQLite**. Rejected: overkill for the volume (low-frequency ops
  events), adds a binary dependency, harder to inspect by hand, and a
  database file is more opaque than a JSON file when you're triaging
  at 3 AM.
- **A table in the app's Postgres**. Rejected: ops state must survive
  DB outages and migration breakages — exactly the moments operators
  need it most.

## Consequences

- State is per-host. A host loss loses the ledger unless
  `events.ndjson` was shipped to backup. Reconstruction from
  `events.ndjson` is possible but not automated.
- Operators can `cat`, `jq`, `grep` channel files directly.
- Each channel grows independently; concurrent writers across
  channels do not contend.
- Backing up the ledger is not handled here. Operators who want
  ledger durability beyond a single host can include
  `~/.local/state/<project>/ops/` in their backup chain.

## Out of scope (intentional)

- Backup of the ledger itself.
- Cross-host replication.
- A REST API for the ledger. Local files only.
- Pre-allocating channels other than `releases.json`. Each owning
  pass adds its channel.
