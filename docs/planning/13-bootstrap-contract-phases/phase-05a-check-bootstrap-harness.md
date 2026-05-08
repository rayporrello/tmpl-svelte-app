<!-- 2026-05-08: Historical planning note. Shared-infrastructure cleanup supersedes per-site production Postgres/worker/backup/restore assumptions; see docs/planning/adrs/ADR-031-shared-infrastructure-cell.md. -->

# Phase 5a — `check:bootstrap` Test Harness

> Plan reference: §6 Phase 5, §4 rule 11 (mock-provisioner mode).

## Goal

Make the bootstrap contract testable in CI without Podman. Two modes:
dry-run (proves planning) and mock-provisioner (proves mutation behavior,
idempotency, and secret hygiene in a tempdir).

This phase also adds `secrets:check` to `validate` — now that bootstrap
generates local secrets, plaintext-leak detection runs on every PR.

## Prereqs

- Phase 0, 1, 2, 3, 4 merged.

## Files to create / modify

| Path                                             | Change                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `scripts/check-bootstrap.ts`                     | New harness with two modes.                                                                                               |
| `tests/fixtures/bootstrap/fresh-template/`       | Snapshot of relevant template files in placeholder state.                                                                 |
| `tests/fixtures/bootstrap/half-done/`            | init:site ran, .env missing.                                                                                              |
| `tests/fixtures/bootstrap/already-bootstrapped/` | All steps complete.                                                                                                       |
| `tests/fixtures/bootstrap/broken-env/`           | .env points to dead DB.                                                                                                   |
| `package.json`                                   | Add `"check:bootstrap": "bun scripts/check-bootstrap.ts"`. Wire it into `validate`. Wire `secrets:check` into `validate`. |

## Behavior contract

### Default mode — runs both dry-run and mock-provisioner

`bun run check:bootstrap` with no flags runs **both modes** in sequence.
This is what `validate` calls; it must catch both planning regressions
(dry-run output drift) and mutation regressions (idempotency, allowlist,
secret hygiene).

Focused subcommands exist for triage:

- `bun run check:bootstrap --dry-run` — only Mode 1.
- `bun run check:bootstrap --mock` — only Mode 2.

Either focused mode is sufficient when iterating on a specific failure;
neither is sufficient as the CI gate. The default-mode runner aggregates
both results and exits nonzero if either fails.

### Mode 1 — dry-run

Invoked by the default runner or by `bun run check:bootstrap --dry-run`.

Steps:

1. Copy the `fresh-template` fixture into a tempdir.
2. Symlink `node_modules` from the host repo (avoid a real install).
3. Run `bun scripts/bootstrap.ts --dry-run --ci` with deterministic
   `BOOTSTRAP_*` env vars.
4. Assert: exit code 0, no file mutations in the tempdir, output contains
   each expected step's `WOULD …` line.

### Mode 2 — mock-provisioner

Invoked by the default runner or by `bun run check:bootstrap --mock`.

Steps:

1. Copy the `fresh-template` fixture into a tempdir.
2. Symlink `node_modules`.
3. Set `BOOTSTRAP_PROVISIONER=mock` (a future env var the orchestrator
   honors). The mock provisioner:
   - Pretends `provisionLocalPostgres()` succeeded with a fake host/port.
   - Pretends `bun run check:db` succeeded.
   - Pretends `drizzle-kit migrate` succeeded.
   - Records every action it would have taken.
4. Run `bun scripts/bootstrap.ts --ci` with deterministic `BOOTSTRAP_*`
   env vars.
5. Assert:
   - Exit code 0.
   - `.env` is generated with all four required keys.
   - `.bootstrap.state.json` is written with the expected shape.
   - Only paths in the protected-file allowlist were mutated.
   - Generated secrets do not appear in captured stdout/stderr (regex
     check for hex-32 strings, except inside the redaction-test fixture).
6. Run `bun scripts/bootstrap.ts --ci` a **second time**.
7. Assert:
   - Exit code 0.
   - `git diff` against the post-first-run state is **empty**.
   - `.bootstrap.state.json` is byte-identical to after the first run.

### Failure-mode coverage

For each `BOOT-*` code in the registry, prepare a fixture or env
manipulation that triggers it, run bootstrap, and assert:

- Exit code is nonzero.
- Output contains the documented code.
- Output contains a `NEXT:` line.

Codes covered: `BOOT-BUN-001` (skip — needs to mock `command -v bun`;
acceptable to skip in this harness), `BOOT-ENV-001`, `BOOT-INIT-001`,
`BOOT-PG-001`, `BOOT-PG-003`, `BOOT-DB-001`, `BOOT-DB-002`, `BOOT-DB-003`,
`BOOT-DB-004`, `BOOT-MIG-001`, `BOOT-GUARD-001`.

`BOOT-PG-001` and `BOOT-PG-003` require coordinating with the mock
provisioner — for example, set the mock to refuse port allocation.

`BOOT-GUARD-001` is triggered by a deliberate test-only orchestrator path
that attempts to write to a non-allowlisted path.

### `validate` wiring

```diff
- "validate": "bun run format:check && bun run check && …"
+ "validate": "bun run format:check && bun run check && bun run check:bootstrap && bun run secrets:check && …"
```

`check:bootstrap` runs after `check` (typecheck) but before the expensive
build/test steps. `secrets:check` is cheap; place it next to
`check:bootstrap` for related-concerns grouping.

## Acceptance criteria

- [ ] `bun run check:bootstrap` (default mode, both runs) exits 0
      against a clean working tree.
- [ ] `bun run check:bootstrap --dry-run` exits 0 and asserts no
      mutations in the tempdir.
- [ ] `bun run check:bootstrap --mock` exits 0 and proves second-run
      byte-for-byte idempotency.
- [ ] Each documented `BOOT-*` failure-mode test produces the documented
      code and a `NEXT:` line.
- [ ] `.env` generated by mock-mode contains exactly the four required
      keys; no extra keys.
- [ ] No generated secret appears in captured stdout/stderr.
- [ ] `bun run validate` includes `check:bootstrap` and `secrets:check`,
      and it runs them before `build`/`test`/`test:e2e:built`.
- [ ] `bun run validate` passes locally.

## Commit message

```
test(bootstrap): add check:bootstrap harness + secrets:check in validate

Two-mode harness; default runs BOTH modes and is what `validate` calls.
- Dry-run: proves planning, output shape, no mutations.
- Mock-provisioner: tempdir + stubbed DB provisioning; proves .env
  generation, allowlist enforcement, second-run byte-for-byte
  idempotency, and that secrets never leak into captured output.

Focused subcommands `--dry-run` and `--mock` are for iteration only;
neither alone is sufficient as the CI gate.

Failure-mode coverage for every BOOT-* code that doesn't require real
Podman (BOOT-PG-001, -003, -DB-*, -MIG-001, -GUARD-001, -INIT-001,
-ENV-001).

Wires check:bootstrap and secrets:check into `bun run validate` so the
PR gate now catches bootstrap regressions and any plaintext-secret leak.

Real-Postgres integration smoke (Phase 5b) is gated by
BOOTSTRAP_PODMAN=1 and not in `validate`.

Refs: docs/planning/13-bootstrap-contract-project.md §4 rule 11, §6 Phase 5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Pitfalls

- **The `BOOTSTRAP_PROVISIONER=mock` seam is a real new contract.** Add
  it to `scripts/bootstrap.ts` as part of this phase if it doesn't exist
  yet, but keep it minimal: a single env-var-gated branch in `step 4
Postgres` and `step 6 health verify` that returns canned success. The
  rest of the orchestrator runs unchanged.
- **Symlink `node_modules` per fixture run.** Don't `bun install` inside
  the tempdir — slow and unnecessary. Keep this in mind when designing
  the harness.
- **The idempotency test is the most valuable assertion.** If it ever
  fails, do not "fix" it by adding noise to the comparison; fix bootstrap
  to actually be idempotent.
- **Don't add `check:bootstrap-podman` to `validate`.** That's a
  separate command (Phase 5b) gated behind `BOOTSTRAP_PODMAN=1` for
  manual real-container smoke runs only.
