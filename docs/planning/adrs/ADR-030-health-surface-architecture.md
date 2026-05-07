# ADR-030: Health surface architecture — one ledger, two renderers

- Status: Accepted
- Date: 2026-05-07
- Related: ADR-024 (lead-gen appliance), ADR-025 (ops-status
  ledger), ADR-028 (deploy:apply), ADR-029 (E2E smoke).

## Context

Passes 02–09 wrote ops state to the ledger
(`releases.json`, `backup.json`, `restore-drill.json`) and added orchestration
(rollback, deploy:apply, smoke, backup/drill scheduling). Each surface
has its own way of being inspected today: `journalctl` for
systemd unit state, raw SQL for outbox depth, `cat | jq` for
ledger files, `systemctl --user status` for unit health,
`certbot` or Caddy logs for cert expiry. None of these compose
into a single answer to "is this site healthy right now?"

The original structural critique was explicit about the failure
mode this creates:

> Health is one ledger, two renderers — not two parallel surfaces.
> Build it as: ops status ledger holds everything; `/admin/health`
> reads the ledger + adds live DB-side facts; `health:live` reads
> the ledger + adds live host-side facts. Both render the same
> OpsResult shape from the same source.

That framing is the right one. Two parallel surfaces — one CLI
that probes systemd, one web page that queries the DB — would
recreate the drift problem the rest of this roadmap fought.

## Decision

### One engine, two renderers

A single `scripts/lib/health-engine.ts` produces
`OpsResult[]` from three sources:

- **Ledger reads** (always available, fast): current release,
  last backup, last drill, last N events.
- **Host-side live probes** (used by the CLI): `systemctl --user
is-active <unit>` for each `ALL_QUADLETS` unit, disk free, cert
  expiry, podman container states, last events.
- **DB-side live probes** (used by the web view): outbox depth,
  dead letters, smoke backlog, recent failed automation events.

The engine accepts which source families to invoke (`{ ledger?: boolean; hostLive?: boolean; dbLive?: boolean }`) so each
renderer asks for what it can resolve. The output is the same
`OpsResult[]` shape regardless of source.

### Source tagging

Every `OpsResult` carries an explicit source label:
`'ledger' | 'live-host' | 'live-db'`. The renderer surfaces it to
the operator so the difference between snapshot and live is never
implicit:

- CLI: a `[ledger]`, `[host]`, or `[db]` prefix on the detail
  line.
- Web: a small badge next to each card.

This rule exists because operators reading a green status need to
know whether they're seeing "the last drill passed" (ledger) or
"the database is reachable right now" (live). Conflating the two
hides exactly the kind of stale-snapshot failure the appliance is
trying to surface.

### Two renderers

- **`bun run health:live`** — CLI for SSH-based ops. Reads
  ledger + host-live. Renders via `printOpsResults` from pass 02.
  Same glyph rendering as `doctor` and `deploy:apply`.
- **`/admin/health`** — server-rendered Svelte page for browser
  ops. Reads ledger + db-live. Renders OpsResult cards in HTML.

The web view is intentionally minimal: HTML cards, severity
indicators, source badges. No charts, no real-time updates, no
JavaScript-required rendering. It is operator-readable on a slow
mobile connection at 3 AM.

### Authentication on `/admin/health`

`/admin/health` is operator-only. Authentication is enforced
**at the Caddy layer** via `basicauth`:

```caddy
@admin path /admin/*
basicauth @admin {
  admin {$HEALTH_ADMIN_PASSWORD_HASH}
}
```

- `HEALTH_ADMIN_PASSWORD_HASH` is the Caddy-bcrypt hash of the
  admin password. Operators generate it once via
  `caddy hash-password` and add the hash to `secrets.yaml`.
- The cleartext password is never stored in any file the template
  ships.
- The launch gate enforces `HEALTH_ADMIN_PASSWORD_HASH` is set in
  production. Without it, the route 401s by Caddy default.

Reasoning:

- Caddy is the natural enforcement point for path-level access
  control. The app layer doesn't gain anything by re-implementing
  it.
- Basicauth is operator-friendly: any browser supports it, no
  cookie/session state to manage.
- App-layer auth would add a tested code path on a route whose
  access requirement is "operator only" — exactly what
  Caddy-level controls solve.
- Loopback-only with SSH tunneling was considered (and rejected):
  operators want browser convenience without per-host tunneling
  setup; basicauth via Caddy is the lower friction path.

### No caching in v1

Each `/admin/health` request live-probes. Sub-second probes plus
low traffic make this acceptable. If the surface gets popular or
the probes get slow, a 30-second cache layer is an obvious next
addition. Not in v1.

### Live-probe timeouts

Each individual live probe has a 5-second timeout. A timed-out
probe emits a `warn` `OpsResult` with detail "probe timed out
after 5s." The surface degrades gracefully — one slow probe does
not block the whole view.

## Alternatives considered

- **Single renderer (CLI only).** Rejected: at-a-glance browser
  access is operator-valuable for solo operators running multiple
  client sites; a quick browser tab beats a fresh SSH session.
- **Single renderer (web only).** Rejected: SSH-based ops on a
  host without browser access (or during incident triage) needs a
  CLI.
- **Three renderers** (CLI + web + JSON API). Rejected for v1:
  `cat ~/.local/state/<project>/ops/*.json | jq` already gives
  programmatic access; a separate JSON API is YAGNI.
- **App-layer auth on `/admin/health`** (e.g. session cookie
  tied to admin login). Rejected: more code paths to test and
  maintain than Caddy basicauth.
- **No auth, loopback-only `/admin/health`.** Valid alternative;
  rejected for operator convenience reasons above. The loopback
  pattern still works for operators who explicitly want it (just
  bind Caddy's listener on `127.0.0.1`).
- **Shared OpsResult cache across CLI and web.** Rejected for
  v1: the two renderers have different probe sets (host vs DB)
  so a shared cache complicates more than it saves. Per-renderer
  caching is the smaller next step if needed.
- **Real-time updates** (SSE / WebSocket on `/admin/health`).
  Out of scope. Refresh-the-page is sufficient.

## Consequences

- `HEALTH_ADMIN_PASSWORD_HASH` joins the production env contract
  (per ADR-024) when `/admin/health` is exposed.
- `scripts/lib/health-engine.ts` becomes the single source of
  truth for "what does health include?" — adding a new probe
  (e.g. cert OCSP, DB replication lag) is one change in the
  engine, not two.
- The launch gate gains one more check: hash present + non-empty
  in production.
- `Caddyfile.example` ships the `basicauth` directive on
  `/admin/*`; operators applying it for the first time generate
  the hash via `caddy hash-password`.
- Operators have a single place to look at any moment: the CLI
  on the host, or the web view in a browser. Both render the
  same OpsResult shape with explicit source labeling.

## Out of scope

- **Multi-site fleet view.** This pass and this ADR are
  per-site. Fleet aggregation is a deliberate future decision
  (per ADR-024 deferral on per-site Postgres) and is not bound
  here.
- **Alerting / paging.** Health view is human-pull, not push.
  Operators wire push channels (email, Slack) outside the
  template if they need them.
- **Metrics endpoints** (Prometheus, OpenMetrics). Out of scope.
- **Caching layer.** Deferred to v2 if probes get slow.
- **JSON API for `/admin/health`.** Operators wanting
  programmatic access read the ledger files directly with `jq`.
