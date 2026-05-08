<!-- 2026-05-08: Historical planning note. Shared-infrastructure cleanup supersedes per-site production Postgres/worker/backup/restore assumptions; see docs/planning/adrs/ADR-031-shared-infrastructure-cell.md. -->

# Pass 01 — Lead-gen website appliance contract

## Goal

Codify the default product profile defined in
[ADR-024](../adrs/ADR-024-lead-gen-website-appliance.md) across the
README, docs, env templates, and launch gates so that no part of the
template contradicts another about what a launched lead-gen site
requires.

## Pre-conditions

- `ADR-024-lead-gen-website-appliance.md` exists and is the binding
  contract for this pass.
- No prior implementation pass has merged.
- Prior audit (in conversation thread, summarized below) found:
  - Eight divergent result types live across `scripts/` (handled in
    pass 02, not this pass).
  - Postmark integration exists at
    `src/lib/server/forms/providers/postmark.ts` with no sandbox mode
    and no Postmark-required gate.
  - `scripts/check-launch.ts`, `scripts/deploy-preflight.ts`,
    `.env.example`, `deploy/env.example`, and `secrets.example.yaml`
    all exist but do not converge on a single launch policy.
  - No `CMS_MODE` env exists; do not add one.
  - `/healthz` and `/readyz` exist; do not change them in this pass.

## Scope

The pass touches **documentation, env templates, and launch-gate
logic only**. It does not refactor scripts beyond what is required to
enforce the policy.

### Files expected to change

Documentation:

- `README.md` — add a "Reliability surface" table (rows below);
  align "what runs by default" framing with ADR-024.
- `docs/getting-started.md` — note the default profile.
- `docs/deployment/README.md` — Postmark required for prod, n8n
  optional, console provider not launch-ready in prod.
- `docs/deployment/secrets.md` — table of which secrets are required
  in which environment.
- `docs/automations/README.md` — `AUTOMATION_PROVIDER` values, noop
  is valid, provider-specific secrets are conditional.
- `docs/documentation-map.md` — add ADR-024 reference.

Env templates:

- `.env.example` — annotate required-vs-optional per environment in
  comments. Do not break existing structure.
- `deploy/env.example` — same. Make Postmark-required-in-prod
  visible.
- `secrets.example.yaml` — mark Postmark as required-in-prod, n8n as
  optional.

Launch gate logic:

- `scripts/check-launch.ts` — enforce ADR-024:
  - Postmark token + from/to addresses (use whatever the current
    var names are; do not rename) required for production launch
    unless `LAUNCH_ALLOW_CONSOLE_EMAIL=1` is explicitly set.
  - `AUTOMATION_PROVIDER` unset or `noop`: pass.
  - `AUTOMATION_PROVIDER=n8n`: n8n webhook vars required.
  - `AUTOMATION_PROVIDER=webhook`: webhook vars required.
  - Worker readiness must remain required regardless of provider.
- `scripts/deploy-preflight.ts` — same checks, in the deploy
  context. Keep the existing `DeployPreflightResult` shape; do not
  refactor to OpsResult here (pass 02).

If `AUTOMATION_PROVIDER` is currently read inconsistently
(`process.env` directly vs. through a config helper), reconcile to
the helper path, but only if the change is small and contained
within these two scripts. Larger reconciliation defers.

Tests:

- `tests/unit/` — new or updated tests covering:
  - Production launch with no Postmark token → blocker.
  - Production launch with `LAUNCH_ALLOW_CONSOLE_EMAIL=1` and no
    Postmark → passes (with a warning surfaced).
  - `AUTOMATION_PROVIDER=noop` (or unset) → passes.
  - `AUTOMATION_PROVIDER=n8n` with missing webhook URL → blocker.
  - `AUTOMATION_PROVIDER=webhook` with missing webhook URL →
    blocker.
- Existing tests must continue to pass.

### README "Reliability surface" table

Use this exact set of rows; status values must reflect reality, not
aspiration.

| Capability                          | Status                                                             |
| ----------------------------------- | ------------------------------------------------------------------ |
| Local bootstrap                     | Implemented                                                        |
| Launch validation gates             | Implemented                                                        |
| Deploy preflight gates              | Implemented                                                        |
| Deploy smoke                        | Static surface only                                                |
| Contact form persistence (Postgres) | Implemented                                                        |
| Postmark lead notification          | Implemented; required in production by ADR-024                     |
| Durable outbox + worker             | Implemented                                                        |
| Optional n8n automation             | Implemented; opt-in per ADR-024                                    |
| PITR backups (WAL-G)                | Implemented                                                        |
| Restore drill                       | Script exists; scheduling and evidence persistence in pass 07      |
| Rollback automation                 | Manual today; planned pass 04                                      |
| Live health visibility              | `/healthz` + `/readyz` only; unified surface in pass 08            |
| Uploads / content recovery          | Local backup; offsite chain to be verified before pass 07          |
| Migration safety classification     | Not implemented; planned pass 03                                   |
| Junior-hire recovery doc            | `docs/operations/restore.md` exists; rewrite for audience deferred |
| Fleet-wide ops view                 | Not implemented; deferred until ≥2 client sites                    |
| Client editing during GitHub outage | Not supported (Sveltia is git-backed per ADR-024)                  |

## Out of scope

Each item below is a later pass; do not pull any of it into this
session.

- Rollback CLI, `deploy:apply`, `health:live`, fleet manifest,
  restore-drill scheduling, E2E smoke with Postmark sandbox.
- OpsResult / ops-status convergence — pass 02.
- Refactoring `DeployPreflightResult`, `CheckLaunchResult`, or any
  other existing result shape. Pass 02 retrofits `doctor.ts` as the
  canary; further retrofits land alongside their owning slices.
- `CMS_MODE` env or any other "fake mode" toggle.
- Per-site Postgres topology changes.
- Smoke-test secret, `is_smoke_test` column, Postmark sandbox — pass 06.
- Quadlet image parsing helpers — pass 03.

## Validation

The pass must run all of these and report results:

- `bun run format:check`
- `bun run check`
- `bun run test`
- `bun run check:launch` (in a representative production-shaped
  env; explain any expected blockers)

If launch semantics are changed, the new tests above must be added
or updated. Existing tests must not regress.

## Deliverable

Return:

- Summary of changed files (paths only).
- Exact commands run and their pass/fail status.
- Any contradictions encountered between docs, env templates, and
  scripts that could not be resolved within scope.
- A single recommendation: "Pass 02 (OpsResult / `doctor.ts`
  canary) is the next slice." If anything found in this pass should
  reorder the roadmap, name it and explain.

## Codex prompt

You are implementing pass 01 of the `tmpl-svelte-app` reliability
roadmap. The binding contract is
[ADR-024](../adrs/ADR-024-lead-gen-website-appliance.md). The full
scope, file list, and validation rules are above in this document.

Read these first, in order, before writing any code:

1. `docs/planning/adrs/ADR-024-lead-gen-website-appliance.md`
2. This file (`docs/planning/passes/01-lead-gen-appliance.md`)
3. `README.md`
4. `scripts/check-launch.ts`
5. `scripts/deploy-preflight.ts`
6. `.env.example` and `deploy/env.example`
7. `secrets.example.yaml`
8. `docs/deployment/README.md`, `docs/deployment/secrets.md`,
   `docs/automations/README.md`, `docs/getting-started.md`

Then implement the **Scope** section above and **only** that. The
**Out of scope** section is binding — do not pull rollback, deploy
apply, OpsResult convergence, CMS_MODE, smoke secrets, or Quadlet
helpers into this pass. If you find a contradiction that cannot be
resolved without breaching scope, leave it, document it in the
deliverable, and stop.

When done, run the validation commands and return the deliverable
in the exact shape requested.
