# ADR-028: `deploy:apply` orchestration semantics

- Status: Accepted
- Date: 2026-05-06
- Related: ADR-024 (lead-gen appliance), ADR-025 (ops-status
  ledger), ADR-027 (bundle excludes n8n).

## Context

Passes 02–05 built the substrate for a deploy orchestrator without
actually shipping one. The current operator workflow is:

1. Push image to `ghcr.io/...:<sha>`.
2. SSH to host.
3. `git pull` the per-host repo.
4. Edit `Image=` lines in `deploy/quadlets/*.container` by hand.
5. `bun run db:migrate` (or whatever the existing migration command
   is).
6. `systemctl --user daemon-reload && systemctl --user restart web.service worker.service`.
7. Run `bun run deploy:smoke` and read the output.
8. Hope it worked. No release record exists.

Each step is small; the sequence is error-prone. Forgetting step 5
breaks the app. Forgetting step 7 hides bad deploys. No release
record means rollback (pass 05) has nothing to read.

Two structural decisions have to be made before `deploy:apply` can
ship:

1. **Migration safety classification.** Pass 03 declared
   `Release.migrationSafety: 'rollback-safe' | 'rollback-blocked'`.
   Pass 05 reads it. Nothing writes it yet. Who decides, and how?
2. **Execution model.** Rollback (pass 05) prints `systemctl`
   commands rather than executing them. Should `deploy:apply` do
   the same, or execute?

## Decision

### Migration safety: operator-declared via `--safety` flag

`deploy:apply` requires `--safety=rollback-safe|rollback-blocked`
on every invocation. There is no default — the operator must
type one of the two values explicitly so neither is the
unconscious choice.

The classification rule is: a release is `rollback-safe` if the
_previous_ image (the one currently deployed) can run correctly
against the post-migration schema. In practice that means the
release's migrations are **expand-only**:

- Add column nullable, or with a default.
- Add table.
- Add index (concurrently if the platform supports it).
- Add view, function, type.

Anything else (DROP COLUMN, NOT NULL on existing column without
default, type narrowing, RENAME, destructive CHECK constraint) is
`rollback-blocked` because the previous image will fail when it
hits the changed schema.

The operator is the source of truth for this classification
because:

- The operator already reviews migrations as part of normal
  workflow (writing or merging the SQL).
- Automated classification requires parsing arbitrary SQL for
  destructive operations, which is brittle and adds dependency
  surface (a SQL parser, a ruleset, edge cases for raw SQL).
- Getting the flag wrong is recoverable: claiming `rollback-safe`
  on a release that isn't will cause rollback to fail at runtime
  (the previous image starts but errors against the new schema),
  at which point the operator rolls forward instead.
- A solo-operator template should not pre-build CI infrastructure
  for a workflow the operator can do in their head in five
  seconds.

If the operator-flag pattern proves insufficient (e.g., as
operator load grows or as classifications get missed), CI auto-
classification can be added by reading the migration files and
applying the rules above. The contract for `migrationSafety` is
fixed by pass 03; the _source_ of the value is the only thing
that would change.

### Execution model: `deploy:apply` executes; rollback prints

`deploy:apply` executes `systemctl` and migrations directly. It
does not print commands and exit. Rationale:

- Orchestration's value is automating the full sequence. If
  `deploy:apply` printed instead of executed, the operator would
  copy-paste each step and lose the single-command property —
  which is the only reason to have an orchestrator.
- Smoke verification is part of the orchestration. Printing
  commands and exiting before smoke means smoke is the operator's
  responsibility, again reverting to manual.
- Recording the release in the ledger requires post-deploy state
  (which Quadlets actually got which images, when restart
  succeeded, smoke result). Only an executing orchestrator has
  that state.

Rollback (pass 05) prints commands rather than executing because
its decision is small and human-paced: the operator chooses when
to rollback, often after reviewing the plan and the systemctl
units involved. Rollback is rarely the orchestrated step in a
larger sequence.

This asymmetry is intentional. It will be documented in
`docs/operations/deploy-apply.md` and
`docs/operations/rollback.md` so operators understand which CLI
takes which action.

### Smoke-failure handling: print, don't auto-rollback

If smoke fails after `deploy:apply` restarts the units, the CLI:

1. Emits a `fail` OpsResult naming the failed smoke check.
2. Prints the exact `bun run rollback --to previous` command to
   run if the previous release was `rollback-safe`, or
   `bun run rollback --status` to inspect if it was
   `rollback-blocked`.
3. Exits non-zero.

The CLI does **not** automatically invoke rollback. Auto-rollback
is deferred because:

- The first iteration of `deploy:apply` is operator-attended.
  Smoke failure with operator present means the operator decides.
- Auto-rollback adds a second execution path that has to be
  tested, documented, and reasoned about for every smoke failure
  mode (real bad deploy vs. flaky smoke vs. transient downstream
  outage). YAGNI.
- When `deploy:apply` becomes scheduled/unattended (a future
  iteration), auto-rollback can be added behind an opt-in flag.
  Until then, manual is sufficient.

### Release recording: at restart, not at smoke

`deploy:apply` records the release in the ledger **as soon as
units restart**, before running smoke. The smoke result is logged
as a separate `events.ndjson` entry referencing the release.

Rationale:

- The ledger represents _what is currently deployed_. After
  restart succeeds, the new image is what's running, regardless of
  whether smoke passes. The ledger should reflect that.
- A failed smoke does not mean the deploy didn't happen — it means
  the deploy is unhealthy. Recording the release lets rollback
  target a real prior state and lets the operator see what
  changed.
- Splitting "deploy state" from "deploy health" matches the
  channel/event model of ADR-025: `releases.json` snapshot is
  state, `events.ndjson` is history.

## Alternatives considered

- **CI auto-classifies migration safety from the SQL.** Rejected
  for v1: brittle, requires SQL parser + rules engine, and
  operator review is already part of the workflow.
- **`--safety=rollback-blocked` as the default.** Rejected:
  defaults make operators stop thinking. Forcing the explicit flag
  every time (no default) means the classification is a conscious
  decision, not a typo.
- **Plan/apply split** (`deploy:apply --plan` then
  `deploy:apply --execute`). Rejected: mirrors Terraform's UX
  unnecessarily for a simpler problem; one round-trip is enough
  for a deploy whose preflight has already been run separately
  via `bun run deploy:preflight`.
- **Auto-rollback on smoke failure.** Deferred (not rejected).
  Will land behind an opt-in flag when `deploy:apply` runs
  unattended.
- **Record release after smoke passes.** Rejected: leaves a window
  where the host runs an unrecorded image, and rollback would
  need to reconcile against actual systemd state instead of the
  ledger.

## Consequences

- `deploy:apply` is the only CLI in the template that executes
  `systemctl`. Operator-facing docs make this asymmetry explicit.
- The `--safety` flag is mandatory; running `deploy:apply` without
  it is an error with a remediation pointing at this ADR.
- Smoke failure leaves a recorded release in the ledger marked
  via an event entry as `smoke_status: 'fail'`. Rollback CLI
  refuses or proceeds based on the recorded `migrationSafety`,
  same as before.
- `scripts/deploy-preflight.ts` and `scripts/deploy-smoke.ts` are
  retrofitted to emit `OpsResult[]` per pass 02's deferred-retrofit
  rule; both remain runnable as standalone CLIs.
- A future pass adds auto-rollback behind a flag once the
  unattended-deploy use case appears.

## Out of scope

- **Build-time / CI migration classification.** Deferred per the
  decision above.
- **Plan/apply split.** Not needed for this template.
- **Auto-rollback.** Deferred.
- **Scheduled/unattended deploy mode.** Out of scope; `deploy:apply`
  is operator-invoked.
- **Multi-host fleet rollout.** Out of scope; this template is
  per-host.
