# Pass 07 — E2E smoke through Postmark (authenticated backdoor)

## Goal

Implement [ADR-029](../adrs/ADR-029-e2e-smoke-as-authenticated-backdoor.md):
the contact form action accepts an authenticated `X-Smoke-Test`
header, routes smoke submissions through the Postmark test API
token, tags rows with `is_smoke_test = true`, fails closed when
the prune backlog grows, and is rate-limited independently. Extend
`scripts/deploy-smoke.ts` (post-pass-06 retrofit) with E2E checks
that exercise the full chain. Extend `privacy:prune` to delete
smoke rows after retention.

This is the security-sensitive pass. Treat the smoke endpoint as a
backdoor and design it as one.

## Pre-conditions

- Passes 01–06 merged.
- ADR-029 binding.
- `src/lib/server/forms/providers/postmark.ts` exists (audited in
  the original pass, used by the contact action).
- The contact form action exists. Confirm the file path during
  the read step (likely `src/routes/contact/+page.server.ts` or
  similar; `src/lib/server/forms/` may host the shared logic).
- Existing `bun run privacy:prune` script. Confirm location during
  reads.
- Pass 06 left `scripts/deploy-smoke.ts` emitting `OpsResult[]`;
  this pass adds new check IDs to it without altering the retrofit
  contract.
- The contact table schema is in `drizzle/`. The new migration
  ships alongside this pass.

## Scope

The pass adds: a Drizzle migration, env-var schema, a Postmark
provider extension, smoke handling in the contact action, fail-
closed retention, rate limiting, deploy-time E2E checks, prune
extension, launch-gate checks, tests, and operator docs.

### Schema

New Drizzle migration:

- Add column `is_smoke_test boolean not null default false` to
  the contact table.
- Add an index on `is_smoke_test` for retention queries.
- Migration filename follows the existing pattern (next ordinal
  after the latest migration in `drizzle/`).

### Env-var contract

Add to `src/lib/server/env.ts`:

- `SMOKE_TEST_SECRET` — string, optional in dev, required-when-
  E2E-smoke-is-enabled. Minimum length **32 hex chars** (i.e. ≥16
  bytes of entropy). Validate at boot.
- `POSTMARK_API_TEST` — string, required when
  `SMOKE_TEST_SECRET` is set. Validate at boot.
- `SMOKE_TEST_RATE_LIMIT_PER_HOUR` — number, default 60.
- `SMOKE_TEST_BACKLOG_THRESHOLD` — number, default 100. The
  fail-closed cutoff for unpruned-rows-older-than-24h.

Mirror the additions in `.env.example`, `deploy/env.example`, and
`secrets.example.yaml`. Comments make clear that
`SMOKE_TEST_SECRET` is a backdoor credential and document the
rotation runbook pointer.

### Postmark provider extension

`src/lib/server/forms/providers/postmark.ts`:

- Accept an internal flag in the send function:
  `send(payload, opts?: { useTestToken?: boolean })`.
- When `useTestToken === true`, send with `POSTMARK_API_TEST`
  instead of `POSTMARK_SERVER_TOKEN`. All other behavior
  (endpoint, headers, error handling) is unchanged.
- The flag must not flip silently — there is no env-driven
  default for it. Only call sites that intentionally pass the
  flag use the test token.

### Contact action smoke handling

In whatever module handles contact form submission (read first
to find — likely `src/lib/server/forms/contact-action.ts` or
inline in the route's `+page.server.ts`):

1. **Header detection.** Check for `X-Smoke-Test` header on the
   incoming request.
2. **Constant-time compare.** When present, compare against
   `SMOKE_TEST_SECRET` via `crypto.timingSafeEqual` after
   buffer-coercing both inputs to equal length (pad short input
   to prevent length-leak — or reject early if length differs,
   then constant-compare a fixed-length dummy to keep timing
   uniform). The header value must never appear in logs, error
   messages, or events.
3. **Invalid header → 401 JSON, no DB write.** No retries, no
   hint about what went wrong, no enumeration of length or
   content.
4. **Valid header → smoke path:**
   - **Backlog check.** Query
     `SELECT count(*) FROM contact WHERE is_smoke_test = true AND created_at < now() - interval '24 hours'`.
     If `count > SMOKE_TEST_BACKLOG_THRESHOLD`, return `503` JSON
     with body `{ error: "smoke-backlog-exceeded", count }`. Do
     not insert.
   - **Rate-limit check.** Use a single bucket keyed on a hash
     of `SMOKE_TEST_SECRET` (so the secret is not the storage
     key) with capacity from `SMOKE_TEST_RATE_LIMIT_PER_HOUR`.
     Over-cap → `429` JSON.
   - **Insert** with `is_smoke_test = true`.
   - **Outbox queue** as for a real submission. The worker will
     pick up the row; smoke rows skip automation delivery (see
     worker change below).
   - **Email** via `postmarkProvider.send(..., { useTestToken: true })`.
   - **Return** `200 JSON` with body
     `{ ok: true, contact_id, smoke_test: true }` so the caller
     can verify chain progress.
5. **No header → real path.** Unchanged.

### Worker: skip automation for smoke

In whatever module dispatches outbox events to the automation
provider (read first; likely `src/lib/server/automation/worker.ts`
or `scripts/automation-worker.ts`):

- For each outbox row, before invoking the automation provider,
  check if the source row is `is_smoke_test = true`. If yes,
  mark the outbox row as `delivered` (or whatever the existing
  terminal state is) **without** calling the automation
  provider. Annotate the row's metadata so the deploy-smoke
  check can verify it was correctly skipped.
- The email path is **not** skipped — Postmark with the test
  token already handles the "send but don't deliver" case.

### Privacy prune extension

In the existing `privacy:prune` script (read first to confirm
location):

- Add a step that deletes contact rows where
  `is_smoke_test = true AND created_at < now() - interval '24 hours'`.
- Emit one OpsResult per pass with the count pruned.
- Existing prune behavior unchanged.

### Deploy smoke E2E checks

Extend `scripts/deploy-smoke.ts` (do not refactor; add check IDs):

- `SMOKE-E2E-CONFIG-001` — `SMOKE_TEST_SECRET` is set. If unset,
  emit `info` ("E2E smoke not configured for this site") and
  short-circuit the rest of the E2E section. Static checks run
  as before.
- `SMOKE-E2E-CONFIG-002` — `POSTMARK_API_TEST` is set when
  `SMOKE_TEST_SECRET` is set. Otherwise `fail`.
- `SMOKE-E2E-POST-001` — POST `/contact` with the smoke header
  and synthetic form payload; expect `200 JSON` with `ok: true`
  and a `contact_id`.
- `SMOKE-E2E-DB-001` — query the contact row; expect
  `is_smoke_test = true`.
- `SMOKE-E2E-OUTBOX-001` — query the outbox row queued for the
  contact; expect status to transition to terminal within 30
  seconds.
- `SMOKE-E2E-OUTBOX-002` — verify the outbox row's metadata
  indicates automation was skipped (`automation_skipped = true`
  or whatever the worker annotated).
- `SMOKE-E2E-EMAIL-001` — verify Postmark was called with the
  test token. The cleanest source of truth is the response
  Postmark sends back when the test token is used (Postmark
  echoes the request); record that in the outbox row's metadata
  during the email send and verify it here.
- `SMOKE-E2E-PRUNE-001` — DELETE the smoke row from the contact
  table. Verify the row is gone.

Each check emits one or more `OpsResult`s. Default per-check
timeout 5s, total E2E timeout 60s, configurable via env.

### Launch-gate checks

In `scripts/lib/launch-blockers.ts`:

- Production launch with `SMOKE_TEST_SECRET` set but
  `POSTMARK_API_TEST` missing → blocker.
- Production launch with `SMOKE_TEST_SECRET` shorter than 32 hex
  chars → blocker.
- Production launch with `SMOKE_TEST_SECRET` set but
  `is_smoke_test` column missing (migration not applied) →
  blocker.
- Soft warning (not blocker): production launch without
  `SMOKE_TEST_SECRET` set at all — operator may have intentionally
  disabled E2E smoke; document the trade-off in the launch output.

### Tests

`tests/unit/contact-action-smoke.test.ts` (new):

- Valid header → row tagged, JSON response, `useTestToken: true`
  passed to provider, automation provider not invoked.
- Invalid header → 401, no DB write, no Postmark call.
- Missing header → real path unaffected.
- Constant-time compare verified (mock crypto, assert
  `timingSafeEqual` was called).
- Header value does not appear in logs (capture log output and
  assert).
- Fail-closed: with 101 unpruned smoke rows older than 24h →
  503, no insert.
- Rate limit: 61st smoke submission within an hour → 429.
- Backlog threshold and rate cap honor env-var overrides.

`tests/unit/postmark-provider.test.ts` (extend or create):

- `useTestToken: true` uses `POSTMARK_API_TEST`.
- `useTestToken: false` (or omitted) uses
  `POSTMARK_SERVER_TOKEN`.
- Both code paths reach the same Postmark URL.

`tests/unit/automation-worker.test.ts` (extend):

- Smoke outbox row marks delivered without invoking the
  automation provider.
- Real outbox row invokes the automation provider as before.

`tests/unit/privacy-prune.test.ts` (extend):

- Smoke rows older than 24h are pruned.
- Smoke rows newer than 24h are not pruned.
- Real (non-smoke) rows are not affected by the new branch.

`tests/unit/launch-blockers.test.ts` (extend):

- The four new blocker / warning cases above.

`tests/e2e/smoke-e2e.spec.ts` (new):

- Full chain test against a fixture-shaped server. Skips
  cleanly when env is not configured for E2E smoke.

### Modified docs

`docs/operations/smoke.md` (new):

- When and how E2E smoke runs.
- How to generate `SMOKE_TEST_SECRET` (`openssl rand -hex 32`)
  and add it to `secrets.yaml`.
- How to obtain the Postmark test API token from the Postmark
  UI.
- What happens on each failure mode (401, 429, 503-backlog,
  timeout).
- Manual prune command if the pruner is broken.
- Rotation runbook for `SMOKE_TEST_SECRET`.

`docs/operations/deploy-apply.md`:

- Note that `deploy:apply` now runs the E2E smoke when configured,
  and that smoke failure follows the existing remediation from
  pass 06 (rollback or PITR).

`docs/automations/security-and-secrets.md`:

- `SMOKE_TEST_SECRET` and `POSTMARK_API_TEST` documented as
  required production secrets when E2E smoke is enabled.

`docs/database/README.md`:

- Document `is_smoke_test` column. Note that all reports, CRM
  exports, and analytics filters must filter
  `is_smoke_test = false`.

`docs/documentation-map.md`:

- Add ADR-029 + `docs/operations/smoke.md`.

`README.md`:

- Update the Reliability surface table from pass 01: the "Deploy
  smoke" row goes from "Static surface only" to "Implemented;
  E2E through Postmark test token per ADR-029" — but only when
  `SMOKE_TEST_SECRET` is configured. Add a one-line caveat.

## Out of scope

- **Automation-path smoke.** The webhook/n8n provider is not
  exercised by smoke. Worker skips automation delivery for smoke
  rows. A future pass can add a separate automation-test contract
  if a real client requires it.
- **Multi-form smoke.** Contact form only.
- **Auto-rotation of `SMOKE_TEST_SECRET`.** Manual rotation per
  runbook.
- **Postmark sandbox-domain fallback** when the test token is
  unset. The token is required.
- **Refactoring the existing rate-limiter** (if any). Add a new
  bucket alongside the existing one.
- **Refactoring the worker's outbox dispatch loop.** Add the
  smoke check inline.

## Validation

- `bun run format:check`
- `bun run check`
- `bun run test`
- `bun run db:migrate` (or whatever the existing command is)
  against a fixture DB to apply the new migration.
- `bun run deploy:smoke` with `SMOKE_TEST_SECRET` and
  `POSTMARK_API_TEST` set against a local stack — should run E2E
  end-to-end and exit 0.
- `bun run deploy:smoke` with `SMOKE_TEST_SECRET` unset — E2E
  checks emit `info` and skip; static checks run normally; exit 0.
- `bun run privacy:prune` — should report smoke rows pruned (0
  if none, otherwise the count).

## Deliverable

Return:

- Summary of changed files (paths only).
- Exact commands run and pass/fail status.
- Sample stdout from a successful E2E `bun run deploy:smoke`
  showing all `SMOKE-E2E-*` checks passing.
- Sample stdout when `SMOKE_TEST_SECRET` is unset (E2E skipped,
  static still runs, all `info`).
- Sample of the fail-closed response (the 503 body shape).
- Confirmation that `crypto.timingSafeEqual` is the comparison
  primitive.
- Confirmation that `SMOKE_TEST_SECRET`'s value never appears in
  any log path (test assertion is the proof).
- Confirmation that smoke rows are pruned by the new prune
  branch.
- Confirmation that the worker skipped the automation provider
  for smoke rows (assert via outbox metadata in tests).
- Recommendation: "Pass 08 (Restore-drill scheduling and evidence
  persistence) is the next slice." If anything found should
  reorder, name it.

## Codex prompt

You are implementing pass 07 of the `tmpl-svelte-app` reliability
roadmap. The binding contract is
[ADR-029](../adrs/ADR-029-e2e-smoke-as-authenticated-backdoor.md).
This is the security-sensitive pass: the smoke endpoint is an
authenticated backdoor. Read ADR-029 in full before writing code.

Read these first, in order:

1. This file (`docs/planning/passes/07-e2e-smoke-postmark.md`)
2. `docs/planning/adrs/ADR-029-e2e-smoke-as-authenticated-backdoor.md`
3. `docs/planning/adrs/ADR-024-lead-gen-website-appliance.md`
4. `docs/planning/adrs/ADR-028-deploy-apply-semantics.md`
5. `src/lib/server/forms/providers/postmark.ts`
6. `src/lib/server/env.ts`
7. The contact action — search for `+page.server.ts` under
   `src/routes/contact*` and any module under
   `src/lib/server/forms/` that handles submission.
8. The automation worker — search for the worker dispatch loop;
   `automation:worker` in `package.json` points at it.
9. `scripts/deploy-smoke.ts` (post-pass-06 retrofit)
10. `scripts/lib/launch-blockers.ts`
11. The privacy prune script — search for `privacy:prune` in
    `package.json`.
12. `drizzle/` (most recent migrations and `meta/_journal.json`).
13. `tests/e2e/contact.spec.ts` (existing static contact test).

Then implement the **Scope** section above and **only** that.
The **Out of scope** section is binding — no automation-path
smoke, no multi-form smoke, no auto-rotation, no Postmark
sandbox fallback, no rate-limiter refactor.

Special discipline for this pass:

- Treat `SMOKE_TEST_SECRET` as a credential. It must never be
  written to logs, events, errors, or test snapshots. A test must
  verify this.
- Use `crypto.timingSafeEqual` for the header compare. Length-
  equalize before calling.
- The fail-closed backlog check is a hard 503; do not let it
  degrade to a warning.
- The smoke path and the real path must share insertion code.
  Branching at the action level is fine; duplicating the insert
  is not.
- Worker skipping automation for smoke rows is a single inline
  check, not a refactor.

When done, run the validation commands and return the deliverable
in the exact shape requested.
