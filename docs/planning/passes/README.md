# Implementation passes

Sequential, scoped implementation slices for `tmpl-svelte-app`. Each
pass is one focused engineering session: a single contract or
capability, small enough to review, test, and revert as one unit.

## Why this directory exists

The numbered planning docs at the parent level (`00-vision.md` through
`13-bootstrap-contract-phases/`) capture long-lived strategy. Passes
capture the **next** slice of work and the prompt that will execute
it. After a pass merges, its file remains as a record of what was
promised and what shipped.

## File convention

`NN-slug.md` where `NN` is a two-digit pass number. Each file
contains:

- **Goal** — one sentence
- **Pre-conditions** — what must be true before this pass starts
- **Scope** — exactly what changes
- **Out of scope** — what does NOT change in this pass
- **Validation** — commands the pass must pass
- **Deliverable** — what the pass returns
- **Codex prompt** — the literal entry-point prompt that can be
  handed to a coding agent

A pass should be small enough that one focused session can complete
it without context overflow. If it grows, split.

## Status

| #   | Title                                               | Status                | ADR     |
| --- | --------------------------------------------------- | --------------------- | ------- |
| 01  | Lead-gen website appliance contract                 | complete              | ADR-024 |
| 02  | OpsResult convergence with `doctor.ts` canary       | complete              | n/a     |
| 03  | Ops-status ledger + release state + Quadlet helpers | complete              | ADR-025 |
| 04  | Lock site bundle: remove bundled n8n                | complete              | ADR-027 |
| 05  | Rollback CLI                                        | complete              | n/a     |
| 06  | `deploy:apply` orchestrator                         | complete              | ADR-028 |
| 07  | E2E smoke through Postmark (authenticated backdoor) | drafted, ready to run | ADR-029 |
| 08  | Restore-drill scheduling and evidence persistence   | not yet drafted       | TBD     |
| 09  | `health:live` ledger view                           | not yet drafted       | TBD     |

Subsequent passes are drafted only after the prior one has merged, so
each prompt is informed by current repo reality, not a stale plan.
