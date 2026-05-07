# ADR-029: E2E smoke is an authenticated backdoor; treat it as one

- Status: Accepted
- Date: 2026-05-07
- Related: ADR-024 (lead-gen appliance), ADR-025 (ops-status
  ledger), ADR-028 (deploy:apply orchestration semantics).

## Context

The lead-gen appliance's whole point is: a form submission lands
in Postgres, an outbox row queues, the worker picks it up,
Postmark emails the lead. Static health checks (`/healthz`,
`/readyz`) verify the web service is up but not that any of that
chain works. A site can pass static smoke and still silently fail
to deliver leads — exactly the failure mode this template is
trying to prevent.

The fix is end-to-end smoke: post a real form submission, watch
it traverse the chain, verify each step. The submission must go
through the **same code path** as a real lead — that is the only
way to verify the path. But that means:

1. The endpoint accepts unauthenticated POSTs (it's a public
   contact form).
2. Smoke submissions need to be distinguishable from real ones
   (so reports, exports, CRM syncs don't see test data).
3. Smoke submissions must not email the business owner (the
   whole point is to test, not to spam).
4. Smoke rows accumulate forever unless something prunes them.

Item 1 means an authenticated smoke endpoint is a privileged
side-channel — anyone who learns the credential can drop rows
into the contact table at will. **It is a backdoor, and should
be designed as one**: high-entropy secret, constant-time compare,
rate-limited independent of real traffic, fail-closed when the
backlog grows, never logged.

Items 2–4 are mechanical — column tag, test token routing,
retention pruner — but they need to be specified together because
forgetting any of them creates either silent test-data leakage or
unbounded growth.

## Decision

### Smoke contract on the existing contact action

The same code path that handles real submissions handles smoke
submissions. The action checks for an `X-Smoke-Test` header. When
the header is present and matches `SMOKE_TEST_SECRET` via
`crypto.timingSafeEqual`:

- The inserted row gets `is_smoke_test = true`.
- The email path uses the **Postmark test API token**
  (`POSTMARK_API_TEST`) instead of the live token. Postmark
  accepts but does not deliver. No production email goes out.
- The action returns a JSON body (so the caller can parse a
  result), not the HTML redirect a real form submission gets.
- No automation provider call. The outbox row is queued for
  observability but the worker skips automation delivery for
  smoke rows. (Automation-path smoke can be added in a later pass
  — out of scope here.)

Without the header, the action behaves exactly as today.

### Authentication

- `SMOKE_TEST_SECRET` is a 32-byte hex string (or higher entropy)
  set in environment, never in the repo.
- Header value is compared via `crypto.timingSafeEqual` after
  length-equalizing both buffers.
- The header value is **never logged** — not in error paths, not
  in audit logs, not in `events.ndjson`. The fact a smoke
  submission occurred is logged; the secret is not.
- An invalid `X-Smoke-Test` header returns `401` JSON and does
  not write to the database. Real submissions (no header) are
  unaffected.

### Test routing

- A new env var `POSTMARK_API_TEST` holds the Postmark test
  token. Required in production whenever `SMOKE_TEST_SECRET` is
  set.
- The Postmark provider accepts an internal `useTestToken: true`
  flag that swaps the token for that request only.
- Smoke submissions invoke the provider with `useTestToken: true`.
  Real submissions never do.

### Distinguishable rows

- A new column `is_smoke_test boolean not null default false` on
  the contact table. Drizzle migration ships with the pass.
- An index on `is_smoke_test` for retention queries.
- Application reports, CRM exports, and analytics filters must
  exclude `is_smoke_test = true`. Documenting this in the smoke
  runbook is part of pass 07.

### Rate limiting

- Smoke submissions are rate-limited **independently** of real
  ones. All smoke calls share one bucket keyed on
  `SMOKE_TEST_SECRET` (which is constant per site), not on
  client IP.
- Default cap: 60 smoke submissions per hour. Configurable via
  `SMOKE_TEST_RATE_LIMIT_PER_HOUR`.
- Hitting the cap returns `429` JSON. Real submissions continue
  to use their own (existing) rate limit unchanged.

### Fail-closed retention check

Before the action accepts a smoke submission, it counts
unpruned smoke rows older than retention:

```sql
SELECT count(*) FROM contact
WHERE is_smoke_test = true AND created_at < now() - interval '24 hours';
```

If `count > 100`, the action **refuses** the smoke submission
with a `503` JSON response naming the backlog. This is fail-
closed by design: a broken pruner shouldn't quietly inflate the
table. Operator response is to investigate the pruner, run it
manually, and only then resume smoke.

The threshold (100 rows, 24 hours) is documented; it can change
without an ADR amendment as long as the fail-closed contract
holds.

### Async pruning

- The existing privacy retention pruner (`bun run privacy:prune`)
  is extended to delete `is_smoke_test = true` rows older than
  24 hours.
- Sync prune is **not** attempted in the action (would couple
  the smoke endpoint's success to a delete that may be slow or
  contended). The fail-closed check above guards against pruner
  failure.

### What the deploy-time smoke checks verify

Pass 07 extends `scripts/deploy-smoke.ts` with E2E checks that
run when `SMOKE_TEST_SECRET` is configured. The checks (each one
emits an `OpsResult`):

1. `SMOKE_TEST_SECRET` is set.
2. `POSTMARK_API_TEST` is set.
3. POST `/contact` with the smoke header returns 200 JSON.
4. The expected contact row exists with `is_smoke_test = true`.
5. The outbox row is queued for the contact.
6. The worker drains the outbox row within 30 seconds.
7. Postmark received the request (verifiable via the response
   metadata or a test-mode echo).
8. The smoke row is deleted before exit.

When `SMOKE_TEST_SECRET` is unset (e.g. local dev without smoke
configured), checks 1–8 emit `info` ("E2E smoke not configured")
and the static smoke runs as before.

## Threat model

| Threat                                               | Mitigation                                                                                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Leaked `SMOKE_TEST_SECRET` → arbitrary DB write spam | High-entropy required (32-byte minimum enforced by launch gate); rate-limited at 60/hour; fail-closed at 100 unpruned rows; rotation runbook |
| Header value leaked to logs                          | Never log the header value; tests assert it does not appear in any log path                                                                  |
| Real lead accidentally tagged smoke (lost lead)      | Header is explicit and required to enter the smoke path; the default behavior is the real path                                               |
| Smoke email accidentally sent live                   | Test token is conditional on header validity; provider has separate code path that requires `useTestToken: true`                             |
| Pruner failure → unbounded growth                    | Fail-closed check at 100 unpruned rows refuses smoke; operator alarm                                                                         |
| Timing attack on header compare                      | `crypto.timingSafeEqual` after length-equalize                                                                                               |
| Smoke fires real automation webhook                  | Smoke skips automation provider entirely; outbox row is queued for observability but not delivered                                           |

## Alternatives considered

- **Stub Postmark in the smoke path** (e.g. inject a mock
  provider). Rejected: doesn't exercise the real Postmark API at
  all; a smoke that doesn't talk to Postmark gives false
  confidence.
- **Postmark sandbox addresses** (`*.blackhole.postmarkapp.com`).
  Valid alternative; rejected in favor of the test API token
  because the token is Postmark's documented mechanism for
  "accept-but-don't-deliver" and avoids per-recipient bounce
  bookkeeping.
- **Dedicated `/api/smoke` endpoint separate from contact
  action.** Rejected: duplicates the action's validation and
  insertion code, and a code path that isn't real isn't a real
  smoke.
- **Sync prune in the smoke action.** Rejected: couples smoke
  success to delete latency; one slow delete on a busy DB would
  fail smoke for unrelated reasons.
- **Auto-rotate `SMOKE_TEST_SECRET`.** Out of scope; manual
  rotation per the runbook.

## Consequences

- `SMOKE_TEST_SECRET` and `POSTMARK_API_TEST` join the production
  env contract per ADR-024 when E2E smoke is enabled.
- Launch gate (`scripts/lib/launch-blockers.ts`) enforces minimum
  entropy on `SMOKE_TEST_SECRET` and presence of
  `POSTMARK_API_TEST` whenever the secret is set.
- Real form submission code path is touched (header check,
  provider routing, JSON-vs-redirect branch). The change is
  small and tested but it is in a security-sensitive surface.
- Reports, exports, CRM syncs must filter on
  `is_smoke_test = false`. Pass 07 documents this; existing
  consumers may need updating in operator-side code.
- The `automation_events` outbox grows by one row per smoke run
  (not delivered, but recorded). Default retention prunes these
  alongside the contact row.
- Pass 06's `deploy:apply` invokes the extended `deploy-smoke`,
  so successful deploys now include E2E proof. Failed E2E means
  failed deploy, which means the rollback remediation from
  ADR-028 fires.

## Out of scope

- **Automation-path smoke.** Smoke does not exercise the
  webhook/n8n provider in this pass. A separate provider-test
  contract can land later if a real client requires it.
- **Multi-form smoke.** Only the contact form has smoke
  coverage. If other forms are added (newsletter, scheduling,
  etc.), each gets its own smoke surface in its owning pass.
- **`SMOKE_TEST_SECRET` rotation automation.** Manual rotation
  via the runbook.
- **Postmark sandbox-domain smoke as a fallback** when test
  token is unset. The token is required.
