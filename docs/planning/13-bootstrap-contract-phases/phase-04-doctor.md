# Phase 4 — `bun run doctor` + ADR-021

> Plan reference: §6 Phase 4, §3.5 (Doctor JSON schema), §9 (Launch-blockers
> manifest).

## Goal

A read-only diagnostic that explains current state and predicts what will
need attention before launch. Doctor never mutates. Doctor and bootstrap
share the same primitives, so what doctor reports is exactly what bootstrap
would observe.

## Prereqs

- Phase 0, 1, 2, 3 merged.

## Files to create / modify

| Path                                                     | Change                                                                                 |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `scripts/doctor.ts`                                      | New script. Read-only.                                                                 |
| `tests/unit/doctor.test.ts`                              | New unit test. Asserts working tree unchanged after a doctor run; asserts JSON schema. |
| `tests/fixtures/doctor/`                                 | Fixtures: `fresh-bootstrap/`, `ready-to-launch/`, `broken-env/`.                       |
| `package.json`                                           | Add `"doctor": "bun scripts/doctor.ts"`.                                               |
| `docs/planning/adrs/ADR-021-local-bootstrap-contract.md` | New ADR. Captures the four-command model and the locked decisions.                     |

## Behavior contract

### Sections (in order)

1. **Environment** — Bun version, container runtime, dirty tree.
2. **Configuration** — `.env` exists and parses, `DATABASE_URL` parses,
   `package.json.name` is project not template, no template placeholders
   in `site.ts` / `static/admin/config.yml`.
3. **Runtime** — DB reachable (calls `bun run check:db`), expected
   migrations applied (compare `drizzle/` migration count to applied
   count in DB), starter tables exist (`contact_submissions`,
   `automation_events`, `automation_dead_letters`).
4. **Validation forecast** — runs the cheap checks (`check:cms`,
   `check:content`, `check:assets`, `check:design-system`, `check:seo`,
   `secrets:check`) and reports their status. Does **not** run `build`,
   `test`, or `test:e2e`.
5. **Launch blockers** — iterate `LAUNCH_BLOCKERS` from
   `scripts/lib/launch-blockers.ts` and report each. (Real `check`
   functions are stubs in Phase 1; Phase 7 fills them in. Doctor still
   surfaces them — even stubs report `pass` cleanly.)

### Exit codes

- `0` if every required check passes (warnings allowed).
- Nonzero if any required check fails. Use `1` for fail, `2` for fatal
  (e.g., can't read `.env` at all).

### `--json` flag

Emits the schema in §3.5 of the planning doc:

```json
{
	"schemaVersion": 1,
	"status": "pass | warn | fail",
	"generatedAt": "2026-05-01T18:00:00Z",
	"sections": [
		{
			"id": "environment",
			"label": "Environment",
			"checks": [
				{
					"id": "BOOT-BUN-001",
					"status": "pass",
					"label": "Bun is installed",
					"detail": "Bun 1.x detected",
					"severity": "required",
					"hint": null
				}
			]
		}
	]
}
```

When `--json` is set, suppress the human-readable output entirely. Print
only the JSON document on stdout. Errors still go to stderr.

### Read-only invariant

A test must diff the working tree before and after `bun run doctor`. Any
diff is a failure of this phase.

The same applies to `bun run doctor --json`: no mutations, ever, under any
flag combination.

There is **no `--fix` flag** (§2 of the planning doc — bootstrap mutates,
doctor explains; mixing the two erodes trust).

## ADR-021

Author `docs/planning/adrs/ADR-021-local-bootstrap-contract.md`. Match
the style of ADR-018 and ADR-020. Required sections:

- Status: Accepted
- Date: today
- Context: why the previous "documented checklist" approach was
  insufficient as the template grew
- Decision: the four-command model (bootstrap, doctor, validate,
  launch:check) with the locked rules from planning doc §2 and §4
- Consequences: what this enables (turnkey first-run, durable mental
  model, machine-checkable launch readiness) and what it costs (more
  scripts to maintain, contract-version field that must be respected on
  future changes)
- Alternatives considered: (a) keep the manual checklist, (b) build a
  browser-based installer, (c) use SQLite for a lite path. All rejected
  with reasons; reference §12 of the planning doc.

Cross-link from the project plan:

```diff
- ADR-021 (this project) — to be authored during Phase 4.
+ ADR-021 (this project) — accepted; see [ADR-021](adrs/ADR-021-local-bootstrap-contract.md).
```

## Acceptance criteria

- [ ] `bun run doctor` against a freshly bootstrapped repo lists the
      three expected launch blockers (OG image, localhost ORIGIN/PUBLIC_SITE_URL,
      CMS backend.repo placeholder) and exits with a warn status, not fail.
- [ ] `bun run doctor` against a "ready-to-launch" fixture exits 0 and
      reports no fail-status checks.
- [ ] `bun run doctor` against a "broken-env" fixture exits nonzero with
      the specific failed check identified.
- [ ] `bun run doctor --json` validates against the §3.5 schema.
- [ ] A test diffs the working tree before/after doctor runs and asserts
      no diff under any flag.
- [ ] No `--fix` flag exists.
- [ ] ADR-021 is committed and accepted.
- [ ] `bun run validate` passes.

## Commit message

```
feat(scripts): add bun run doctor (read-only) + ADR-021

Doctor explains current state without mutating anything. Composes the
same primitives bootstrap uses, in detection mode only. Sections:
environment, configuration, runtime, validation forecast, launch blockers.

--json emits a custom versioned schema (planning doc §3.5). No --fix
flag — mixing diagnosis and mutation erodes trust in the diagnostic
(planning doc §2).

ADR-021 captures the four-command model (bootstrap converges, doctor
explains, validate gates PR correctness, launch:check gates production
readiness) and the locked rules.

Refs: docs/planning/13-bootstrap-contract-project.md §3.5, §6 Phase 4, §9.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Pitfalls

- **Read-only invariant is non-negotiable.** Even something like writing
  a temp file violates it if it's in the working tree. Use OS temp dirs
  for scratch state (which doctor probably doesn't need anyway).
- **Doctor calls `check:db` as a subprocess**, not by importing
  `src/lib/server/db/health.ts` directly. Going through the same
  `bun run check:db` interface keeps doctor's runtime story identical to
  what bootstrap and CI use.
- **Stubs are fine for now.** Launch-blockers `check` functions are
  stubs until Phase 7. Doctor still reports them; they all return `pass`.
- **Don't gate doctor's exit code on warnings.** A warning means
  "production-not-ready," not "broken." Exit 0 with warnings; exit
  nonzero only on real failures (env can't be read, DB unreachable,
  required check fails).
