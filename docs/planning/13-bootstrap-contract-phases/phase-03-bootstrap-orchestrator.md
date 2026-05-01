# Phase 3 — `./bootstrap` Orchestrator

> Plan reference: §6 Phase 3, §7 (Bootstrap step contract), §4 (Hardening
> rules), §3 (Locked design decisions), §5.2 (Protected-file allowlist).
> **This is the centerpiece phase — read the full planning doc before
> starting.**

## Goal

Ship the user-facing installer contract: `./bootstrap` from a fresh clone
produces a working local site, idempotent, with explicit failure messages.

## Prereqs

- Phase 0, Phase 1, Phase 2 merged.

## Files to create / modify

| Path                           | Change                                           |
| ------------------------------ | ------------------------------------------------ |
| `bootstrap` (root, executable) | New shell wrapper.                               |
| `scripts/bootstrap.ts`         | New orchestrator. ~400 lines.                    |
| `package.json`                 | Add `"bootstrap": "bun scripts/bootstrap.ts"`.   |
| `.gitignore`                   | Add `.bootstrap.state.json` and `.env.backup.*`. |

## Behavior contract

### Root `bootstrap` script (bash)

```bash
#!/usr/bin/env bash
set -euo pipefail

command -v bun >/dev/null 2>&1 || {
  echo "FAIL BOOT-BUN-001 Bun is required."
  echo "NEXT  Install Bun (https://bun.sh) and re-run ./bootstrap."
  exit 1
}

# --dry-run must not mutate node_modules/.
for arg in "$@"; do
  if [ "$arg" = "--dry-run" ]; then
    if [ -d node_modules ]; then
      exec bun run bootstrap "$@"
    else
      echo "DRY-RUN ./bootstrap"
      echo "  WOULD run: bun install --frozen-lockfile"
      echo "  WOULD run: bun run bootstrap $*"
      echo "  Re-run without --dry-run to install dependencies and continue."
      exit 0
    fi
  fi
done

bun install --frozen-lockfile
exec bun run bootstrap "$@"
```

`chmod +x bootstrap` so it runs as `./bootstrap`.

### `scripts/bootstrap.ts` — step contract

Compose seven steps. Each step returns
`{ status: 'ok' | 'skip' | 'fail', code?, hint? }`. The orchestrator stops
at the first `fail`.

| #   | Step               | Skip condition (observed)                                                                                              | On failure                              |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 1   | Preflight          | —                                                                                                                      | `BOOT-BUN-001`; warn-only on dirty tree |
| 2   | Site init          | `package.json.name` differs from template name **and** no init-owned placeholders remain across §5.2 file set          | `BOOT-INIT-001`                         |
| 3   | `.env` materialize | All required keys present; never overwrites user-set keys                                                              | `BOOT-ENV-001`                          |
| 4   | Postgres provision | Existing `DATABASE_URL` reachable, OR matches bootstrap-owned container by name + labels and that container is healthy | `BOOT-PG-001..003`                      |
| 5   | Migrate            | Always runs (`drizzle-kit migrate` is idempotent)                                                                      | `BOOT-MIG-001`                          |
| 6   | Health verify      | Always runs `bun run check:db` after migrate                                                                           | `BOOT-DB-001..004`                      |
| 7   | Summary            | —                                                                                                                      | —                                       |

### Generated `.env` (when missing)

For project slug `acme-studio`:

```
DATABASE_URL=postgres://acme_studio_user:<random-32hex>@127.0.0.1:<dynamic-port>/acme_studio
ORIGIN=http://127.0.0.1:5173
PUBLIC_SITE_URL=http://127.0.0.1:5173
SESSION_SECRET=<random-32hex>
```

The dynamic port is from `provisionLocalPostgres()` (Phase 1). Identifiers
are sanitized per §3.1 (hyphens → underscores in db/user names; container
keeps hyphens).

**Never overwrite a user-set unreachable `DATABASE_URL`** (§4 rule 4).
Generate `DATABASE_URL` only when:

- it is missing from `.env`, or
- it matches a bootstrap-owned container recorded in
  `.bootstrap.state.json` _and_ confirmed by container labels.

### `.bootstrap.state.json` (gitignored, metadata only)

```json
{
	"createdAt": "2026-05-01T18:00:00Z",
	"createdContainer": "acme-studio-pg",
	"createdContainerPort": 55432,
	"createdEnvKeys": ["DATABASE_URL", "ORIGIN", "PUBLIC_SITE_URL", "SESSION_SECRET"],
	"bootstrapContractVersion": 1
}
```

**No `lastRunAt`.** Stable fields only. **No-op re-runs do not update
this file** (§4 rule 5). Write only when bootstrap actually creates or
changes an owned resource.

### Protected-file mutation guard

Before writing any file, consult `scripts/lib/protected-files.ts`. Anything
off-list aborts with `BOOT-GUARD-001`. The allowlist is in §5.2 of the
planning doc.

### CLI flags

- `--dry-run` — print every action, mutate nothing. (Shell wrapper handles
  the dependency-install side; the TS orchestrator's dry-run skips all
  writes.)
- `--ci` — refuse to prompt; require all answers via env vars
  (`BOOTSTRAP_PACKAGE_NAME`, `BOOTSTRAP_SITE_NAME`, `BOOTSTRAP_PRODUCTION_URL`,
  `BOOTSTRAP_META_DESCRIPTION`, `BOOTSTRAP_GITHUB_OWNER`,
  `BOOTSTRAP_GITHUB_REPO`, `BOOTSTRAP_SUPPORT_EMAIL`,
  `BOOTSTRAP_PROJECT_SLUG`, `BOOTSTRAP_PRODUCTION_DOMAIN`,
  `BOOTSTRAP_PWA_SHORT_NAME`) or `--answers-file`. Fail fast on missing.
- `--yes` — accept generated defaults without confirmation prompts.
- `--answers-file <path>` — newline-separated answers for the 10 init
  prompts.

### Summary block (printed at end of every successful run)

```
What just happened:
  OK   Dependencies installed
  OK   Site initialized
  OK   .env created at <path>
  OK   Postgres container <slug>-pg running on 127.0.0.1:<port>
  OK   Migrations applied
  OK   Database connectivity verified

Next:
  bun run dev          # start dev server at http://127.0.0.1:5173
  edit src/lib/styles/tokens.css       # brand colors / fonts
  edit content/pages/home.yml          # homepage content

CMS local editing:
  1. Run: bun run dev
  2. Open: http://127.0.0.1:5173/admin/index.html in a Chromium browser
  3. Click "Work with Local Repository"
  4. Select this project folder
  5. Edit content; commit changes with Git as usual

Launch blockers (run `bun run doctor` for detail):
  ⚠ static/og-default.png is still the template asset       (LAUNCH-OG-001)
  ⚠ ORIGIN and PUBLIC_SITE_URL still point to localhost     (LAUNCH-ENV-001/002)
  ⚠ static/admin/config.yml backend.repo still placeholder  (LAUNCH-CMS-001)

Bootstrap is safe to re-run. State recorded at .bootstrap.state.json.
```

The "Database connectivity verified" wording is deliberate — bootstrap
does **not** curl `/readyz` (§4 rule 9). `/readyz` is verified over HTTP
only by the Phase 8 CI smoke job.

`OK Site initialized` becomes `SKIP` when site init was already done. Same
for every step. Re-runs print `SKIP` lines, not new `OK` lines.

### Idempotency requirement

Re-running `./bootstrap` on a fully bootstrapped repo:

- Produces zero file changes (`git status` clean).
- Does not update `.bootstrap.state.json` (§4 rule 5).
- Exits 0.
- Prints `SKIP` for every step except the summary.

This is enforced by `check:bootstrap` (Phase 5a).

## Acceptance criteria

- [ ] `./bootstrap` from a fresh clone with Bun + Podman installed
      produces a runnable site (`bun run dev` works, `/healthz` and `/readyz`
      return 200).
- [ ] Re-running `./bootstrap` produces `git status` clean.
- [ ] `./bootstrap --dry-run` exits 0 with no mutations and a complete
      plan.
- [ ] `./bootstrap --ci` with all `BOOTSTRAP_*` env vars set runs
      end-to-end without prompting.
- [ ] Every failure path includes a `BOOT-*` code and a `NEXT:` line.
- [ ] Generated secrets never appear in stdout/stderr (verified manually
      with `./bootstrap --dry-run 2>&1 | grep -i secret` returning nothing
      meaningful).
- [ ] Bootstrap aborts with `BOOT-GUARD-001` if the orchestrator
      attempts to write outside the protected-file allowlist (test by
      introducing a deliberate write outside the allowlist and confirming
      the guard fires).
- [ ] `bun run validate` still passes.

## Commit message

```
feat(bootstrap): add ./bootstrap installer contract

User-facing installer that converges a fresh clone into a runnable local
site. Composes the Phase 1 primitives and the Phase 2 check:db helper
into a 7-step contract: preflight → init:site → .env → Postgres → migrate
→ health verify → summary.

Locked behavior:
- Idempotent. Re-running on a fully-bootstrapped repo produces zero file
  changes and exits 0.
- Skips are observed-state. .bootstrap.state.json is metadata only and
  does not update on no-ops.
- Never overwrites a user-set unreachable DATABASE_URL.
- Protected-file allowlist enforced at write time (BOOT-GUARD-001).
- Generated DATABASE_URL uses sanitized identifiers and a dynamic host
  port in 50000–55000 keyed off slug hash.
- Container labeled tmpl-svelte-app.bootstrap=true so reset:dev (Phase 9)
  can identify what it owns.
- Stable BOOT-* codes with NEXT: lines on every failure.
- Generated secrets never logged.

Flags: --dry-run, --ci (with BOOTSTRAP_* env vars), --yes,
--answers-file.

The summary block surfaces the most likely remaining launch blockers
(real OG image, real ORIGIN/PUBLIC_SITE_URL, real CMS backend.repo).
Full launch-readiness gating is delegated to validate:launch.

Refs: docs/planning/13-bootstrap-contract-project.md §3, §4, §5.2, §7.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Pitfalls

- **The protected-file guard is not optional.** It's the safety net that
  prevents a future bug in init:site or env-file from writing somewhere
  unexpected. Wire it at the call site of every `writeFile`, not just at
  the top.
- **Step 5 (migrate) always runs.** Do not parse `drizzle-kit migrate`
  output to decide whether to skip. The command is already idempotent.
- **The summary's "Database connectivity verified" line must not say
  "/readyz."** Bootstrap calls `check:db` directly. The CI smoke job
  (Phase 8) is where /readyz is curled.
- **`--dry-run` in the shell wrapper is the first responsibility.** The
  TS orchestrator can also have a `--dry-run` mode, but the wrapper must
  catch it _before_ `bun install` runs to avoid mutating `node_modules/`.
- **Sanitize, then build the URL.** Order: slug `acme-studio` → user
  `acme_studio_user` → db `acme_studio` → URL
  `postgres://acme_studio_user:<pw>@127.0.0.1:<port>/acme_studio`.
  Container name keeps hyphens: `acme-studio-pg`.
- **Honor the runtime preference order.** Existing reachable DB → Podman
  → Docker → fail. `BOOTSTRAP_CONTAINER_RUNTIME` overrides.
- **Don't add `secrets:check` to `validate` here.** That happens in
  Phase 5a, alongside the `check:bootstrap` test harness.
