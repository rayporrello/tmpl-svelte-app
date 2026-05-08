<!-- 2026-05-08: Historical planning note. Shared-infrastructure cleanup supersedes per-site production Postgres/worker/backup/restore assumptions; see docs/planning/adrs/ADR-031-shared-infrastructure-cell.md. -->

# Phase 1 — Script Primitives

> Plan reference: §5.1 (New files), §6 Phase 1, §8 (Error code registry),
> §9 (Launch-blockers manifest).

## Goal

Land all `scripts/lib/*` helpers, the error-code registry, and the
launch-blockers manifest scaffolding. **No user-facing behavior change**
in this phase — no new `package.json` scripts, no `./bootstrap`. The
orchestrator that uses these primitives ships in Phase 3.

## Prereqs

- Phase 0 merged (so the format gate is active).

## Files to create

All under `scripts/lib/` unless noted. Each file gets a unit test under
`tests/unit/<name>.test.ts`.

| File                             | Purpose                                                                                                                                                                                                                                                               |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/lib/run.ts`             | Subprocess wrapper. `run(cmd, args, opts)` returns `{ code, stdout, stderr, durationMs }`. Streams output by default; supports `capture: true` to suppress. Redacts any value matching the secret-redaction regex (DATABASE_URL passwords, hex-32 strings) from logs. |
| `scripts/lib/print.ts`           | Status vocabulary used by every script. Exports `ok(label)`, `skip(label, reason?)`, `run(label)`, `fail(code, msg, hint)`, `summary(blocks)`. Output is plain text; check marks (✓/⚠/✗) are allowed in CLI output.                                                   |
| `scripts/lib/env-file.ts`        | `readEnv(path)`, `mergeEnv(existing, additions)`, `writeEnv(path, env)`. **Must never overwrite a key that already exists.** Honors dotenv quoting rules.                                                                                                             |
| `scripts/lib/preflight.ts`       | `checkBun()` (≥ 1.1), `detectContainerRuntime()` (returns `'podman' \| 'docker' \| null`, honoring `BOOTSTRAP_CONTAINER_RUNTIME` env var; default `auto` → Podman → Docker), `gitWorkingTreeDirty()` (warn-only).                                                     |
| `scripts/lib/postgres-dev.ts`    | `provisionLocalPostgres(opts)` — see contract below.                                                                                                                                                                                                                  |
| `scripts/lib/site-state.ts`      | `inspectRepo()` returning `{ initSiteDone, placeholdersByFile, envPresent, envParsed, containerExists, containerHealthy, schemaApplied }`. Reads files; never writes.                                                                                                 |
| `scripts/lib/diagnose-pg.ts`     | `diagnosePostgresError(err)` — translates `28P01`, `42501`, `3D000` and connection refused into `{ code: 'BOOT-DB-002', hint: 'NEXT: …' }`.                                                                                                                           |
| `scripts/lib/errors.ts`          | The error-code registry — see below.                                                                                                                                                                                                                                  |
| `scripts/lib/launch-blockers.ts` | The manifest — type and stub list (real `check` functions land in Phase 7).                                                                                                                                                                                           |
| `scripts/lib/protected-files.ts` | Static allowlist of paths bootstrap may write to (see plan §5.2). Exports `isAllowed(path: string): boolean`.                                                                                                                                                         |

### `postgres-dev.ts` contract

`provisionLocalPostgres(opts)` returns
`{ runtime: 'podman' \| 'docker', container, port, databaseUrl }` or throws
with a `BOOT-PG-*` code. Behavior:

1. If `opts.existingDatabaseUrl` is set and reachable, skip provisioning
   and return its connection info.
2. Pick a host port via §3.3 (start = `50000 + (hash(slug) % 5000)`,
   incrementally try until free, wrap within `[50000, 55000]`,
   `BOOT-PG-003` on exhaustion).
3. Pull image `docker.io/library/postgres:17-alpine` (constant export).
4. Start container `<slug>-pg` with these labels:
   ```
   --label tmpl-svelte-app.bootstrap=true
   --label tmpl-svelte-app.project-slug=<slug>
   --label tmpl-svelte-app.contract-version=1
   ```
   Bind to `127.0.0.1:<port>:5432` only.
5. Set `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` from
   sanitized identifiers (hyphens → underscores for db/user; container
   keeps hyphens).
6. Wait for readiness via `<runtime> exec <container> pg_isready -U <user> -d <db>`,
   30 s timeout; **never assume host `pg_isready` exists**.

Re-running with an already-existing bootstrap-owned container (matched by
**both** name and labels) reuses it without recreation.

### `errors.ts` registry

Export a `const` map keyed by code:

```ts
export const ERRORS = {
	'BOOT-BUN-001': 'Bun missing or below 1.1',
	'BOOT-ENV-001': '.env exists but malformed',
	'BOOT-INIT-001': 'init:site failed or left placeholders in init-owned files',
	'BOOT-PG-001': 'no reachable Postgres and no container runtime',
	'BOOT-PG-002': 'bootstrap-owned container exists but unhealthy or labels mismatch',
	'BOOT-PG-003': 'port collision; could not allocate within 50000–55000',
	'BOOT-DB-001': 'DATABASE_URL parse failed',
	'BOOT-DB-002': 'DB auth failed (Postgres SQLSTATE 28P01)',
	'BOOT-DB-003': 'database missing (Postgres SQLSTATE 3D000)',
	'BOOT-DB-004': 'schema privilege error (Postgres SQLSTATE 42501)',
	'BOOT-MIG-001': 'drizzle-kit migrate failed',
	'BOOT-GUARD-001': 'bootstrap attempted to mutate a non-allowlisted file',
	'LAUNCH-OG-001': 'static/og-default.png is still the template asset',
	'LAUNCH-SEO-001': 'site.defaultTitle still placeholder',
	'LAUNCH-CMS-001': 'static/admin/config.yml backend.repo still placeholder',
	'LAUNCH-ENV-001': 'ORIGIN points to localhost',
	'LAUNCH-ENV-002': 'PUBLIC_SITE_URL points to localhost',
	'LAUNCH-APPHTML-001': 'src/app.html title still template fallback',
	'LAUNCH-BACKUP-001': 'production backup config missing',
	'LAUNCH-EMAIL-001': 'contact form still console-only (POSTMARK_SERVER_TOKEN unset)',
} as const;
```

### `launch-blockers.ts` shape

```ts
export type LaunchBlocker = {
	id: keyof typeof ERRORS;
	label: string;
	severity: 'required' | 'recommended';
	check: () => Promise<{ status: 'pass' | 'warn' | 'fail'; detail?: string }>;
	fixHint: string;
	docsPath?: string;
};

export const LAUNCH_BLOCKERS: LaunchBlocker[] = [
	// Stub entries: `check` returns { status: 'pass' } unconditionally.
	// Phase 7 fills in real check logic.
];
```

Stubs only in this phase. Phase 7 implements each `check`.

## Behavior contract

- **No `scripts/lib/*` file imports anything under `src/`.** Helpers must
  be usable by scripts that run in environments where the SvelteKit app
  has never been built. (Phase 2 introduces `scripts/check-db-health.ts`,
  which is the _only_ place app code is imported, deliberately and
  through a documented seam.)
- Every helper has a unit test that exercises its happy path and at least
  one failure mode.
- No new entries in `package.json` `scripts`. (Phase 2 adds `check:db`;
  Phase 3 adds `bootstrap`. Not now.)

## Acceptance criteria

- [ ] All files in §5.1 of the planning doc that belong to this phase are
      created.
- [ ] Each helper has a unit test under `tests/unit/`.
- [ ] No `scripts/lib/*` file imports from `src/`.
- [ ] `bun run validate` passes (TypeScript, lint, unit tests, e2e).
- [ ] No new user-facing scripts in `package.json`.
- [ ] `bun run test` reports the new unit tests passing.
- [ ] Manual sanity: import `errors.ts` and `launch-blockers.ts` from a
      scratch script and confirm the shapes typecheck.

## Commit message

```
feat(scripts/lib): add bootstrap primitives, error registry, manifest stubs

Lay down the helpers the bootstrap orchestrator (Phase 3) and doctor
command (Phase 4) will compose:

- run.ts, print.ts, env-file.ts, preflight.ts, postgres-dev.ts,
  site-state.ts, diagnose-pg.ts, protected-files.ts
- errors.ts: stable BOOT-* and LAUNCH-* code registry
- launch-blockers.ts: manifest type + stubs (real checks land in Phase 7)

No user-facing behavior change. No new package.json scripts. No imports
from src/. Each helper has a unit test.

Refs: docs/planning/13-bootstrap-contract-project.md §5.1, §8, §9.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Pitfalls

- **Don't reach into `src/`.** It's tempting to import the existing
  Drizzle client or env validator for `postgres-dev.ts`. Resist. The
  orchestrator runs against repos that may not have been built yet.
- **Sanitize identifiers correctly.** `acme-studio` → db `acme_studio`,
  user `acme_studio_user`, container `acme-studio-pg`. Hyphens are valid
  in container names but invalid (without quoting) in Postgres
  identifiers. There is one test for this in the unit suite.
- **Honor `BOOTSTRAP_CONTAINER_RUNTIME`.** `auto` → Podman → Docker; an
  explicit value short-circuits detection.
- **Secret redaction in `run.ts` matters.** A future failure in
  `postgres-dev.ts` could spew `DATABASE_URL` to stderr. The redaction
  layer is the safety net; don't skip its tests.
