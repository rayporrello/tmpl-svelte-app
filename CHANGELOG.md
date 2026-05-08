# Template changelog

This changelog tracks security-, operations-, and contract-relevant changes to
the template itself. It is intentionally lightweight — entries are appended in
reverse-chronological order, grouped by date, with enough detail that a project
forked from an earlier snapshot can decide whether to cherry-pick a given
change.

This is **not** a semver release log. The template is clone-and-customize, not
upstream-managed; downstream projects pull improvements selectively rather than
running a `template update` command.

When to add an entry:

- Security default changes (HSTS, CSP, headers, secrets handling)
- Runtime contract changes (env vars, adapter, container, deploy artifacts)
- CI gate changes (Trivy thresholds, new required checks)
- Backup or recovery posture changes
- Bun, Postgres, or other pinned-tool version bumps
- Removal or deprecation of a documented capability

When to skip:

- Internal refactors with no observable contract change
- Doc rewrites that do not change behavior
- Test-only changes

---

## 2026-05-08 — Architecture redirect: shared infrastructure for client websites

The website template no longer ships per-site Postgres, worker, or backup tooling. Production infrastructure is owned by a separate `web-data-platform` repo. Local development is unchanged.

- Redirected the website template from per-site infrastructure to the shared `web-platform` model.
- Removed production Postgres, worker, backup, PITR, restore, and site-local network artifacts from the website repo.
- Simplified the production env contract to web runtime values rendered by the web-data-platform repo.
- Made `automation:worker` a one-shot local development tool and removed daemon mode.
- Collapsed Drizzle migrations to a fresh baseline because no live data exists.
- Updated deploy, preflight, launch, doctor, health, CI, tests, docs, and ADRs for the new shared website data infrastructure model.

---

## 2026-05-05 — Pass 4 (consistency sweep + ADR-022)

Closing sweep after Pass 3 to align every reference and registry with
the new architecture. No behavior changes; all stale references and
missing cross-links resolved.

### Code

- **`scripts/lib/postgres-dev.ts`**: `POSTGRES_IMAGE` bumped from
  `postgres:17-alpine` to `postgres:18-alpine` so the local-bootstrap
  Postgres major matches the production image (which is
  `postgres:18-bookworm` + WAL-G in the bundled path).
- **`scripts/doctor.ts`**: required-files list updated to match the
  Pass 3 deploy artifacts. Replaced
  `deploy/systemd/automation-worker.{service,timer}` (deleted in Pass 3)
  with `deploy/Containerfile.postgres`,
  `deploy/quadlets/worker.container`, and the four
  `deploy/systemd/backup-{base,check}.*` units. Without this, `bun run
doctor` would have falsely flagged the deleted worker timer as
  missing.

### CI

- **`bootstrap-podman-smoke` (`.github/workflows/ci.yml`)**: bootstrap-
  smoke service Postgres bumped to `postgres:18-alpine`.
- **`init-site-acceptance` change-detection paths**: removed deleted
  `deploy/systemd/automation-worker.{service,timer}` and added the new
  artifacts (`deploy/Containerfile.postgres`,
  `deploy/quadlets/worker.container`, `n8n.container`, `n8n.volume`,
  `deploy/systemd/backup-base.{service,timer}`,
  `backup-check.{service,timer}`). The init-site acceptance gate now
  fires when any of these files change.

### Docs

- **`README.md`**: deployment artifact table now lists every Pass 3
  file (`Containerfile.postgres`, `worker.container`, `n8n.*`,
  `backup-base.*`, `backup-check.*`). The legacy `backup.*` is labeled
  "convenience export" so the production path is unambiguous. The
  Bun-first workflow command list now includes
  `automation:worker:daemon`, `backup:base`, `backup:wal:check`,
  `backup:pitr:check`, `backup:restore:drill`, and `n8n:enable`.
- **`docs/deployment/README.md`**: artifact table rewritten in the
  same shape — drops the deleted automation-worker rows and adds the
  Pass 3 entries with one-line purposes each.
- **`docs/getting-started.md`**: postgres-17 mentions in the local-dev
  Quick Start bumped to postgres-18 (Podman, Docker, and brew package
  names). The "next steps" now references the worker container, the
  PITR backup timers, and the optional per-client n8n bundle.
- **`docs/documentation-map.md`**: rebuilt the Postgres, automation,
  and backup rows for the new artifacts. Added a dedicated
  "Per-client n8n bundle" row. The map now references ADR-022 and
  links to `n8n-workflow-contract.md` and `architecture.md`.
- **`docs/deployment/runbook.md`**: "common operations" cheat sheet
  swapped the now-stale "Run worker once / Check worker timer" entries
  for the new container-shape commands (`podman exec` for manual
  replay, `journalctl --user -u <project>-worker -f` for live tail,
  `systemctl --user list-timers | grep <project>-backup` for the
  backup cadence).
- **`docs/automations/n8n-workflow-contract.md`**: corrected the
  journalctl unit name from `<project>-automation-worker` to
  `<project>-worker` (the daemon container's unit name).

### New ADR

- **`docs/planning/adrs/ADR-022-pitr-backup-strategy.md`**: documents
  the decision to use WAL-G v3.0.8 + Cloudflare R2 with 14-day PITR
  retention, the trade-off matrix vs pgBackRest, why R2 (no egress
  fees, existing operator stack), accepted risks, and alternatives
  considered. ADR-021 was already taken (local-bootstrap-contract);
  this is the next number in sequence.

### Migration

No new migration steps for downstream projects — Pass 4 is consistency,
not contract change. Projects that already pulled Pass 3 are aligned.

---

## 2026-05-05 — Pass 3 (PITR backups, worker container, per-client n8n bundle)

The largest architectural change in the template's lifetime. Replaces the
ad-hoc backup story with WAL-G + R2 PITR, moves the automation worker from
systemd timer to per-site container, and adds an opt-in n8n bundle that
shares the existing per-client Postgres via a separate database.

### Postgres + WAL-G PITR

- **Postgres bumped to 18-bookworm.** `deploy/Containerfile.postgres` builds
  on `postgres:18-bookworm` (replaces `postgres:17-alpine`). bookworm needed
  because WAL-G ships glibc binaries.
- **WAL-G v3.0.8 baked into the bundled Postgres image.** Pinned by version
  AND SHA-256 (`f30544c5…` amd64, `794d1a81…` aarch64). The image is built
  by CI from `deploy/Containerfile.postgres`, scanned by Trivy CRITICAL,
  smoke-tested with `wal-g --version`, and pushed to GHCR alongside the
  web image.
- **archive_command + archive_timeout=60.** WAL ships to R2 every minute or
  whenever a 16 MB segment fills, whichever fires first. Worst-case RPO is
  ~1 minute on a healthy site.
- **R2-named env contract.** User-facing: `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET`, `R2_PREFIX`,
  `PITR_RETENTION_DAYS`. The Quadlet maps them to the `AWS_*`/`WALG_*`
  names WAL-G actually reads.
- **Daily base backup + 6-hour PITR freshness check.** New systemd timers
  in `deploy/systemd/backup-base.{service,timer}` and
  `backup-check.{service,timer}`. Backed by new bash scripts:
  `scripts/backup-base.sh`, `scripts/backup-wal-check.sh`,
  `scripts/backup-pitr-check.sh`.
- **`bun run backup:restore:drill`.** Non-destructive drill — spins up a
  temp Postgres container off the same image, restores latest base,
  replays WAL to "now-1h", runs sanity SELECT, tears down. Run quarterly
  per `docs/operations/restore.md`. **Not** wired to a timer; an
  automated drill that fails silently is worse than none.
- **`PREFLIGHT-BACKUP-PITR-001`.** New deploy preflight gate fails when
  the bundled Postgres path is selected without R2 credentials, or when
  the backup timers are missing.

### Worker as per-site container

- **Migrated `automation:worker` from systemd timer to a Quadlet
  container.** New `deploy/quadlets/worker.container` runs the same web
  image with `bun run scripts/automation-worker.ts -- --daemon`. The
  worker is now part of the per-client bundle so a site's runtime can be
  paused / migrated as one unit.
- **Daemon mode.** New `runAutomationWorkerDaemon()` polls every
  `--poll-interval-seconds` (default 30s), handles SIGTERM/SIGINT
  cleanly (finishes current batch before exit), and logs each batch's
  outcome on one line for journald.
- **Deleted `deploy/systemd/automation-worker.{service,timer}`.** Two
  patterns for the same thing creates future confusion.
- **`PREFLIGHT-WORKER-001` rewritten** to validate the new
  `deploy/quadlets/worker.container` artifact instead of the systemd
  timer.
- **`bun run automation:worker:daemon`** added as a top-level script
  alias.

### Per-client n8n bundle

- **`deploy/quadlets/n8n.container` + `n8n.volume`.** Optional Quadlets
  for clients who run their own n8n. Pinned to `n8nio/n8n:1.84.1`, ships
  with `EXECUTIONS_DATA_PRUNE=true` and a 14-day prune horizon by
  default.
- **`bun run n8n:enable`** (`scripts/enable-n8n.sh`). Idempotent helper
  that creates `<project>_n8n` database, `<project>_n8n_user` role with a
  generated password, grants, and prints the env shape to add to
  `secrets.yaml`. The n8n role cannot read the app's `<project>_app`
  database; the app role cannot read n8n's credentials.
- **One Postgres container per client, two databases inside.** n8n shares
  the existing `<project>-postgres` container — no second Postgres. WAL-G
  PITR captures both databases atomically, so a restore puts the site
  data and n8n state back to the same moment in time.
- **Caddyfile snippet** for the n8n editor + webhook (commented;
  uncomment when activating). Webhook surface is public + Header Auth;
  editor is locked down behind Caddy `basic_auth` so credentials aren't
  exposed to the public internet.

### Architecture doc

- **`docs/operations/architecture.md`** — the canonical "what runs where"
  reference. Includes the per-client bundle map, container count for a
  typical 5-client / 3-automation host, the database-boundary layout
  inside `<project>-postgres`, and the rule that n8n is one-per-client.

### Docs

- `docs/operations/backups.md` — restructured around PITR-first, with
  pg_dump documented as the convenience export path. Restore drill is
  the load-bearing operational practice.
- `docs/operations/restore.md` — added a complete PITR restore runbook
  (8 steps, fully scripted, with rollback). pg_dump restore stays as
  the fallback path.
- `docs/deployment/runbook.md` — updated to install the worker container,
  backup timers, and (optionally) n8n quadlets per site.

### CI

- **New `postgres-image` job.** Builds `deploy/Containerfile.postgres`
  on every push to main, runs Trivy CRITICAL (blocking), runs
  `wal-g --version` smoke, pushes to GHCR as
  `<repo>-postgres:<sha>`.

### Env contract

- New optional vars (env.ts schema + .env.example + secrets.example.yaml):
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET`,
  `R2_PREFIX`, `PITR_RETENTION_DAYS`, `N8N_ENABLED`, `N8N_ENCRYPTION_KEY`,
  `N8N_HOST`, `N8N_PROTOCOL`.

### Tests

- New tests for worker daemon flag parsing + poll interval defaults.
- Updated deploy-preflight fixtures: ready project now has a custom
  Postgres image, worker.container instead of systemd worker, and the
  full R2\_\* env. Added mutation cases for `PREFLIGHT-BACKUP-PITR-001`.
- doctor + ready-to-launch fixtures extended with R2\_\* env so the new
  PITR check passes.

### Migration notes for downstream projects

- Run `bun run init:site` again (or update by hand) to pick up the new
  Quadlets: `worker.container`, `n8n.container`, `n8n.volume`, and the
  rewritten `postgres.container`.
- Render the new R2\_\* env values into the project's secrets file before
  the next `bun run deploy:preflight` run.
- Build the Postgres image: CI does this on the next push, or run
  `podman build -f deploy/Containerfile.postgres -t <project>-postgres:<sha> .`
  locally.
- On the host: install `worker.container`, `backup-base.{service,timer}`,
  `backup-check.{service,timer}`, then disable and remove
  `<project>-automation-worker.{service,timer}`. Run
  `bun run backup:restore:drill` once before trusting PITR.

---

## 2026-05-05 — Pass 2 (n8n-first reliability)

### Security / reliability

- **Production preflight rejects silently-misconfigured automation.**
  `bun run deploy:preflight` and `bun run check:launch` now both fail when
  `AUTOMATION_PROVIDER` is `n8n` or `webhook` without a URL+secret, or when
  it is `console` (which is dev-only). The new gates surface as
  `PREFLIGHT-AUTOMATION-001` and `LAUNCH-AUTOMATION-001`. Set
  `AUTOMATION_PROVIDER=noop` explicitly when a site has no automation needs.
- **Header auth is the new default for n8n delivery.** The site sends
  `X-Site-Auth: <secret>` by default, matching n8n's built-in Header Auth
  credential — no Code node required on the receiver. HMAC body signing
  remains supported as a stronger opt-in via `N8N_WEBHOOK_AUTH_MODE=hmac`.
  This is a **default change**: workflows that were verifying
  `X-Webhook-Signature` need either to switch to Header Auth or to set
  `N8N_WEBHOOK_AUTH_MODE=hmac` to keep the old behavior.
- **Observability headers added to every webhook request.**
  `X-Site-Event-Id`, `X-Site-Event-Type`, `X-Site-Timestamp` are now sent
  alongside the JSON body so receivers can deduplicate and correlate
  without parsing the envelope.

### Tooling

- **Worker logs a single loud warning when its provider is misconfigured.**
  `warnIfAutomationConfigIncomplete()` runs at worker startup; an operator
  who sees `[automation:worker] provider="n8n" is misconfigured` in
  journald has actionable output instead of silent skipped events.

### Env contract

- New: `N8N_WEBHOOK_AUTH_MODE`, `N8N_WEBHOOK_AUTH_HEADER`,
  `AUTOMATION_WEBHOOK_AUTH_MODE`, `AUTOMATION_WEBHOOK_AUTH_HEADER` (all
  optional). Defaults: `header` mode with `X-Site-Auth` header name.
  `.env.example` and `secrets.example.yaml` updated.

### Docs

- New: `docs/automations/n8n-workflow-contract.md` — the wire-level
  contract: payload, headers, auth modes, idempotency, replay,
  dead-letter handling, what to do when n8n is down.
- `docs/automations/README.md` rewritten for n8n-first framing. Webhook
  remains an escape hatch but is no longer presented as equally preferred.
- `docs/automations/security-and-secrets.md` covers both auth modes and
  the new env contract; production checklist is stricter.
- `docs/observability/n8n-workflows.md` updated to reference the contract
  doc and to call out per-client n8n isolation.

---

## 2026-05-05 — Pass 1 (safety baseline)

### Security

- **HSTS preload removed from default.** `deploy/Caddyfile.example` and
  `src/lib/server/security-headers.ts` now ship `Strict-Transport-Security`
  with `max-age=31536000` only — no `includeSubDomains`, no `preload`. Both
  stronger forms are documented opt-ins in `docs/deployment/runbook.md`. The
  HSTS preload list is a one-way browser-shipped commitment that is
  inappropriate as a template default.

### Tooling

- **Bun pinned to 1.3.13.** `packageManager` is `bun@1.3.13`; `engines.bun`
  is `>=1.3.13 <1.4.0`. The `preinstall` guard in `scripts/ensure-bun.ts`
  enforces both that the package manager is Bun and that the running Bun
  version satisfies the range. Future bumps within the 1.3.x series are
  routine; bumping to 1.4.x is a deliberate change tracked in this changelog.

### Validation

- **Added `bun run validate:fast`.** New inner-loop validation entry point
  that runs `format:check`, `check`, `project:check`, `routes:check`,
  `forms:check`, and unit tests — skipping the heavyweight build,
  performance budget, asset, security-header, and image-optimization
  checks. Use `validate:fast` while iterating; use `validate:core` before
  pushing.

### Docs

- **Removed site-tier framing.** The template no longer presents
  "small / medium / large" site tiers. The observability spine is now one
  baseline with optional extensions activated per project. The deleted
  `docs/observability/tiers.md` content has been folded into
  `docs/observability/README.md`.
- **`Containerfile.node.example` demoted to reference only.** The
  adapter-node swap recipe is no longer presented as a reliable escape
  hatch. It is documented as a starting point that will need adaptation
  if ever activated.
