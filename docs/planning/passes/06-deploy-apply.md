# Pass 06 — `deploy:apply` orchestrator

## Goal

Build the `deploy:apply` CLI that orchestrates the full per-host
deploy sequence: preflight → DB migrations → Quadlet image rewrite
→ `systemctl` restart → readiness wait → smoke → record release.
Retrofit `scripts/deploy-preflight.ts` and `scripts/deploy-smoke.ts`
to `OpsResult` (the deferred retrofit from pass 02). Migration
safety is operator-declared via `--safety` flag per
[ADR-028](../adrs/ADR-028-deploy-apply-semantics.md).

This is the first CLI in the template that executes `systemctl` and
runs migrations directly. The execution-vs-print asymmetry with
rollback (pass 05) is intentional and documented.

## Pre-conditions

- Passes 01–05 merged.
- ADR-028 binding.
- `scripts/lib/release-state.ts` (pass 03) exposes
  `recordRelease`. The `Release.migrationSafety` field accepts the
  `--safety` flag value.
- `scripts/lib/quadlets.ts` (pass 04) exposes `ALL_QUADLETS`.
- `scripts/lib/quadlet-image.ts` (pass 03) exposes
  `replaceQuadletImage`.
- `scripts/lib/rollback-engine.ts` (pass 05) exposes
  `planRollback` (read-only here; `deploy:apply` does not invoke
  rollback automatically — see ADR-028).
- `scripts/lib/ops-result.ts` (pass 02) provides the result shape
  and printer.
- `scripts/lib/ops-status.ts` (pass 03) provides `appendEvent`.
- Existing `scripts/deploy-preflight.ts` and
  `scripts/deploy-smoke.ts` still emit their legacy result types
  (`DeployPreflightResult`, `DeploySmokeResult`); this pass
  retrofits them.
- The repo has an existing migration command. Pass 06 invokes it;
  this pass does not redesign it. Read `package.json` `db:*`
  scripts to confirm which.

## Scope

The pass adds the orchestrator, retrofits two existing scripts,
and adds an operator-facing runbook. It does **not** add
auto-rollback, plan/apply split, CI integration, or build-time
migration classification.

### New files

#### `scripts/deploy-apply.ts`

CLI entrypoint. Argument parsing only; delegates all logic to
`deploy-engine.ts`.

Required flags:

- `--image=<full Quadlet image ref>` — e.g.
  `ghcr.io/owner/repo:sha-abc123`.
- `--sha=<git sha>` — git commit sha being deployed.
- `--safety=rollback-safe|rollback-blocked` — operator-declared
  per ADR-028. **No default.** Missing flag is a `fail`
  OpsResult with remediation pointing at ADR-028.

Optional flags:

- `--dry-run` — compute the plan, exercise preflight, but do not
  execute migrations, do not rewrite Quadlets, do not invoke
  `systemctl`, do not append events.
- `--no-color` — disable color in output (mirrors `doctor`'s
  flag).

Output: `OpsResult[]` rendered through the pass 02 printer. Exit
codes follow `severityToExitCode`.

#### `scripts/lib/deploy-engine.ts`

Pure logic, separated from the CLI for testability.

```ts
export interface DeployPlan {
	image: string;
	sha: string;
	migrationSafety: 'rollback-safe' | 'rollback-blocked';
	quadletUpdates: Array<{
		path: string; // e.g. 'deploy/quadlets/web.container'
		oldImage: string;
		newImage: string;
		unitName: string; // e.g. 'web.service'
	}>;
	migrationsToRun: string[]; // ordered Drizzle filenames since prior release
}

export function planDeploy(opts: {
	image: string;
	sha: string;
	migrationSafety: 'rollback-safe' | 'rollback-blocked';
	deployQuadletsDir?: string;
}): { plan: DeployPlan | null; results: OpsResult[] };

export function applyDeploy(plan: DeployPlan, opts?: { dryRun?: boolean }): Promise<OpsResult[]>;
```

`planDeploy`:

- Validate `--image` is a parseable image ref (`name:tag@digest?`
  shape).
- Validate `--sha` is non-empty (no further validation; trust the
  operator).
- Run preflight (delegates to retrofitted
  `scripts/deploy-preflight.ts`'s exported function). If preflight
  emits any `fail`, return `plan: null` plus the preflight
  results.
- For each entry in `ALL_QUADLETS` (pass 04):
  - Parse current `Image=` via `parseQuadletImage`.
  - Build `quadletUpdates` entry. Unit name is
    `<basename-without-extension>.service`.
- Compute `migrationsToRun`: the set of Drizzle migration
  filenames not already applied (read from
  `drizzle/meta/_journal.json`). This is informational; actual
  migration execution still goes through the project's existing
  migration command.
- Return `plan` + an info-severity OpsResult summarizing it.

`applyDeploy`:

The execution sequence (each step emits at least one OpsResult;
any `fail` aborts the sequence):

1. **Preflight repeat.** Re-run preflight to catch any change
   since `planDeploy`. Abort on `fail`.
2. **Run migrations.** Invoke the project's existing migration
   command (`bun run db:migrate` or whatever the package.json
   exposes — read it; do not invent a new command). On
   non-zero exit, emit a `fail` OpsResult and abort. Migrations
   that have already been applied are no-ops; this is the
   project's existing semantics.
3. **Rewrite Quadlets.** For each `quadletUpdates`, call
   `replaceQuadletImage` with `{ dryRun: opts?.dryRun }`. On
   first failure, abort and emit a `fail`. Do not proceed to
   `systemctl`.
4. **`systemctl --user daemon-reload`.** Skip if `dryRun`. On
   failure, emit `fail` and abort.
5. **`systemctl --user restart <units>`.** One restart command
   per `quadletUpdates` entry. Skip if `dryRun`. On failure,
   emit `fail` and abort.
6. **Wait for readiness.** Poll `http://127.0.0.1:<port>/readyz`
   until 200 or 60s timeout. Skip if `dryRun`. On timeout, emit
   `fail`. The port and host come from `site.project.json` or
   environment (read what's already there; do not invent).
7. **Record release.** Call `recordRelease(...)` with the plan's
   image, sha, deployedAt (now), migrations from
   `plan.migrationsToRun`, and the `migrationSafety` flag value.
   Skip if `dryRun`. Append a `deploy` event with summary fields.
8. **Run smoke.** Delegate to retrofitted
   `scripts/deploy-smoke.ts`'s exported function. Append the
   smoke result as an event referencing the release. Skip if
   `dryRun`.
9. **On smoke fail:** emit a `fail` OpsResult that includes, as
   `remediation` entries, the appropriate next-steps command:
   - If `migrationSafety === 'rollback-safe'`:
     `bun run rollback --to previous`
   - If `migrationSafety === 'rollback-blocked'`:
     `bun run rollback --status` then point operator at PITR
     restore docs.

The release IS recorded even on smoke failure — per ADR-028, the
ledger reflects what's deployed; smoke result is a separate fact.

### Retrofits

#### `scripts/deploy-preflight.ts`

- Replace `DeployPreflightResult[]` return type with
  `OpsResult[]`.
- Map existing fields:
  | Old | New |
  |---|---|
  | `id` | `id` |
  | `label` | `summary` |
  | `detail` | `detail` |
  | `hint` | first entry of `remediation` |
  | `status: pass` | `severity: pass` |
  | `status: fail` | `severity: fail` |
  | `status: skip` | `severity: info` |
- Standalone CLI invocation (`bun run deploy:preflight`) must
  remain working with stable human output.
- Export the result-emitting function (not just the CLI) so
  `deploy-engine.ts` can call it without spawning a subprocess.

#### `scripts/deploy-smoke.ts`

- Same retrofit pattern as preflight.
- Map existing fields likewise.
- Export the result-emitting function for `deploy-engine.ts`.

### Modified files

`package.json`:

- Add `"deploy:apply": "bun run scripts/deploy-apply.ts"` to
  scripts.
- Confirm `deploy:preflight` and `deploy:smoke` script entries
  still work after retrofit (they should — only the return type
  changed).

`docs/deployment/runbook.md`:

- Replace the manual deploy sequence with a pointer to
  `bun run deploy:apply`. Keep a brief manual fallback subsection
  for emergencies.
- Cross-link `docs/operations/deploy-apply.md`.

`docs/operations/deploy-apply.md` (new):

- Operator-facing runbook.
- Sections:
  - When to run.
  - Required flags and what each means.
  - The `--safety` flag in depth: what makes a release
    rollback-safe (link ADR-028's classification rules).
  - What happens on smoke failure.
  - Why this CLI executes `systemctl` while rollback prints
    (link ADR-028).
  - How to run a deploy in dry-run mode for review.

`docs/documentation-map.md`:

- Add ADR-028 reference and the new
  `docs/operations/deploy-apply.md` reference.

### Tests

`tests/unit/deploy-engine.test.ts` (new):

- `planDeploy` with preflight failure → no plan, `fail` results.
- `planDeploy` success → plan populated; `quadletUpdates` covers
  all `ALL_QUADLETS`; `migrationsToRun` reflects unapplied
  migrations from journal fixture.
- `applyDeploy` dry-run → no Quadlet writes (verify by re-parsing
  fixture), no `systemctl` invocation (verify via test seam — see
  below), no migration execution, no event appended, no release
  recorded.
- `applyDeploy` live success path → Quadlet files updated, fake
  `systemctl` seam called twice (daemon-reload + restart),
  release recorded with the supplied `--safety`, smoke event
  appended with `pass`.
- `applyDeploy` live with smoke failure → release IS recorded,
  smoke event appended with `fail`, final OpsResult includes the
  rollback remediation appropriate to the `migrationSafety`.
- `applyDeploy` live with `systemctl restart` failure → release
  NOT recorded (we didn't get past restart), `fail` OpsResult
  with rollback remediation.
- `applyDeploy` with `--safety=rollback-blocked` and smoke fail →
  remediation is the PITR pointer, not the rollback CLI.

`tests/unit/deploy-preflight.test.ts`:

- Update assertions to match the new `OpsResult[]` shape. Drop
  any reference to `DeployPreflightResult` fields.

`tests/unit/deploy-smoke.test.ts`:

- Same update.

#### Test seam for `systemctl`

`deploy-engine.ts` should accept an injectable runner for shell
commands so tests can substitute a mock:

```ts
export interface DeployRunner {
	exec(
		cmd: string[],
		opts?: { stdin?: string }
	): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}
```

Default runner uses `Bun.spawn`. Tests pass a mock that records
calls and returns canned exit codes.

### Out of scope

Each item is binding.

- **Auto-rollback on smoke failure.** ADR-028 defers this. The
  CLI prints the rollback command instead.
- **Plan/apply split.** Single execute mode per ADR-028.
- **CI integration.** Operator-invoked only.
- **Build-time migration classification.** Operator declares via
  `--safety` per ADR-028.
- **Multi-host fleet rollout.**
- **Modifying the Quadlet constants.** Read-only here.
- **Modifying the rollback engine.** Read-only here.
- **Changing the `db:migrate` command.** Whatever exists is
  invoked as-is.

### Validation

- `bun run format:check`
- `bun run check`
- `bun run test`
- `bun run deploy:preflight` — should run cleanly with the new
  OpsResult output (template-placeholder failures may appear;
  none should reference `DeployPreflightResult` shape).
- `bun run deploy:smoke` — same.
- `bun run deploy:apply --image=ghcr.io/example/site:test --sha=abc123 --safety=rollback-blocked --dry-run --no-color` —
  with a seeded test ledger, should print the plan and a
  dry-run-complete OpsResult. Exit 0 if preflight passes; 1 if it
  doesn't (template-placeholder state may produce 1, that's OK as
  long as the failure is a preflight result, not a code error).
- `bun run deploy:apply` without `--safety` → `fail` with
  remediation pointing at ADR-028. Exit 1.

## Deliverable

Return:

- Summary of changed files (paths only).
- Exact commands run and pass/fail status.
- Sample stdout from `bun run deploy:apply ... --dry-run` against
  the seeded test scenario (paste the full output for one
  rendering — should include the plan summary, `Would update`
  Quadlet entries, dry-run-complete result).
- Sample stdout from `bun run deploy:apply` (without `--safety`)
  showing the missing-flag error.
- Confirmation that `systemctl` is invoked only via the test seam
  in tests, never directly.
- Confirmation that `recordRelease` is called only after restart
  succeeds, and is called even when smoke fails.
- Confirmation that the retrofitted `deploy-preflight.ts` and
  `deploy-smoke.ts` continue to work as standalone CLIs with
  stable human output.
- Recommendation: "Pass 07 (E2E smoke through Postmark sandbox)
  is the next slice." If anything found should reorder, name it.

## Codex prompt

You are implementing pass 06 of the `tmpl-svelte-app` reliability
roadmap. The binding contract is
[ADR-028](../adrs/ADR-028-deploy-apply-semantics.md). The full
scope, file list, and validation rules are above in this
document.

Read these first, in order, before writing any code:

1. This file (`docs/planning/passes/06-deploy-apply.md`)
2. `docs/planning/adrs/ADR-028-deploy-apply-semantics.md`
3. `docs/planning/adrs/ADR-024-lead-gen-website-appliance.md`
4. `docs/planning/adrs/ADR-025-ops-status-ledger.md`
5. `scripts/lib/ops-result.ts` and `tests/unit/ops-result.test.ts`
6. `scripts/lib/release-state.ts`
7. `scripts/lib/quadlets.ts`
8. `scripts/lib/quadlet-image.ts`
9. `scripts/lib/rollback-engine.ts` (pass 05 — read for context;
   `deploy-engine.ts` does not invoke it but produces the
   remediation strings the operator will paste)
10. `scripts/deploy-preflight.ts` and existing tests
11. `scripts/deploy-smoke.ts` and existing tests
12. `package.json` (locate the existing `db:migrate` /
    `db:push` / similar command — invoke whatever exists; do
    NOT introduce a new migration command)
13. `drizzle/meta/_journal.json` (to understand how
    `migrationsToRun` is computed)
14. `site.project.json` (for readiness probe target)
15. `deploy/quadlets/{web,postgres,worker}.container`

Then implement the **Scope** section above and **only** that. The
**Out of scope** section is binding — do not add auto-rollback, do
not split into plan/apply, do not introduce CI hooks, do not
auto-classify migrations.

When done, run the validation commands and return the deliverable
in the exact shape requested.
