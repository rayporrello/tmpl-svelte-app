# Pass 03 — Ops-status ledger + release state + Quadlet helpers

## Goal

Build three substrate libraries that pass 04 (rollback CLI) and pass
05 (`deploy:apply`) will consume:

1. A generic ops-status ledger primitive (channel files + events
   NDJSON, atomic writes, locking).
2. A typed `release-state` wrapper for the `releases.json` channel.
3. A Quadlet `Image=` parser/replacer for safe rollback tag
   manipulation.

All three ship with tests. **No CLI consumer is added in this pass.**
The libs sit dormant until pass 04 reads them and pass 05 writes
them.

## Pre-conditions

- Passes 01 and 02 have merged.
- [ADR-025](../adrs/ADR-025-ops-status-ledger.md) is the binding
  design for the ledger.
- Audit found no existing ops-status / channel state, no existing
  Quadlet helpers.
- `scripts/lib/ops-result.ts` from pass 02 is the precedent for
  shared primitives; the ledger lib should follow the same
  single-source-of-truth pattern.

## Scope

The pass introduces three new lib files, one new doc, and tests. It
does **not** add any CLI, retrofit any script, or stub any channel
beyond `releases.json`.

### New files

#### `scripts/lib/ops-status.ts`

Generic channel + event-log primitive. Exports:

- `resolveStateDir(opts?: { projectSlug?: string }): string` — returns
  `OPS_STATE_DIR` if set, else `~/.local/state/<project>/ops/` where
  `<project>` is read from `site.project.json`. Creates the dir on
  first call if missing.
- `readChannel<T>(channel: string): T | null` — reads
  `<channel>.json`; returns `null` if missing or unparseable (caller
  decides what to do with `null`). Does not throw on missing.
- `writeChannel<T>(channel: string, value: T): void` — atomic write
  via `<channel>.json.tmp` + `rename`. Acquires `<channel>.lock`
  with retry/backoff before writing.
- `appendEvent(event: object): void` — append one NDJSON line to
  `events.ndjson`. Uses `O_APPEND`. Rotates at 10MB; keeps two
  rotated copies (`events.ndjson.1`, `events.ndjson.2`).
- `readEvents(opts?: { limit?: number; channel?: string; since?: Date }): AsyncIterable<object>` —
  stream events, newest first.
- `isStale(channel: string, now?: Date): boolean` — reads channel,
  checks `last_success_at` against `stale_after_seconds`. Returns
  `true` if no successful run on record.

Errors are `OpsResult`-shaped where they need to be reported by a
calling script; otherwise they throw. The `ops-result` module from
pass 02 may be imported.

#### `scripts/lib/release-state.ts`

Typed wrapper over the `releases.json` channel.

- `Release` type:
  ```ts
  export interface Release {
  	id: string; // human-readable, writer-chosen (e.g. timestamp)
  	sha: string; // git sha of the deployed code
  	image: string; // Quadlet image ref, e.g. ghcr.io/.../web:sha-abc123
  	deployedAt: string; // ISO 8601
  	migrations: string[]; // ordered Drizzle migration filenames included
  	migrationSafety: 'rollback-safe' | 'rollback-blocked';
  }
  ```
- `recordRelease(r: Release): void` — appends to history; updates
  `releases.json` snapshot. Also calls `appendEvent` with the
  release.
- `listReleases(opts?: { limit?: number }): Release[]` — newest
  first.
- `getCurrentRelease(): Release | null` — most recent release.
- `getPreviousRollbackSafeRelease(): Release | null` — most recent
  release before the current one whose `migrationSafety` is
  `rollback-safe`. **Returns null when no safe target exists** —
  caller (pass 04 rollback) decides to refuse in that case.

Pass 03 does **not** decide how `migrationSafety` is computed. The
test fixtures supply fixed values. Pass 04 or pass 05 will define
the computation rule (per ADR-024 and the structural critique:
default `rollback-blocked`, opt-in to `rollback-safe`, computed at
build time from migrations included since the prior release).

#### `scripts/lib/quadlet-image.ts`

Parser/replacer for the `Image=` line in Quadlet `.container` files.

- `parseQuadletImage(path: string): { imageRef: string; lineNumber: number; raw: string }` —
  reads the file, locates the single `Image=` line under
  `[Container]`. Errors clearly when:
  - the file has no `[Container]` section,
  - there is no `Image=` line,
  - there are multiple `Image=` lines (ambiguous).
- `replaceQuadletImage(path: string, newRef: string, opts?: { dryRun?: boolean }): { changed: boolean; oldRef: string }` —
  atomic update (tmp + rename), preserves blank lines, comments, and
  ordering. `dryRun: true` returns what would change without
  writing.

### New doc

`docs/operations/ops-status-ledger.md` — operator-facing description
of the ledger contract: state dir resolution, channel files, atomic
writes, NDJSON, rotation. References ADR-025 as the design source.

### Updated doc

`docs/documentation-map.md` — add references to the new doc and
ADR-025.

### Tests

Each lib gets its own test file under `tests/unit/`. All tests use
`OPS_STATE_DIR` redirected to a temp dir; **no writes outside the
temp dir**.

- `tests/unit/ops-status.test.ts`:
  - round-trip: write a channel, read it back.
  - atomic write: simulate interrupted write (writing tmp then
    crashing before rename) — channel file remains intact.
  - concurrent-writer lock: two simultaneous writes serialize; both
    succeed; final value is one of the two (no torn writes).
  - NDJSON rotation: write past 10MB, verify rotation to
    `events.ndjson.1`, then `.2`, third rotation deletes oldest.
  - `isStale`: returns true when `last_success_at` is older than
    `stale_after_seconds`; returns true when channel doesn't exist.
- `tests/unit/release-state.test.ts`:
  - `recordRelease` writes both snapshot and event.
  - `listReleases` returns newest first, respects limit.
  - `getCurrentRelease` returns null on empty history.
  - `getPreviousRollbackSafeRelease` skips `rollback-blocked`
    entries.
  - `getPreviousRollbackSafeRelease` returns null when no safe
    target exists.
- `tests/unit/quadlet-image.test.ts`:
  - parse single `Image=` ref.
  - reject ambiguous: multiple `Image=` lines → error.
  - reject missing `[Container]` section → error.
  - reject missing `Image=` line → error.
  - replace preserves blank lines, comments, line ordering.
  - `dryRun: true` does not write to disk.

## Out of scope

Each item is binding. Do not pull any of it into this pass.

- Any CLI consumer of the libs. Pass 04 (rollback) is the first
  reader. Pass 05 (`deploy:apply`) is the first writer.
- Channels other than `releases.json`. No stubs for `smoke.json`,
  `restore-drill.json`, `backup.json`, `migration.json`. Each
  arrives in its owning pass.
- The computation rule for `migrationSafety`. Pass 03 only declares
  the field. Pass 04 or pass 05 decides the rule.
- Retrofitting `scripts/check-launch.ts`,
  `scripts/deploy-preflight.ts`, `scripts/deploy-smoke.ts`,
  `scripts/backup-restore-drill.ts`, or `scripts/check-init-site.ts`.
  Each retrofits in its owning pass.
- Rollback CLI, `deploy:apply`, restore-drill scheduling,
  `health:live`, fleet manifest.
- Cross-host replication or backup of the ledger itself (per
  ADR-025).

## Validation

- `bun run format:check`
- `bun run check`
- `bun run test`

The new test files must pass and existing tests must not regress.
There is no CLI consumer in this pass, so there is nothing to
manually exercise via `bun run`.

## Deliverable

Return:

- Summary of changed files (paths only).
- Exact commands run and pass/fail status.
- Public API exported from each new lib (function signatures).
- Confirmation that no script, route, or other consumer was modified
  outside the pass scope.
- Recommendation: "Pass 04 (Rollback CLI) is the next slice." If
  anything found should reorder, name it and explain.

## Codex prompt

You are implementing pass 03 of the `tmpl-svelte-app` reliability
roadmap. The binding design for the ledger is
[ADR-025](../adrs/ADR-025-ops-status-ledger.md). The full scope, file
list, and validation rules are above in this document.

Read these first, in order, before writing any code:

1. This file (`docs/planning/passes/03-ops-ledger-and-quadlet.md`)
2. `docs/planning/adrs/ADR-025-ops-status-ledger.md`
3. `docs/planning/adrs/ADR-024-lead-gen-website-appliance.md`
4. `scripts/lib/ops-result.ts` and
   `tests/unit/ops-result.test.ts` (pass 02 precedent for shared
   primitives + tests)
5. `site.project.json` (confirm where `<project>` slug comes from)
6. `deploy/quadlets/*.container` (confirm Quadlet file shape)

Then implement the **Scope** section above and **only** that. The
**Out of scope** section is binding — do not add any CLI consumer,
do not stub other channels, do not retrofit existing scripts, do not
decide the `migrationSafety` computation rule.

When done, run the validation commands and return the deliverable in
the exact shape requested.
