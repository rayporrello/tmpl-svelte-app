<!-- 2026-05-08: Historical planning note. Shared-infrastructure cleanup supersedes per-site production Postgres/worker/backup/restore assumptions; see docs/planning/adrs/ADR-031-shared-infrastructure-cell.md. -->

# Phase 9 — Polish Extras (each its own commit)

> Plan reference: §6 Phase 9, §11 (PR sequence).

These are additive polish on top of the contract. Each section below
ships as its own commit. None block earlier phases. Pick whichever
matters most first; common picks are §9.3 `reset:dev` and §9.5 the dev
banner.

> **Note.** The original §9.1 (`launch:check` alias) was moved into
> Phase 8, because the README and getting-started rewrite there
> reference the alias. The four-command model must be coherent the
> moment the docs flip. §9.1 is intentionally absent here; the
> remaining extras keep their original order, renumbered.

## Prereqs

- Phases 0–8 merged (the contract is complete).

## Conventions

Each extra below has its own goal, files, behavior contract, acceptance
criteria, and commit message. Run them one at a time. The Phase 9
sub-prompt is the section header (e.g., "Implement §9.1 from
phase-09-extras.md").

---

## §9.1 — `bun run deploy:preflight`

### Goal

A read-only "_can I ship this?_" check distinct from `validate:launch`.
`validate:launch` proves repo correctness; `deploy:preflight` proves
your **deployment configuration** is ready.

### Files

- `scripts/deploy-preflight.ts` — new.
- `tests/unit/deploy-preflight.test.ts` — new.
- `package.json` — add `"deploy:preflight": "bun scripts/deploy-preflight.ts"`.

### Behavior contract

Read-only checks:

1. Production env file exists (e.g., `.env.production` or per-project
   path documented in `secrets.yaml`).
2. SOPS render succeeds for the production secrets if SOPS is configured.
3. `DATABASE_URL` in production env is HTTPS-prod-shaped (not
   `localhost`, not `127.0.0.1`).
4. `ORIGIN` and `PUBLIC_SITE_URL` are HTTPS and match the expected
   domain (cross-checked against `src/lib/config/site.ts`'s `domain`).
5. `deploy/Caddyfile.example`'s placeholder domain has been replaced
   with the real one (or a project-local `Caddyfile` exists).
6. `deploy/quadlets/web.container` references the correct image name
   matching the project slug.
7. GHCR image name matches `<owner>/<project-slug>` shape.
8. `BACKUP_REMOTE` is configured **or** the user has explicitly set
   `BACKUP_WAIVED=true` for this deploy.
9. Launch-blockers manifest passes for all `required` blockers.

### Acceptance

- [ ] No mutations under any flag combination.
- [ ] Each check has a unit test for pass and fail cases.
- [ ] On a fresh-bootstrapped project (placeholders intact),
      `deploy:preflight` fails with multiple identifiable reasons.
- [ ] On a fully prepared project, exits 0.

### Commit message

```
feat(scripts): add bun run deploy:preflight (read-only)

Pre-deploy gate that proves your deployment configuration is ready —
production env file, secrets render, HTTPS origins, Caddyfile/Quadlet
names align with project slug, GHCR image name, backups configured (or
explicitly waived).

Distinct from validate:launch, which proves repo correctness.

Refs: docs/planning/13-bootstrap-contract-project.md §6 Phase 9.
```

---

## §9.2 — `bun run backup:check`

### Goal

Verify backups actually work. A backup that has never been restored is a
theory.

### Files

- `scripts/backup-check.sh` (or `.ts`) — new.
- `package.json` — add `"backup:check": "bun scripts/backup-check.ts"` (or
  the bash equivalent).

### Behavior contract

1. Run `pg_dump` against the local DB into a temp file.
2. Spin up an ephemeral verification database (a second Postgres
   container with a different name and dynamic port).
3. Restore the dump into the verification DB.
4. Run a sanity query (e.g., count `contact_submissions` in source vs.
   verification; assert equal).
5. Tear down the verification DB.

### Acceptance

- [ ] `bun run backup:check` exits 0 against a healthy local DB.
- [ ] On a deliberate corruption (truncate the dump file mid-test), it
      fails with a clear message.
- [ ] Cleanup is mandatory — verification DB must be removed in a
      finally block.

### Commit message

```
feat(scripts): add bun run backup:check (round-trip verification)

Run pg_dump → restore into ephemeral DB → assert row counts match →
tear down. Catches the "backup never restored" failure mode before
launch.

Refs: docs/planning/13-bootstrap-contract-project.md §6 Phase 9.
```

---

## §9.3 — `bun run reset:dev`

### Goal

Tear down only what bootstrap created, safely. Useful while iterating
on bootstrap itself or starting fresh on a project.

### Files

- `scripts/reset-dev.ts` — new.
- `package.json` — add `"reset:dev": "bun scripts/reset-dev.ts"`.

### Behavior contract

Resources removed:

1. Container matching `.bootstrap.state.json.createdContainer` **and**
   carrying labels:
   - `tmpl-svelte-app.bootstrap=true`
   - `tmpl-svelte-app.project-slug=<slug>` matching `package.json.name`
2. `.bootstrap.state.json` itself.
3. `.env` is **moved** to `.env.backup.<unix-ts>` (not deleted) by
   default.

### Refusals

- Refuse if `DATABASE_URL` in `.env` does not point to the
  bootstrap-owned container's host:port. Print: `_DATABASE_URL points to
an external Postgres, not the bootstrap-owned container. Refusing
to proceed._`
- Refuse if the working tree has uncommitted changes outside the
  expected file set (this protects in-progress work).

### Flags

- `--destroy-env` — actually delete `.env` instead of moving it.
- `--force` — bypass the working-tree-clean refusal (still respects the
  external-DB refusal).

### Acceptance

- [ ] On a fresh-bootstrapped repo, `bun run reset:dev` removes the
      container and moves `.env` to `.env.backup.<ts>`.
- [ ] Re-running `./bootstrap` after `reset:dev` reaches green again
      (proves true round-trip).
- [ ] When `DATABASE_URL` points elsewhere, `reset:dev` refuses and
      exits nonzero.
- [ ] No labels match → no removal. Test by manually creating a
      same-named container without labels and confirming `reset:dev` does
      not touch it.

### Commit message

```
feat(scripts): add bun run reset:dev (label-checked safe teardown)

Tears down only bootstrap-owned resources. Match by container name AND
all three tmpl-svelte-app.* labels. Refuses if DATABASE_URL points
elsewhere or working tree has unrelated uncommitted changes (--force
overrides).

.env moves to .env.backup.<ts> by default; --destroy-env deletes it.

Round-trip safe: ./bootstrap after reset:dev gets back to green.

Refs: docs/planning/13-bootstrap-contract-project.md §6 Phase 9.
```

---

## §9.4 — `bun run seed:dev`

### Goal

Realistic demo content so a fresh-clone site looks like a real site
during brand styling. Idempotent and reversible.

### Files

- `scripts/seed-dev.ts` — new.
- `content/articles/_seed/`, `content/team/_seed/`, etc. — new fixture
  files under deterministic IDs.
- `package.json` — add `"seed:dev": "bun scripts/seed-dev.ts"`.

### Behavior contract

Default action:

- Create 3 sample articles under `content/articles/` with realistic
  frontmatter (title, slug, date, feature image from `static/uploads/seed/`).
- Create 2 team member YAML files under `content/team/`.
- Create 2 testimonials.
- Insert 5 fake `contact_submissions` rows with deterministic IDs.

Determinism: every record has a fixed UUID/slug derived from a constant
seed string. Re-running `seed:dev` does not duplicate.

`--reset` flag: removes the seeded files and DB rows by ID match.

**Bootstrap must not auto-run `seed:dev`.** Bootstrap's summary block can
mention it as an optional next step.

### Acceptance

- [ ] `bun run seed:dev` produces deterministic file content (run twice,
      diff empty).
- [ ] `bun run seed:dev -- --reset` removes everything `seed:dev`
      created and only what it created.
- [ ] After seed, `bun run dev` shows the populated `/articles`, team,
      and testimonials.
- [ ] The bootstrap summary block from Phase 3 mentions `seed:dev` as
      optional (update Phase 3's summary in this commit if not already
      there).

### Commit message

```
feat(scripts): add bun run seed:dev (reversible demo content)

Deterministic seed: 3 articles, 2 team members, 2 testimonials, 5 fake
contact submissions. IDs are stable so re-running does not duplicate.
--reset removes only what seed:dev created.

Bootstrap does NOT auto-run seed. The summary block lists it as
optional. Useful for brand styling against realistic density before
real content exists.

Refs: docs/planning/13-bootstrap-contract-project.md §6 Phase 9.
```

---

## §9.5 — First-run dev banner

### Goal

In dev only, render an inline banner listing remaining setup tasks (real
OG image, real ORIGIN/PUBLIC*SITE_URL, real CMS repo, etc.). The
WordPress equivalent of "\_your site is in setup mode*."

### Files

- `src/lib/server/launch-blockers.ts` — server-only re-export of the
  manifest in `scripts/lib/launch-blockers.ts`. **Required:** scripts
  manifest cannot be imported into client-rendered Svelte; this is the
  bridge.
- `src/routes/+layout.server.ts` — read-only computation of dev warnings
  in dev only; production builds tree-shake.
- `src/routes/+layout.svelte` — render the banner only when
  `import.meta.env.DEV` and any blocker fires.
- `tests/unit/launch-blockers-bridge.test.ts` — assert the bridge is
  pure-function and serializable.

### Behavior contract

1. The script-side manifest at `scripts/lib/launch-blockers.ts` stays
   the source of truth.
2. `src/lib/server/launch-blockers.ts` exports a pure function
   `getDevSetupWarnings()` that calls the same `check` functions and
   returns a serializable `{ id, label, severity, fixHint }[]`. **No
   filesystem-heavy or script-only code crosses this boundary.**
3. `+layout.server.ts` calls it only when
   `process.env.NODE_ENV !== 'production'`.
4. `+layout.svelte` renders the banner only if both
   `import.meta.env.DEV` and `data.devWarnings.length > 0`.
5. Banner is fixed-position, dismissible per session (sessionStorage,
   not localStorage — re-appears in a new session so blockers don't get
   forgotten).
6. Banner is removed entirely from production bundles. Verify by
   building production and grepping the JS for the banner's text.

### Acceptance

- [ ] Banner appears in `bun run dev` on a fresh-bootstrapped repo with
      the expected three blockers.
- [ ] After replacing `static/og-default.png`, the LAUNCH-OG-001 entry
      disappears on next reload.
- [ ] Production build (`bun run build && bun run preview`) does not
      render the banner and does not ship its source code.
- [ ] No `scripts/lib/launch-blockers.ts` import path is reachable from
      client-rendered Svelte (verify via Vite's bundle visualizer or a
      build-time assertion).

### Commit message

```
feat(dev): add first-run setup banner (dev only)

Renders an inline banner in dev when launch blockers remain (default
OG image, localhost ORIGIN/PUBLIC_SITE_URL, placeholder CMS
backend.repo, etc.). Reads from a server-only bridge at
src/lib/server/launch-blockers.ts that mirrors the script manifest at
scripts/lib/launch-blockers.ts; no script code enters the client
bundle.

Banner is dismissible per session and tree-shaken from production
builds.

Refs: docs/planning/13-bootstrap-contract-project.md §4 rule 12,
§6 Phase 9.
```

---

## §9.6 — `.template/project.json`

### Goal

Committed metadata fingerprint identifying the project as a bootstrap-
contract template instance. Useful for future tooling that needs to
detect "_is this a tmpl-svelte-app project?_" without parsing
`package.json` heuristics.

### Files

- `.template/project.json` — new, committed.
- `scripts/bootstrap.ts` — fill in the `null` fields on first run.
- `tests/unit/template-project-json.test.ts` — assert the fingerprint
  shape.

### Behavior contract

Initial committed shape (in this commit):

```json
{
	"$schema": "https://tmpl-svelte-app.dev/schema/project.v1.json",
	"template": "tmpl-svelte-app",
	"templateVersion": "<reads from package.json or a constant>",
	"bootstrapContract": 1,
	"createdFromTemplateAt": null,
	"projectSlug": null
}
```

Bootstrap, on first run only, fills `createdFromTemplateAt` (UTC
timestamp) and `projectSlug` (from the answers). On subsequent runs,
bootstrap leaves the file alone.

The `$schema` URL doesn't have to resolve yet; it's a forward-compat
hook for a future schema doc.

### Source-of-truth precedence (locked, §3.6)

```
Observed files / runtime state
  > tracked config (package.json, src/lib/config/site.ts, static/admin/config.yml)
  > .template/project.json
  > .bootstrap.state.json
```

`.template/project.json` is supplementary. `package.json.name` remains
the source of truth for the project name.

### Acceptance

- [ ] File is committed and validates against the in-repo type.
- [ ] After `./bootstrap` on a fresh template clone, the `null` fields
      are populated.
- [ ] Re-running `./bootstrap` does not modify the file.
- [ ] No code reads `.template/project.json` as authoritative for the
      project name (the precedence is enforced).

### Commit message

```
feat(template): add .template/project.json fingerprint

Committed metadata identifying the project as a bootstrap-contract
template instance. Bootstrap fills createdFromTemplateAt and
projectSlug on first run; left alone on subsequent runs.

Source-of-truth precedence (planning doc §3.6): observed state >
tracked config > .template/project.json > .bootstrap.state.json.
package.json.name remains the source of truth for the project name;
this file is supplementary.

Refs: docs/planning/13-bootstrap-contract-project.md §3.6, §6 Phase 9.
```

---

## Pitfalls common to all extras

- **Do not auto-run any of these from bootstrap.** Bootstrap's contract
  is "_make the repo runnable_." Polish belongs to deliberate user
  action.
- **Idempotency.** Each extra must be safe to re-run. Use the same
  observed-state-not-remembered-state rule from the contract.
- **Test the failure modes you can.** Every extra here has at least one
  "_what if I run this on the wrong thing?_" failure mode (wrong DB,
  wrong working-tree state, wrong project). Test it.
- **`reset:dev` and `seed:dev` interact.** If you run them in the wrong
  order (`reset:dev` after `seed:dev` without `--reset`), the seeded
  rows will remain in the new container's empty DB after re-bootstrap.
  Document this in `reset:dev`'s help text.
