<!-- 2026-05-08: Historical planning note. Shared-infrastructure cleanup supersedes per-site production Postgres/worker/backup/restore assumptions; see docs/planning/adrs/ADR-031-shared-infrastructure-cell.md. -->

# Pass 02 — OpsResult convergence with `doctor.ts` canary

## Goal

Define a single `OpsResult` shape and pretty printer that all ops and
diagnostic scripts will eventually return, then prove the shape works
by retrofitting `scripts/doctor.ts` as the canary. No other scripts
are touched in this pass.

## Pre-conditions

- Pass 01 has merged. [ADR-024](../adrs/ADR-024-lead-gen-website-appliance.md)
  is the binding product contract.
- Prior audit (in conversation thread, summarized below) found eight
  divergent result types live across `scripts/`. `doctor.ts` is the
  richest of the eight (`DoctorCheck` + `DoctorReport`, with id,
  status, label, detail, severity, hint), so it is the right canary.
- Existing print helpers live at `scripts/lib/print.ts`.
- Pass 01 already established a precedent for shared primitives:
  `src/lib/server/automation/providers/index.ts` exposes
  `readAutomationProviderConfig` /
  `validateAutomationProviderConfig` as a single source of truth that
  multiple call sites consume. The OpsResult printer should follow
  the same single-source-of-truth pattern.

## Scope

The pass introduces the `OpsResult` primitive and retrofits one
caller. It does **not** retrofit any other script.

### New file

`scripts/lib/ops-result.ts` — type, constructors, severity helpers,
pretty printer.

OpsResult shape:

```ts
export type OpsSeverity = 'pass' | 'info' | 'warn' | 'fail';

export interface OpsResult {
	/** Stable identifier, e.g. 'DOCTOR-PG-001'. Used for grepping logs and tests. */
	id: string;
	severity: OpsSeverity;
	/** Single-line headline, operator-readable. */
	summary: string;
	/** Multi-line detail, optional. */
	detail?: string;
	/** Ordered, copy-pasteable remediation steps. */
	remediation?: string[];
	/** Doc path or URL pointing to a runbook. */
	runbook?: string;
}
```

Helpers:

- `pass(id, summary, opts?)`, `info(...)`, `warn(...)`, `fail(...)` —
  ergonomic constructors so call sites read cleanly.
- `worstSeverity(results: OpsResult[]): OpsSeverity` — returns the
  worst severity in a list. Callers compute exit codes from this.
- `severityToExitCode(s): 0 | 1` — canonical mapping (see below).
- `printOpsResult(result, options?)` — single-result renderer.
  Glyphs, indentation, TTY-aware color, optional `--no-color`.
- `printOpsResults(results, options?)` — multi-result renderer with
  optional grouping by severity.

Severity → exit code mapping (canonical for all future callers):

| Worst severity in batch   | Exit code | Stream for warnings |
| ------------------------- | --------- | ------------------- |
| `pass` only               | 0         | —                   |
| any `info` (no warn/fail) | 0         | stdout              |
| any `warn` (no fail)      | 0         | stderr              |
| any `fail`                | 1         | stderr              |

### Modified files

`scripts/doctor.ts` — retrofit to emit `OpsResult[]`.

Mapping from existing shape to OpsResult:

| Existing field                           | OpsResult field                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `id`                                     | `id`                                                                            |
| `label`                                  | `summary`                                                                       |
| `detail`                                 | `detail`                                                                        |
| `hint`                                   | first entry of `remediation` (split into multiple if hint contains line breaks) |
| `severity: required` × `status: pass`    | `severity: pass`                                                                |
| `severity: required` × `status: fail`    | `severity: fail`                                                                |
| `severity: recommended` × `status: pass` | `severity: pass`                                                                |
| `severity: recommended` × `status: fail` | `severity: warn`                                                                |
| `status: skip`                           | `severity: info`                                                                |

Output behavior:

- Human stdout must remain visually similar. The pretty printer
  prints one block per result with a glyph keyed to severity (e.g.
  `✓` pass, `i` info, `!` warn, `✗` fail), the summary on the same
  line, then optional indented detail and remediation.
- `--json` output emits `OpsResult[]` (the array, not a wrapper). If
  the previous JSON was a `DoctorReport` envelope, document the
  breaking change in the deliverable.
- Exit code follows the canonical mapping above.

`scripts/lib/print.ts` — extend, do not replace. The OpsResult
printer can live in `ops-result.ts` and call existing helpers from
`print.ts` for color, glyphs, and width handling. If duplication
becomes obvious, prefer to consolidate into `print.ts`; if it
doesn't, leave it.

### Tests

- New: `tests/unit/ops-result.test.ts` — shape, constructor helpers,
  `worstSeverity`, `severityToExitCode`, printer output (snapshot or
  targeted substring assertions), TTY vs non-TTY rendering.
- Updated: existing doctor tests — assert against `OpsResult[]`
  where they previously asserted `DoctorCheck` / `DoctorReport`. If
  any test fixture references `DoctorReport`'s wrapping shape,
  migrate it.
- If any non-test code imports `DoctorCheck` or `DoctorReport`
  types, document the consumer in the deliverable rather than
  silently breaking it.

## Out of scope

Each item is binding. Do not pull any of it into this pass.

- Retrofitting `scripts/check-launch.ts`,
  `scripts/deploy-preflight.ts`, `scripts/deploy-smoke.ts`,
  `scripts/check-init-site.ts`,
  `scripts/backup-restore-drill.ts`. They keep their existing
  shapes; each is retrofitted in its owning pass.
- Status ledger / file persistence — pass 03.
- Quadlet image helpers — pass 03.
- Rollback CLI — pass 04.
- Changing the _set_ of checks `doctor.ts` runs. The canary is a
  shape change, not a coverage change.
- Changing `/healthz`, `/readyz`, or any app-side route.

## Validation

- `bun run format:check`
- `bun run check`
- `bun run test`
- `bun run doctor` — manual sanity check that human output is
  readable. Save a before/after snippet for one section and include
  it in the deliverable.
- `bun run doctor --json` (or whatever the JSON flag currently is) —
  confirm JSON output validates against `OpsResult[]`.

## Deliverable

Return:

- Summary of changed files (paths only).
- Exact commands run and pass/fail status.
- Before/after sample of `bun run doctor` stdout for one section,
  demonstrating output stability.
- Any consumer of the old `DoctorReport` JSON or
  `DoctorCheck`/`DoctorReport` TypeScript types that broke (in code,
  scripts, tests, or docs). For each, name the file and one-line the
  breakage.
- Recommendation: "Pass 03 (Quadlet image helpers + release-state
  writer) is the next slice." If anything found in this pass should
  reorder the roadmap, name it and explain.

## Codex prompt

You are implementing pass 02 of the `tmpl-svelte-app` reliability
roadmap. The binding contract from pass 01 is
[ADR-024](../adrs/ADR-024-lead-gen-website-appliance.md). The full
scope, file list, and validation rules are above in this document.

Read these first, in order, before writing any code:

1. This file (`docs/planning/passes/02-ops-result-canary.md`)
2. `docs/planning/adrs/ADR-024-lead-gen-website-appliance.md`
3. `scripts/doctor.ts`
4. `scripts/lib/print.ts`
5. `scripts/lib/errors.ts`
6. Existing doctor tests under `tests/unit/`
7. Skim only (do **not** modify): `scripts/check-launch.ts`,
   `scripts/deploy-preflight.ts`, `scripts/deploy-smoke.ts`,
   `scripts/backup-restore-drill.ts`. Read enough to confirm the
   `OpsResult` shape can absorb their existing fields when they
   retrofit later. Do not retrofit them in this pass.

Then implement the **Scope** section above and **only** that. The
**Out of scope** section is binding — do not retrofit other scripts,
do not introduce ledger writes, do not add Quadlet helpers.

When done, run the validation commands and return the deliverable in
the exact shape requested.
