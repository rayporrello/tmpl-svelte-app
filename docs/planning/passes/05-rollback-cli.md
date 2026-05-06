# Pass 05 — Rollback CLI

## Goal

Build a rollback CLI that reads release-state from the ops-status
ledger, refuses safely when no rollback-safe target exists, and
prints the exact `systemctl` commands for the operator to run. The
CLI does **not** execute `systemctl` — that remains an explicit
operator step. Migrations are never reversed.

This is the first consumer of the substrate from passes 02, 03, and
04 (`OpsResult`, `release-state`, `quadlet-image`, Quadlet
constants) and proves the substrate works end-to-end on a real CLI.

## Pre-conditions

- Passes 01, 02, 03, and 04 have merged.
- `scripts/lib/release-state.ts` (pass 03) exposes
  `getCurrentRelease` and `getPreviousRollbackSafeRelease`.
- `scripts/lib/quadlet-image.ts` (pass 03) exposes
  `parseQuadletImage` and `replaceQuadletImage`.
- `scripts/lib/quadlets.ts` (pass 04) exposes `ROLLBACK_QUADLETS`
  — the canonical subset of Quadlet filenames that participate in
  image rollback. Per ADR-027, this is `['web.container', 'worker.container']`.
- `scripts/lib/ops-result.ts` (pass 02) provides `OpsResult` and
  the pretty printer.
- `scripts/lib/ops-status.ts` (pass 03) provides `appendEvent`.
- `docs/deployment/runbook.md` references "Rollback by SHA" —
  superseded by this pass.

## Background — load-bearing semantics

These rules come from the structural critique that motivated this
roadmap. They are restated here because they constrain what the CLI
can and cannot do.

- **Rollback never reverses migrations.** Rollback only changes the
  image tag in declared Quadlet files. The previous image is
  expected to run against the **post-migration** schema — that is
  the entire meaning of `migrationSafety: 'rollback-safe'`.
- **Safety class lives on the release, not on individual
  migrations.** A release can include zero or many migrations; the
  classification is a property of the whole release.
- **Rollback target is restricted to the immediate previous
  rollback-safe release.** Not arbitrary SHAs. The CLI exposes only
  `--to previous`. Sites that need to skip multiple releases use
  PITR restore, not rollback.
- **Quadlet path set is the constants module from pass 04.** Per
  ADR-027 the bundle is locked at three Quadlets and rollback
  touches two of them (`web.container`, `worker.container`).
  No per-site variation today; the constants module is the source
  of truth.
- **The rule for what makes a release rollback-safe is not decided
  in this pass.** Pass 05 only reads the field. Pass 06
  (`deploy:apply`) — or whichever pass adds build-time release
  tagging — defines the computation. Default per ADR-024 is
  `rollback-blocked`; opt-in to `rollback-safe`.

## Scope

### New files

#### `scripts/rollback.ts`

CLI entrypoint. Argument parsing only; delegates all logic to
`rollback-engine.ts`.

Supported invocations:

- `bun run rollback --status` — print current release and the most
  recent rollback-safe candidate, no action taken. Exit 0 even if
  ledger is empty.
- `bun run rollback --to previous --dry-run` — compute and print
  the plan; do not write Quadlet files; do not record an event.
  Exit 0 if a plan exists, exit 1 if no rollback-safe target.
- `bun run rollback --to previous` — execute the plan: rewrite
  Quadlet `Image=` lines via `replaceQuadletImage`, append an event
  to the ledger, print the exact `systemctl --user daemon-reload`
  and `systemctl --user restart <unit>` commands the operator must
  now run. Exit 0 on success, 1 on refusal or error.

Output format: `OpsResult[]` rendered through the pass 02 printer.
Exit codes follow `severityToExitCode` from pass 02 with one
addition: `--status` always exits 0 (informational, never a build
failure).

#### `scripts/lib/rollback-engine.ts`

Pure logic, separated from the CLI for testability.

```ts
export interface RollbackPlan {
	current: Release;
	target: Release;
	quadletUpdates: Array<{
		path: string; // e.g. 'deploy/quadlets/web.container'
		oldImage: string;
		newImage: string;
		unitName: string; // e.g. 'web.service'
	}>;
}

export function planRollback(opts?: { deployQuadletsDir?: string }): {
	plan: RollbackPlan | null;
	results: OpsResult[]; // refusal reasons or plan summary
};

export function applyRollback(plan: RollbackPlan, opts?: { dryRun?: boolean }): OpsResult[];
```

Rules in `planRollback`:

- Read current release. If none → fail OpsResult, plan null.
- Read previous rollback-safe release. If none → fail OpsResult
  with explicit reason (`"previous release marked rollback-blocked"`
  vs `"no prior release on record"`). Plan null.
- For each entry in `ROLLBACK_QUADLETS` (from
  `scripts/lib/quadlets.ts`):
  - Construct full path:
    `<deployQuadletsDir>/<entry>` (default `deploy/quadlets/<entry>`).
  - Parse current `Image=` via `parseQuadletImage`.
  - New image is target release's `image` field.
  - Unit name is `<basename-without-extension>.service` (e.g.
    `web.container` → `web.service`).
- Return plan + an info-severity OpsResult summarizing the plan.

Rules in `applyRollback`:

- For each `quadletUpdates` entry, call `replaceQuadletImage` with
  `{ dryRun: opts?.dryRun }`.
- If not dry-run: append a `rollback` event to the ledger via
  `appendEvent`, capturing `from_release`, `to_release`,
  `quadlet_paths`, `actor` (`process.env.USER` or `unknown`),
  `timestamp`.
- Always emit a final OpsResult with the systemctl commands the
  operator must run, as `remediation` entries (so the printer
  renders them as a copy-pasteable list). The unit list comes
  from `quadletUpdates`.

#### `tests/unit/rollback-engine.test.ts`

Use temp dir + `OPS_STATE_DIR` redirect (same pattern as pass 03
tests). Each test seeds the ledger and Quadlet fixtures as needed.

- `planRollback` with empty ledger → refusal OpsResult, plan null.
- `planRollback` with current but no prior → refusal with "no prior
  release on record" reason.
- `planRollback` with current + rollback-blocked prior → refusal
  with "previous release marked rollback-blocked" reason.
- `planRollback` with current + rollback-safe prior → plan
  populated; `quadletUpdates` has two entries (web and worker per
  `ROLLBACK_QUADLETS`) with correct old/new images and unit names.
- `applyRollback` dry-run → no Quadlet writes (verify by re-parsing
  the fixture file), no event appended.
- `applyRollback` live → Quadlet `Image=` lines updated to target
  image, one rollback event in `events.ndjson` with the expected
  fields.

#### `docs/operations/rollback.md`

Operator-facing runbook. Sections:

- When to roll back vs when to roll forward vs when to PITR.
- The CLI commands and what each does.
- Why rollback never reverses migrations.
- What to do if `--to previous` refuses.
- Cross-link to `docs/deployment/runbook.md`, ADR-024, ADR-025,
  ADR-027.

### Modified files

`package.json`:

- Add `"rollback": "bun run scripts/rollback.ts"` to scripts.

`docs/deployment/runbook.md`:

- Replace the "Rollback by SHA" section with a pointer to
  `bun run rollback --to previous` and a reference to
  `docs/operations/rollback.md`.
- Keep a brief manual fallback subsection for emergencies (image
  ref edit by hand + systemctl restart) — clearly labeled as the
  fallback path.

`docs/documentation-map.md`:

- Add `docs/operations/rollback.md` reference.

## Out of scope

Each item is binding.

- `deploy:apply` orchestrator — pass 06.
- The rule for computing `migrationSafety` (i.e. the build-time
  classifier) — pass 06 or later.
- Executing `systemctl` from the CLI. The CLI prints commands; the
  operator runs them.
- Arbitrary-id rollback targets (`--to <release-id>` or
  `--to <sha>`). Only `--to previous` ships in this pass.
- Reversing DB migrations.
- Retrofitting `scripts/deploy-preflight.ts` or
  `scripts/deploy-smoke.ts` to `OpsResult` — those land alongside
  pass 06 (`deploy:apply`).
- Modifying the Quadlet constants. Pass 04 owns
  `scripts/lib/quadlets.ts`; pass 05 only reads.

## Validation

- `bun run format:check`
- `bun run check`
- `bun run test`
- `bun run rollback --status` against an empty ledger — should run
  cleanly and print "no releases on record" as info. Exit 0.
- `bun run rollback --to previous --dry-run` against an empty
  ledger — should refuse cleanly with explanation. Exit 1.
- Test-seeded scenario (covered by `rollback-engine.test.ts`):
  current release + rollback-safe prior → dry-run prints plan;
  live run updates fixture Quadlet files and appends event.

## Deliverable

Return:

- Summary of changed files (paths only).
- Exact commands run and pass/fail status.
- Sample stdout from `bun run rollback --status` against an empty
  ledger.
- Sample stdout from `bun run rollback --to previous --dry-run`
  against the seeded test scenario (paste the full output for one
  rendering — it should include the systemctl commands as
  remediation entries).
- Confirmation that `replaceQuadletImage` is the only path that
  wrote to `deploy/quadlets/`.
- Confirmation that `ROLLBACK_QUADLETS` was imported from
  `scripts/lib/quadlets.ts` rather than redeclared inline.
- Recommendation: "Pass 06 (`deploy:apply` orchestrator) is the
  next slice." If anything found should reorder, name it.

## Codex prompt

You are implementing pass 05 of the `tmpl-svelte-app` reliability
roadmap. The full scope, file list, and validation rules are above
in this document.

Read these first, in order, before writing any code:

1. This file (`docs/planning/passes/05-rollback-cli.md`)
2. `docs/planning/adrs/ADR-024-lead-gen-website-appliance.md`
3. `docs/planning/adrs/ADR-025-ops-status-ledger.md`
4. `docs/planning/adrs/ADR-027-lead-gen-bundle-excludes-n8n.md`
5. `scripts/lib/ops-result.ts` and `tests/unit/ops-result.test.ts`
6. `scripts/lib/release-state.ts` and `tests/unit/release-state.test.ts`
7. `scripts/lib/quadlet-image.ts` and `tests/unit/quadlet-image.test.ts`
8. `scripts/lib/ops-status.ts` and `tests/unit/ops-status.test.ts`
9. `scripts/lib/quadlets.ts` and `tests/unit/quadlets.test.ts`
10. `scripts/doctor.ts` (for the OpsResult-emitting CLI pattern from
    pass 02 — match its style for argument parsing and printer use)
11. `deploy/quadlets/web.container`,
    `deploy/quadlets/worker.container`
12. `docs/deployment/runbook.md` (section to be superseded)

Then implement the **Scope** section above and **only** that. The
**Out of scope** section is binding — do not execute systemctl, do
not implement `deploy:apply`, do not retrofit other scripts, do not
add arbitrary-id targeting, do not modify the Quadlet constants.

When done, run the validation commands and return the deliverable
in the exact shape requested.
