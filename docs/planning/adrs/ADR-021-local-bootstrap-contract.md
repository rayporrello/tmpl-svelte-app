# ADR-021 — Local Bootstrap Contract

**Status:** Accepted
**Date:** 2026-05-01

---

## Context

The template used to rely on a documented first-run checklist: install
dependencies, copy or render env files, initialize project placeholders,
start Postgres, run migrations, validate the site, and remember which launch
items were still pending.

That approach became brittle as the template grew. The setup path now spans
SvelteKit, Bun, Drizzle, Postgres, Sveltia CMS, launch checks, generated local
secrets, and deployment examples. A written checklist could explain the path,
but it could not prove that local state matched the contract or that repeated
runs were safe.

The bootstrap contract project replaces that checklist with executable,
idempotent commands. The locked rules live in
`docs/planning/13-bootstrap-contract-project.md` section 2 and section 4.

---

## Decision

Adopt the four-command local bootstrap model:

```text
./bootstrap           converge local state to runnable
bun run doctor        explain current state without mutating it
bun run validate      prove repository correctness for PRs
bun run launch:check  prove production readiness before release
```

The model has these non-negotiable properties:

- `./bootstrap` is the only command in the set that converges local state.
- `bun run doctor` is always read-only and has no `--fix` mode.
- `bun run validate` remains the PR-grade gate.
- `bun run launch:check` is the release-grade gate and aliases
  `validate:launch` once the docs flip lands.
- Skips are based on observed state, not remembered completion state.
- Re-running bootstrap on an already bootstrapped repo must be idempotent.
- Failures use stable `BOOT-*` or `LAUNCH-*` codes with `NEXT:` remediation
  lines.
- The database contract is Postgres-first; there is no SQLite or lite path.
- Sveltia CMS local editing uses the browser "Work with Local Repository"
  flow, not a local proxy or `local_backend`.
- Generated local secrets must not appear in stdout or stderr.
- Bootstrap writes only to the protected-file allowlist.

The local bootstrap contract is versioned by
`.bootstrap.state.json.bootstrapContractVersion`. Future changes that alter
the meaning of bootstrap-owned state must respect that version field.

---

## Consequences

This enables a turnkey first run from a fresh clone: a developer can run
`./bootstrap`, then `bun run dev`, and get a working local site backed by
Postgres.

It also gives contributors a durable mental model:

- Bootstrap converges.
- Doctor explains.
- Validate gates repository correctness.
- Launch check gates production readiness.

Because the state is machine-checkable, CI can test the bootstrap contract
instead of trusting that documentation stayed accurate.

The tradeoff is maintenance cost. The template now has more scripts, more
fixtures, and a contract-version field that future changes must handle
deliberately. Any new setup-owned file must keep the protected-file allowlist,
bootstrap, doctor, and tests aligned.

---

## Alternatives Considered

### Keep the manual checklist

Rejected. A checklist is useful documentation, but it cannot prove
idempotency, detect drift in generated files, or safely distinguish
bootstrap-owned local state from user-owned state.

### Build a browser-based installer

Rejected. SvelteKit requires runtime environment state such as `DATABASE_URL`
for DB-backed routes. Booting the app in an install mode would add production
exposure risk and make local setup depend on the app being partially runnable.
The CLI contract is simpler and safer.

### Add SQLite as a lite local path

Rejected. The template contract is Postgres + Drizzle. A separate SQLite path
would create a second database behavior surface and hide production-relevant
Postgres problems until later.

These rejected paths are deliberately out of scope in
`docs/planning/13-bootstrap-contract-project.md` section 12. Reopening any of
them requires a new ADR.
