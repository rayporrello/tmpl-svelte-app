# Bootstrap Contract — Phase Prompts

This directory contains one prompt file per phase of the Bootstrap Contract
project. Each file is a self-contained brief intended to be loaded as a
single prompt to Codex (or any other coding agent) inside VS Code.

The locked spec is at [`../13-bootstrap-contract-project.md`](../13-bootstrap-contract-project.md).
Phase prompts are short on rationale and long on instructions; for the why,
read the spec.

## How to use a prompt

In VS Code, open the relevant phase file and feed its contents to Codex with
something like:

> Implement the phase described in `docs/planning/13-bootstrap-contract-phases/phase-00-formatting-baseline.md`. Refer to `docs/planning/13-bootstrap-contract-project.md` for the locked spec where the prompt cites a section number. Stop when the acceptance criteria are met. Commit using the suggested message.

Run **one phase per session** and review the diff before starting the next.
Phases must run in order — Phase N+1 depends on Phase N's primitives.

## Phase order

| File                                                                           | Phase | What it ships                                                                                                             |
| ------------------------------------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------- |
| [`phase-00-formatting-baseline.md`](phase-00-formatting-baseline.md)           | 0     | Prettier baseline + `format:check` gate                                                                                   |
| [`phase-01-script-primitives.md`](phase-01-script-primitives.md)               | 1     | `scripts/lib/*` helpers + error registry + manifest stubs                                                                 |
| [`phase-02-check-db.md`](phase-02-check-db.md)                                 | 2     | `bun run check:db`                                                                                                        |
| [`phase-03-bootstrap-orchestrator.md`](phase-03-bootstrap-orchestrator.md)     | 3     | `./bootstrap` and `scripts/bootstrap.ts`                                                                                  |
| [`phase-04-doctor.md`](phase-04-doctor.md)                                     | 4     | `bun run doctor` + ADR-021                                                                                                |
| [`phase-05a-check-bootstrap-harness.md`](phase-05a-check-bootstrap-harness.md) | 5a    | `check:bootstrap` (dry-run + mock-provisioner) + `secrets:check` in `validate`                                            |
| [`phase-05b-check-bootstrap-podman.md`](phase-05b-check-bootstrap-podman.md)   | 5b    | `check:bootstrap-podman` integration smoke + nightly cron                                                                 |
| [`phase-06-sveltia-docs.md`](phase-06-sveltia-docs.md)                         | 6     | Sveltia "Work with Local Repository" docs (no scripts)                                                                    |
| [`phase-07-launch-blockers-manifest.md`](phase-07-launch-blockers-manifest.md) | 7     | Launch-blockers manifest filled in                                                                                        |
| [`phase-08-docs-flip-ci.md`](phase-08-docs-flip-ci.md)                         | 8     | README + getting-started flip; `bootstrap-smoke` CI job                                                                   |
| [`phase-09-extras.md`](phase-09-extras.md)                                     | 9     | Polish: `launch:check`, `deploy:preflight`, `backup:check`, `reset:dev`, `seed:dev`, dev banner, `.template/project.json` |

## Conventions used in every phase prompt

- **Goal** — the one-sentence outcome.
- **Prereqs** — phases that must already be merged.
- **Files to create / modify** — exact paths.
- **Behavior contract** — the spec you must implement, with cross-references
  to numbered sections of the planning doc.
- **Acceptance criteria** — concrete checks. The phase is not done until
  every box is ticked.
- **Commit message** — suggested wording. Add the `Co-Authored-By` trailer
  the repo uses.
- **Pitfalls** — gotchas worth knowing before you start.

## Locked rules that apply to every phase

These come from §2 and §4 of the planning doc and are non-negotiable:

1. Bootstrap mutates; doctor never mutates; `validate`/`launch:check` are
   gates.
2. Skips are observed-state, not remembered-state.
3. Idempotent or it doesn't ship.
4. Stable `BOOT-*` / `LAUNCH-*` codes with `NEXT:` lines on every failure.
5. Postgres-first — no SQLite anywhere.
6. CMS local editing is Sveltia "Work with Local Repository," not a proxy.
7. Filesystem/script code never enters the client bundle.
8. Generated secrets never appear in stdout/stderr.
9. Bootstrap may write only to the protected-file allowlist (§5.2).

When in doubt, the planning doc wins; if the planning doc is unclear, stop
and ask — do not guess.
