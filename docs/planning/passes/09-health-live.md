# Pass 09 — `health:live` ledger view (final pass)

## Goal

Implement [ADR-030](../adrs/ADR-030-health-surface-architecture.md):
a single `scripts/lib/health-engine.ts` that reads the ops-status
ledger and produces `OpsResult[]`, fronted by two renderers — `bun
run health:live` (CLI for SSH ops) and `/admin/health` (server-
rendered web page for browser ops). Both render the same data
shape with explicit source labels (`ledger | live-host | live-db`).

After this pass, the operator has one consistent answer to
"is this site healthy right now?" — accessible from a terminal or
a browser, with snapshot-vs-live distinction surfaced explicitly.

This is the final pass of the recoverable-website-appliance
roadmap.

## Pre-conditions

- Passes 01–08 merged.
- Ledger has at least `releases.json` (pass 03) and
  `restore-drill.json` (pass 08) channels.
- `scripts/lib/ops-result.ts`, `scripts/lib/ops-status.ts`,
  `scripts/lib/release-state.ts`, `scripts/lib/restore-drill-state.ts`,
  `scripts/lib/quadlets.ts` all available.
- `deploy/Caddyfile.example` is the operator-facing Caddy config
  (audit confirmed).
- `src/lib/server/env.ts` is the env schema (extended through
  passes 01, 04, 07).

## Scope

The pass adds a health engine, a CLI, a web route, Caddy auth
config, env contract additions, doctor/launch-gate checks, tests,
and operator docs.

### New files

#### `scripts/lib/health-engine.ts`

Pure logic, separated from both renderers for testability.

```ts
export interface HealthFacts {
	// Ledger
	currentRelease: Release | null;
	previousRelease: Release | null;
	drill: RestoreDrillSnapshot | null;
	recentEvents: Array<{ kind: string; at: string; summary: string }>;
	// Host-live
	systemdUnits?: Array<{ unit: string; active: boolean; sub: string; description?: string }>;
	diskFree?: { mountPoint: string; bytesAvailable: number; bytesTotal: number };
	certExpiry?: Array<{ domain: string; expiresAt: string; daysRemaining: number }>;
	// DB-live
	outboxDepth?: number;
	outboxDeadLetters?: number;
	smokeBacklog?: number;
}

export type HealthSource = 'ledger' | 'live-host' | 'live-db';

export function readLedgerFacts(opts?: { eventsLimit?: number }): {
	facts: Pick<HealthFacts, 'currentRelease' | 'previousRelease' | 'drill' | 'recentEvents'>;
	results: OpsResult[];
};

export async function readHostLiveFacts(opts?: { runner?: HostProbeRunner }): Promise<{
	facts: Pick<HealthFacts, 'systemdUnits' | 'diskFree' | 'certExpiry'>;
	results: OpsResult[];
}>;

export async function readDbLiveFacts(opts?: { db?: DbHandle }): Promise<{
	facts: Pick<HealthFacts, 'outboxDepth' | 'outboxDeadLetters' | 'smokeBacklog'>;
	results: OpsResult[];
}>;

export function summarize(facts: HealthFacts): OpsResult[];
```

Every `OpsResult` returned includes a source tag:

```ts
// Embedded in detail or as a separate metadata field.
{ id: 'HEALTH-RELEASE-001', severity: 'pass', source: 'ledger', ... }
```

The engine adds one OpsResult per ledger fact (current release,
last drill, etc.) and one per live probe. `summarize` rolls them
up into a single overall-status OpsResult at the top.

Live-probe timeouts: each individual probe is wrapped in a 5-second
timeout. A timed-out probe emits a `warn` OpsResult with detail
"probe timed out after 5s" and proceeds to the next probe.

#### Probe seams

Tests need to inject mocks for systemd / podman / df / cert /
DB. Define interfaces for each probe so the production
implementation uses real spawns/queries and tests use canned
responses:

```ts
export interface HostProbeRunner {
	systemctlIsActive(unit: string): Promise<{ active: boolean; sub: string }>;
	diskFree(mountPoint: string): Promise<{ bytesAvailable: number; bytesTotal: number }>;
	certExpiry(domain: string): Promise<{ expiresAt: string }>;
}

export interface DbHandle {
	countOutboxPending(): Promise<number>;
	countOutboxDeadLetters(): Promise<number>;
	countSmokeBacklog(): Promise<number>;
}
```

Default `HostProbeRunner` uses `Bun.spawn` for `systemctl` /
shell commands and the cert library already used by Caddy or a
`tls.connect` peek. Default `DbHandle` is the existing Drizzle
client.

#### `scripts/health-live.ts`

CLI entry. Argument parsing only.

Flags:

- `--no-color`
- `--events=<N>` — limit recent events (default 10)
- `--source=<all|ledger|live>` — restrict to a subset (default all)
- `--json` — emit raw OpsResult[] as JSON

Pipeline: `readLedgerFacts()` + `readHostLiveFacts()` →
`summarize()` → `printOpsResults()`. Exit code follows
`severityToExitCode` from pass 02.

#### `src/routes/admin/health/+page.server.ts`

Server load function:

```ts
export const load = async () => {
	const ledger = readLedgerFacts();
	const dbLive = await readDbLiveFacts();
	const merged: HealthFacts = { ...ledger.facts, ...dbLive.facts };
	const results = [...ledger.results, ...dbLive.results];
	return { results, summary: summarize(merged) };
};
```

#### `src/routes/admin/health/+page.svelte`

Minimal Svelte 5 page that maps the load data to HTML cards:

- Top: overall summary card (severity glyph, text).
- One card per `OpsResult`: id, summary, source badge
  (`ledger` / `live-db`), detail (if any), remediation list (if
  any).
- No JS-driven interactivity. Server-rendered. Refresh via
  browser reload.
- Style is utility CSS only; match the existing site's typography
  and spacing tokens (don't introduce a new palette). Severity
  indicators: green / yellow / red borders or dots.

#### Tests

`tests/unit/health-engine.test.ts`:

- `readLedgerFacts` against fixture ledger snapshots returns
  expected facts + OpsResults; events list capped at
  `eventsLimit`.
- `readHostLiveFacts` with a mock `HostProbeRunner`: all-up
  scenario → all `pass`; one unit inactive → that unit `fail`,
  others unaffected; disk under threshold → `warn`; cert
  expiring in 7 days → `warn`; cert expired → `fail`.
- `readDbLiveFacts` with a mock `DbHandle`: outbox depth above
  alarm threshold → `warn`; dead letters > 0 → `warn`; smoke
  backlog approaching ADR-029's 100-row threshold → `warn`.
- Probe timeout: a probe that hangs gets canceled at 5s and
  emits the timeout OpsResult; other probes run normally.
- `summarize` produces overall-status OpsResult whose severity
  is `worstSeverity` of the inputs.
- Source tags are present on every emitted OpsResult.

`tests/unit/health-cli.test.ts`:

- `--source=ledger` skips live probes.
- `--json` emits parseable `OpsResult[]`.
- Exit code follows worst severity.
- `--events` limit honored.

`tests/unit/health-route.test.ts` (or a server-render test
following whatever pattern existing route tests use):

- Server load returns expected shape.
- HTML rendering survives empty-ledger fixture.
- Severity badges render correctly per result.

### Modified files

#### `deploy/Caddyfile.example`

Add `basicauth` on `/admin/*`:

```caddy
@admin path /admin/*
basicauth @admin {
  admin {env.HEALTH_ADMIN_PASSWORD_HASH}
}
```

Position the directive before the existing reverse_proxy /
file_server blocks so it wraps the admin path.

Document at the top of the file: "The hash is generated via
`caddy hash-password` and stored in `secrets.yaml` as
`HEALTH_ADMIN_PASSWORD_HASH`. The cleartext password is never
written to any file the template ships."

#### `src/lib/server/env.ts`

Add:

- `HEALTH_ADMIN_PASSWORD_HASH` — string, required in production.
  Validate format (Caddy's bcrypt-prefixed hash starts with
  `$2a$` or similar); reject if obviously malformed.

#### `.env.example`, `deploy/env.example`, `secrets.example.yaml`

Add `HEALTH_ADMIN_PASSWORD_HASH` with a comment pointing
operators at `caddy hash-password`. Note that the cleartext is
never stored.

#### `scripts/lib/launch-blockers.ts`

- Production launch with missing `HEALTH_ADMIN_PASSWORD_HASH` →
  blocker.
- Production launch with a hash that doesn't look like a Caddy
  password hash → blocker.

#### `scripts/doctor.ts`

Add a "Live health" section that runs the engine and surfaces
the same OpsResults as `health:live --source=ledger` (skip
host-live probes here to keep `doctor` fast and offline-safe).
This gives operators a "doctor includes live health snapshot"
without doctoring twice.

#### `package.json`

Add `"health:live": "bun run scripts/health-live.ts"`.

#### `docs/operations/health.md` (new)

Operator runbook:

- The two surfaces and when to use which.
- How to read the source tags (`[ledger]` vs `[host]` vs `[db]`).
- How to set `HEALTH_ADMIN_PASSWORD_HASH` (via
  `caddy hash-password`; sample command + example output).
- What each probe means and remediation pointers (link to
  `rollback.md`, `restore-drill.md`, `deploy-apply.md`,
  `smoke.md`).
- How to run a one-shot health check on a remote host
  (`ssh <host> "cd <project> && bun run health:live"`).

#### `docs/operations/ops-status-ledger.md` (from pass 03)

Add a "Reading the ledger" section showing both
`bun run health:live` and `/admin/health` as the consumer
surfaces.

#### `docs/documentation-map.md`

Add `docs/operations/health.md` and ADR-030.

#### `README.md`

Update Reliability surface table:

- "Live health visibility" row goes from "/healthz + /readyz only;
  unified surface in pass 09" (or whatever pass 01 wrote) to
  "Implemented; CLI (`bun run health:live`) and web
  (`/admin/health`) per ADR-030."

#### `docs/deployment/runbook.md`

Cross-link the new health surface in the post-deploy section
(immediately after `deploy:apply` succeeds, the next step is
`bun run health:live` or open `/admin/health`).

## Out of scope

Each item is binding.

- **Multi-site fleet view.** Per-site only.
- **Alerting / paging.** Health is pull, not push.
- **Metrics endpoints** (Prometheus, OpenMetrics).
- **Real-time updates** (SSE, WebSocket).
- **Caching layer.** v1 is always-live.
- **JSON API** beyond the `--json` CLI flag.
- **Backup channel** (`backup.json`). Restore-drill channel is
  the only ledger source for the drill-related probes; existing
  backup scripts remain log-only. A backup channel can be added
  later in its own pass.
- **Printer normalization across other CLIs.** The smaller
  cleanup pass that's been deferred since pass 06 is still
  deferred; pass 09 only ensures `health:live` and the web view
  share the OpsResult shape.
- **Per-probe configurable thresholds.** Disk-warn threshold,
  cert-warn-days, outbox-warn-depth all live as constants in the
  engine for v1. Make them env-configurable later if a real site
  needs different thresholds.

## Validation

- `bun run format:check`
- `bun run check`
- `bun run test`
- `bun run health:live --no-color` against the current host —
  should run, render OpsResult cards, exit 0 if everything is
  green or 1 if any `fail`.
- `bun run health:live --source=ledger --json` — JSON output
  parses; contains source tags.
- `bun run check:launch` with `HEALTH_ADMIN_PASSWORD_HASH`
  missing in a production-shaped env → blocker fires.
- After Caddy reload (manual on host), `curl
https://<site>/admin/health` without auth → 401; with valid
  basicauth → renders the page.

## Deliverable

Return:

- Summary of changed files (paths only).
- Exact commands run and pass/fail status.
- Sample stdout from `bun run health:live` (paste full output for
  one rendering — ledger + host-live + summary).
- Sample stdout from `bun run health:live --source=ledger --json`
  (one full JSON `OpsResult[]`).
- Sample HTML snippet from `/admin/health` server render
  (paste the output of a server-render test — operators can
  read it).
- Caddy verification: paste the snippet from
  `deploy/Caddyfile.example` showing the basicauth directive,
  and confirm it positions before reverse_proxy.
- Confirmation that every emitted OpsResult carries a source
  tag.
- Confirmation that probe timeouts degrade gracefully (one slow
  probe doesn't block the rest).
- Recommendation: "The recoverable-website-appliance roadmap
  v1 is complete. Suggested follow-ups: (1) printer
  normalization across CLIs that still use OK/SKIP/FAIL labels,
  (2) backup channel symmetric with restore-drill channel, (3)
  re-evaluate deferred items (auto-rollback, fleet view) against
  real client usage."

## Codex prompt

You are implementing pass 09 of the `tmpl-svelte-app` reliability
roadmap — the final pass. The binding contract is
[ADR-030](../adrs/ADR-030-health-surface-architecture.md). The
full scope is above.

Read these first, in order, before writing any code:

1. This file (`docs/planning/passes/09-health-live.md`)
2. `docs/planning/adrs/ADR-030-health-surface-architecture.md`
3. `docs/planning/adrs/ADR-024-lead-gen-website-appliance.md`
4. `docs/planning/adrs/ADR-025-ops-status-ledger.md`
5. `scripts/lib/ops-result.ts` and `tests/unit/ops-result.test.ts`
6. `scripts/lib/ops-status.ts` and tests
7. `scripts/lib/release-state.ts` and tests
8. `scripts/lib/restore-drill-state.ts` and tests (pass 08)
9. `scripts/lib/quadlets.ts`
10. `scripts/doctor.ts` (the OpsResult-emitting CLI pattern)
11. `src/lib/server/env.ts`
12. `src/lib/server/db/schema.ts` (for outbox / contact queries)
13. `deploy/Caddyfile.example`
14. Any existing `src/routes/admin/*` pages (look for the
    Sveltia admin pattern; confirm whether `/admin/*` is
    currently public or has any prior auth)

Then implement the **Scope** section above and **only** that.
The **Out of scope** section is binding — no fleet view, no
alerting, no metrics endpoint, no real-time updates, no caching,
no printer normalization across other CLIs.

When done, run the validation commands and return the deliverable
in the exact shape requested.
