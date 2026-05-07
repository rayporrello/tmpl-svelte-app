# Pass 08 — Restore-drill scheduling and evidence persistence

## Goal

Schedule the existing non-destructive restore drill on a systemd
timer; retrofit it to `OpsResult`; persist drill evidence to the
ops-status ledger as a typed channel (`restore-drill.json`). After
this pass, "when did this site last prove it can restore from
backups?" is answerable from the ledger rather than from operator
memory.

## Pre-conditions

- Passes 01–07 merged.
- `scripts/lib/ops-result.ts` (pass 02) provides the result shape
  and `printOpsResults` printer.
- `scripts/lib/ops-status.ts` (pass 03) provides `writeChannel`,
  `readChannel`, `appendEvent`, `isStale`.
- `scripts/lib/release-state.ts` (pass 03) is the precedent for a
  typed channel wrapper.
- Existing `scripts/backup-restore-drill.ts` returns
  `RestoreDrillResult[]` (legacy shape, ~400 lines per audit).
  This pass retrofits it to `OpsResult[]` and adds ledger writes.
- Existing `deploy/systemd/backup*.timer` files demonstrate the
  timer pattern this pass mirrors.
- Existing `docs/operations/restore.md` covers PITR restoration;
  this pass adds a sibling `restore-drill.md`.

## Scope

The pass touches the drill script, adds a typed channel wrapper,
adds a systemd timer + service unit, adds doctor / launch-gate
checks, and ships an operator runbook. No new ADR (the channel
pattern is locked by ADR-025).

### Retrofit

`scripts/backup-restore-drill.ts`:

- Replace `RestoreDrillResult[]` return type with
  `OpsResult[]`. Each step in the existing drill becomes one
  `OpsResult`.
- Map existing fields per pass 02 convention:
  | Old | New |
  |---|---|
  | `id` | `id` |
  | `label` | `summary` |
  | `detail` | `detail` |
  | `hint` | first entry of `remediation` |
  | `status: pass` | `severity: pass` |
  | `status: fail` | `severity: fail` |
  | `status: skip` | `severity: info` |
- Standalone CLI (`bun run backup:restore:drill`) must remain
  working with stable human output.
- **Render via `printOpsResults`** (pass 02), not the legacy
  `OK/SKIP/FAIL` helpers from `print.ts`. This script gets the
  unified glyph rendering.
- Export the result-emitting function (not just the CLI) so the
  ledger-writing code below can call it without spawning a
  subprocess.
- After the drill completes (success or failure), invoke
  `recordDrill(...)` from the new lib (below).

### New file: `scripts/lib/restore-drill-state.ts`

Typed wrapper over the `restore-drill.json` channel. Exports:

```ts
export interface RestoreDrillSnapshot {
	/** ISO 8601. */
	attemptedAt: string;
	/** ISO 8601 if the drill passed; null otherwise. */
	succeededAt: string | null;
	/** Worst severity across all step results. */
	status: 'pass' | 'warn' | 'fail' | 'unknown';
	/** PITR target time the drill exercised. */
	targetTime: string;
	durationMs: number;
	/** Source backup window or file used for the drill. */
	backupSource: string;
	/** Per-step evidence; OpsResult shape. */
	steps: OpsResult[];
}

export function recordDrill(opts: {
	results: OpsResult[];
	targetTime: string;
	backupSource: string;
	startedAt: Date;
	finishedAt: Date;
}): void;

export function readLastDrill(): RestoreDrillSnapshot | null;

export function isDrillStale(now?: Date): boolean;
```

`recordDrill`:

- Computes overall status from `worstSeverity` (pass 02).
- Writes a snapshot to the `restore-drill.json` channel with
  `last_attempt_at = finishedAt`,
  `last_success_at = finishedAt` if status is `pass`, else
  preserve the prior `last_success_at` (read-modify-write).
- Sets `stale_after_seconds = 604800` (7 days) on the snapshot.
- Appends a `restore-drill` event to `events.ndjson` summarizing
  the run (worst severity, duration, target time). The event
  body must not include any secret values from the drill steps —
  only the `OpsResult` summaries / ids.

`readLastDrill`:

- Reads `restore-drill.json` and reconstructs the
  `RestoreDrillSnapshot`. Returns `null` if the channel does not
  exist.

`isDrillStale`:

- Wraps `isStale('restore-drill', now)`.

### New systemd files

`deploy/systemd/restore-drill.service`:

```ini
[Unit]
Description=Weekly non-destructive restore drill
After=network-online.target postgres.service

[Service]
Type=oneshot
WorkingDirectory=%h/<project>
EnvironmentFile=%h/<project>/.env
ExecStart=%h/.bun/bin/bun run backup:restore:drill
StandardOutput=journal
StandardError=journal
```

(Mirror the conventions in existing `deploy/systemd/backup-*.service`
files; pull paths and unit-naming style from there. The example
above is illustrative — match what backup-base.service and
backup.service actually do.)

`deploy/systemd/restore-drill.timer`:

```ini
[Unit]
Description=Schedule weekly restore drill

[Timer]
OnCalendar=Sun *-*-* 03:00:00 UTC
Persistent=true
RandomizedDelaySec=15min

[Install]
WantedBy=timers.target
```

Match the patterns in `deploy/systemd/backup*.timer` for
consistency. The randomized delay protects against thundering-
herd if multiple sites share infrastructure.

### Modified files

`scripts/doctor.ts`:

- Add a "Restore drill" section with:
  - `DOCTOR-DRILL-001` — `restore-drill.json` channel exists in
    ledger. Missing → `warn` ("Drill has never run; first run
    is scheduled by the timer or operator can run
    `bun run backup:restore:drill` manually").
  - `DOCTOR-DRILL-002` — last drill not stale (using
    `isDrillStale`). Stale → `warn` with the
    `last_attempt_at` and `last_success_at` in detail.
- Both checks emit `OpsResult` per pass 02 contract.

`scripts/lib/launch-blockers.ts`:

- Add a soft-warn (not blocker) for production launch when no
  drill has run in the past 14 days. Reasoning: sites should be
  able to launch without first running a drill; but the warning
  surfaces the gap so the operator can run one before sleeping.

`scripts/lib/protected-files.ts`:

- Add the new systemd unit/timer files to `PROTECTED_FILES` and
  `INIT_SITE_OWNED_FILES` (matching the existing backup unit
  entries' pattern).

`scripts/lib/site-project.ts`:

- If site-project rewriting touches systemd unit files for
  project-slug substitution (it does for backup units; check
  during reads), apply the same rewriting for the restore-drill
  units.

`README.md`:

- Update the Reliability surface table: the "Restore drill" row
  currently reads "Script exists; scheduling and evidence
  persistence in pass 07" (or similar — check). Update to
  "Implemented; weekly via systemd timer; evidence in ops-status
  ledger".

`docs/operations/restore-drill.md` (new):

- What the drill does (non-destructive PITR validation).
- The weekly schedule and how to override
  (`systemctl --user edit restore-drill.timer`).
- How to read drill evidence from the ledger:
  `cat ~/.local/state/<project>/ops/restore-drill.json | jq`.
- What to do if the drill fails (link to
  `docs/operations/restore.md` and the ADR-025 ledger doc).
- Operator-triggered drill:
  `bun run backup:restore:drill` runs immediately.

`docs/operations/restore.md`:

- Add a cross-link to `restore-drill.md` near the top so an
  operator triaging an incident sees the drill evidence as a
  starting point.

`docs/operations/ops-status-ledger.md` (from pass 03):

- Document the `restore-drill` channel shape.

`docs/documentation-map.md`:

- Add `docs/operations/restore-drill.md`.

### Tests

`tests/unit/restore-drill-state.test.ts` (new):

- `recordDrill` with all-pass results writes snapshot with
  `status: 'pass'` and updates both timestamps.
- `recordDrill` with a fail result preserves prior
  `last_success_at` and updates only `last_attempt_at`.
- `readLastDrill` returns `null` when the channel is empty.
- `readLastDrill` returns the latest snapshot.
- `isDrillStale` returns `true` when last_success_at is older
  than `stale_after_seconds`.
- `isDrillStale` returns `true` when no snapshot exists.
- Event log gets one entry per `recordDrill` call.

`tests/unit/backup-restore-drill.test.ts` (extend or create):

- Update existing assertions to expect `OpsResult[]`.
- Add a test that confirms `recordDrill` is called at end of
  run.

`tests/unit/doctor.test.ts`:

- Add fixture cases for fresh-drill and stale-drill states.

`tests/unit/launch-blockers.test.ts`:

- Add the soft-warn case for missing/stale drill.

### Validation

- `bun run format:check`
- `bun run check`
- `bun run test`
- `bun run backup:restore:drill` — runs against the local stack
  (or skips cleanly if no DB is available) and writes the
  channel.
- `cat ~/.local/state/<project>/ops/restore-drill.json | jq` —
  verify shape after a run.
- `systemd-analyze verify deploy/systemd/restore-drill.timer
deploy/systemd/restore-drill.service` — verify the timer/unit
  files are syntactically valid (the codex deliverable should
  paste the output even if the host doesn't have the units
  installed, since `verify` works on file paths).

## Out of scope

Each item is binding.

- **Backup channel (`backup.json`).** The existing backup
  scripts could write to a `backup.json` channel for symmetry,
  but that's a separate slice. Do not extend backup scripts in
  this pass.
- **Notifications on drill failure** (email, Slack, webhook).
  The exit code + ledger evidence is enough for v1; pass 09
  (`health:live`) will surface drill staleness in the live
  surface.
- **Auto-remediation on drill failure** (e.g. re-running
  backups, paging on-call). YAGNI.
- **Modifying the drill's logic itself** beyond the retrofit.
  The drill's existing PITR validation steps remain unchanged;
  only the result shape and ledger persistence are added.
- **Printer normalization across all CLIs.** The pass 02
  printer is not yet adopted by every script (e.g.
  `deploy-smoke.ts` post-pass-07 still renders OK/SKIP labels in
  some paths). This pass uses `printOpsResults` for
  `backup-restore-drill.ts` but does **not** chase down other
  legacy renderings. A small "printer normalization" pass can
  follow at any point.
- **Cross-host drill coordination** (e.g. drilling against a
  shared backup pool from multiple sites). Each site drills
  itself.

## Deliverable

Return:

- Summary of changed files (paths only).
- Exact commands run and pass/fail status.
- Sample stdout from `bun run backup:restore:drill` showing the
  retrofitted output.
- Sample contents of `restore-drill.json` after a run (paste
  full JSON for one fixture run).
- Output of `systemd-analyze verify` for the new unit + timer.
- Confirmation that the standalone CLI (`bun run
backup:restore:drill`) renders via `printOpsResults` and not
  the legacy OK/SKIP/FAIL helpers.
- Confirmation that no secrets from drill steps appear in the
  channel snapshot or events log (test assertion).
- Recommendation: "Pass 09 (`health:live` ledger view) is the
  next slice." If anything found should reorder, name it.

## Codex prompt

You are implementing pass 08 of the `tmpl-svelte-app` reliability
roadmap. The full scope, file list, and validation rules are
above. There is no new ADR; the channel pattern is locked by
[ADR-025](../adrs/ADR-025-ops-status-ledger.md).

Read these first, in order, before writing any code:

1. This file (`docs/planning/passes/08-restore-drill-scheduling.md`)
2. `docs/planning/adrs/ADR-025-ops-status-ledger.md`
3. `scripts/backup-restore-drill.ts` (the legacy script being
   retrofitted)
4. `scripts/lib/release-state.ts` and
   `tests/unit/release-state.test.ts` (precedent for a typed
   channel wrapper)
5. `scripts/lib/ops-status.ts` and tests
6. `scripts/lib/ops-result.ts` and tests
7. `scripts/doctor.ts` (post-pass-02 retrofit pattern)
8. `scripts/lib/launch-blockers.ts`
9. `scripts/lib/protected-files.ts` (pass 04 pattern for
   protecting deploy artifacts)
10. `scripts/lib/site-project.ts` (pass 04 / earlier — confirm
    whether systemd unit files get project-slug rewriting; mirror
    for the new units)
11. `deploy/systemd/backup.service`,
    `deploy/systemd/backup.timer`,
    `deploy/systemd/backup-base.service`,
    `deploy/systemd/backup-base.timer` (pattern reference)
12. `docs/operations/restore.md` (cross-link target)

Then implement the **Scope** section above and **only** that.
The **Out of scope** section is binding — do not add a backup
channel, do not add notifications, do not normalize the printer
across other scripts in this pass.

When done, run the validation commands and return the deliverable
in the exact shape requested.
