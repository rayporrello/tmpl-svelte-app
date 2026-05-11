<!-- 2026-05-08: Historical planning note. Shared-infrastructure cleanup supersedes per-site production Postgres/worker/backup/restore assumptions; see docs/planning/adrs/ADR-031-shared-infrastructure-cell.md. -->

# Phase 8 — Docs Flip + CI Hardening + `launch:check` Alias

> Plan reference: §6 Phase 8, §11 (PR sequence).

## Goal

Make the bootstrap path the documented default. Add a `bootstrap-smoke`
CI job that exercises the full path on every push to `main`, and confirm
the manual Podman integration smoke from Phase 5b remains available.

This phase **also adds the `launch:check` alias** to `package.json`
because the README and getting-started rewrite below references it. The
four-command model (`bootstrap`, `doctor`, `validate`, `launch:check`)
must be coherent at the moment the docs flip. The alias was originally
parked in Phase 9 §9.1 — that section is dropped (see
[phase-09-extras.md](phase-09-extras.md)).

After this phase, "_use this template_" actually means
`./bootstrap && bun run dev`.

## Prereqs

- Phase 0–7 merged.

## Files to modify

| Path                                           | Change                                                                                                                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                                 | Add `"launch:check": "bun run validate:launch"` alongside the other scripts. (Was previously parked in Phase 9 §9.1; moved up because the docs rewrite below references it.)     |
| `README.md`                                    | Replace the "Using this template" lead with the bootstrap path.                                                                                                                  |
| `docs/getting-started.md`                      | New top: `git clone → cd → ./bootstrap → bun run dev`. Move the existing 12 manual steps under a heading "Manual setup (advanced — understand or override what bootstrap does)." |
| `.github/workflows/ci.yml`                     | Add `bootstrap-smoke` job that runs on `main` push only. The existing `validate` job continues to run on every PR.                                                               |
| `.github/workflows/bootstrap-podman-smoke.yml` | (Created in Phase 5b — confirm wired up.)                                                                                                                                        |

## Behavior contract

### README "Using this template" rewrite

Replace the current section's lead with:

````markdown
## Using this template

```bash
git clone git@github.com:<you>/<your-project>.git
cd <your-project>
./bootstrap
bun run dev
```
````

`./bootstrap` provisions a local Postgres container, generates a working
`.env` with sane local defaults, runs database migrations, and prints
the next things to customize. It is idempotent and safe to re-run.

For local CMS editing in a Chromium browser, follow the
Work-with-Local-Repository flow at
[docs/cms/README.md](../../cms/README.md#local-development--work-with-local-repository).

Before deploying:

```bash
bun run launch:check   # release-grade gate; alias of validate:launch
```

See [docs/getting-started.md](../../getting-started.md) for the full
guide, including the manual setup path if you want to understand or
override what bootstrap does.

````

Keep the rest of the README as-is.

### `docs/getting-started.md` rewrite

New top-of-document:

```markdown
# Getting Started

The fast path:

```bash
git clone git@github.com:<you>/<your-project>.git
cd <your-project>
./bootstrap
bun run dev
````

That gets you a working local site with Postgres, migrations applied,
`.env` populated, and the contact form live. Edit
`src/lib/styles/tokens.css` for brand colors and `content/pages/home.yml`
for homepage content; both changes hot-reload.

Before launch:

```bash
bun run launch:check   # release-grade pre-deploy gate
```

If you want to understand each step or override what bootstrap does,
the manual path follows below.

---

## Manual setup (advanced)

````

The existing 12 steps move under that heading, unchanged in content.

### CI — `bootstrap-smoke` job

Add to `.github/workflows/ci.yml`:

```yaml
  bootstrap-smoke:
    name: Bootstrap smoke (real Postgres)
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: tmpl_smoke_user
          POSTGRES_PASSWORD: tmpl_smoke_pw
          POSTGRES_DB: tmpl_smoke
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U tmpl_smoke_user -d tmpl_smoke"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    steps:
      # Action SHAs match the existing pinning style in .github/workflows/ci.yml.
      # Verify against current main before merging — they may need a refresh.
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4
      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2
        with:
          bun-version-file: package.json
      - run: bun install --frozen-lockfile
      - name: Run ./bootstrap --ci against the service Postgres
        env:
          DATABASE_URL: postgres://tmpl_smoke_user:tmpl_smoke_pw@127.0.0.1:5432/tmpl_smoke
          BOOTSTRAP_PACKAGE_NAME: tmpl-bootstrap-smoke
          BOOTSTRAP_SITE_NAME: Bootstrap Smoke
          BOOTSTRAP_PRODUCTION_URL: https://bootstrap-smoke.example.com
          BOOTSTRAP_META_DESCRIPTION: Bootstrap smoke description.
          BOOTSTRAP_GITHUB_OWNER: bootstrap-smoke
          BOOTSTRAP_GITHUB_REPO: tmpl-bootstrap-smoke
          BOOTSTRAP_SUPPORT_EMAIL: hello@bootstrap-smoke.example.com
          BOOTSTRAP_PROJECT_SLUG: tmpl-bootstrap-smoke
          BOOTSTRAP_PRODUCTION_DOMAIN: bootstrap-smoke.example.com
          BOOTSTRAP_PWA_SHORT_NAME: Smoke
        run: ./bootstrap --ci
      - run: bun run build
      - name: Start built server
        env:
          DATABASE_URL: postgres://tmpl_smoke_user:tmpl_smoke_pw@127.0.0.1:5432/tmpl_smoke
          ORIGIN: http://127.0.0.1:3000
          PUBLIC_SITE_URL: http://127.0.0.1:3000
          PORT: 3000
        run: bun run serve.js &
      - name: Wait for /healthz
        run: |
          for i in $(seq 1 30); do
            curl -sf http://127.0.0.1:3000/healthz && exit 0
            sleep 1
          done
          exit 1
      - run: curl -sf http://127.0.0.1:3000/readyz
      - run: bun run validate
````

Notes:

- The service Postgres uses port 5432 because GitHub-hosted runners do
  not let you run Podman/Docker arbitrarily for the bootstrap container.
  This is OK because the bootstrap orchestrator's "existing reachable
  `DATABASE_URL`" branch (§7 step 4) means it skips container
  provisioning entirely when the service Postgres is already there.
- The `BOOTSTRAP_*` env vars are deterministic dummy values for
  non-interactive `--ci` mode.
- The whole job runs only on `main` push, not on every PR. Per-PR
  validation happens in the existing `validate` job.

## Acceptance criteria

- [ ] `package.json` has `"launch:check": "bun run validate:launch"`.
- [ ] `bun run launch:check` produces identical output to
      `bun run validate:launch`.
- [ ] README's "Using this template" leads with the bootstrap path and
      references `bun run launch:check`.
- [ ] `docs/getting-started.md` opens with the four-line happy path; the
      old 12 steps live under "Manual setup (advanced)."
- [ ] CI `bootstrap-smoke` job runs on `main` push.
- [ ] Job exits 0 on a clean `main` push and fails on any regression
      introduced by intentionally breaking bootstrap (smoke-test by reverting
      one BOOT-\* code in the script, confirming CI red, restoring).
- [ ] CI snippet uses repo's pinned-SHA + `bun-version-file: package.json`
      style; does not use floating tags or `bun-version: latest`.
- [ ] The manual Podman workflow from Phase 5b is wired up for a
      self-hosted Linux runner.
- [ ] `bun run validate` passes.

## Commit message

```
feat(docs+ci): flip getting-started to bootstrap-first; add bootstrap-smoke

Docs:
- README "Using this template" leads with ./bootstrap and references
  bun run launch:check as the release-grade gate.
- docs/getting-started.md opens with the four-line happy path; the
  existing 12 manual steps move under "Manual setup (advanced)."

Scripts:
- Add `launch:check` alias = `bun run validate:launch`. The four-command
  model (bootstrap, doctor, validate, launch:check) must be coherent at
  the moment the docs flip.

CI:
- New bootstrap-smoke job on main push: service Postgres,
  ./bootstrap --ci with deterministic BOOTSTRAP_* env vars,
  bun run build, start server, curl /healthz and /readyz, bun run
  validate.
- CI uses the repo's pinned-SHA + bun-version-file: package.json
  conventions to match the existing validate job.
- Manual Podman integration workflow (from Phase 5b) confirmed wired for
  a self-hosted Linux runner.

After this commit, "use this template" actually means clone, run
./bootstrap, run bun run dev.

Refs: docs/planning/13-bootstrap-contract-project.md §6 Phase 8.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Pitfalls

- **Don't delete the manual path.** Keeping it under "Manual setup
  (advanced)" preserves both the override path and the documentation of
  what bootstrap does step-by-step. Future-you will need both.
- **The CI service Postgres is on port 5432, not a dynamic port.** That's
  OK because bootstrap's Step 4 short-circuits when an existing
  `DATABASE_URL` is reachable. Don't try to make the bootstrap-smoke job
  exercise the container-provisioning branch — that's the manual Podman
  smoke's responsibility.
- **`/readyz` curl.** This is the first time `/readyz` is verified over
  HTTP in any automation. The wait loop on `/healthz` is necessary
  because the Bun process needs a moment to bind. 30 seconds is plenty.
- **README and getting-started must agree.** If they drift, the agent
  rules in `AGENTS.md` start contradicting the real first-run flow. Keep
  them in lockstep.
- **Action SHAs go stale.** The pinned SHAs in this prompt mirror what
  `.github/workflows/ci.yml` uses today. If `main` has bumped them when
  this phase runs, copy the current SHAs from `ci.yml` rather than the
  ones written here. Do not regress to floating tags like
  `actions/checkout@v4`.
- **`bun-version-file: package.json` is the locked convention.** The
  template's `package.json` declares `"engines": { "bun": ">=1.1" }` and
  `"packageManager": "bun@1.3.9"`; `setup-bun` reads from there. Do not
  use `bun-version: latest` — it diverges from local dev and from the
  rest of the repo's CI.
