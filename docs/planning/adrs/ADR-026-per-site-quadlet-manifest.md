# ADR-026: Per-site Quadlet manifest in site.project.json

- Status: **Withdrawn — superseded by [ADR-027](./ADR-027-lead-gen-bundle-excludes-n8n.md)**
- Date: 2026-05-06
- Withdrawn: 2026-05-06
- Related: ADR-024 (lead-gen website appliance contract), ADR-025
  (ops-status ledger), ADR-027 (the actual decision).

> **Withdrawal note.** ADR-026 was drafted to handle per-site
> variation of the Quadlet set (specifically: which sites bundle
> `n8n.container`). Reviewing actual operator practice clarified
> that no site bundles n8n today and none plans to — n8n is always
> provisioned externally when a client needs it. With no per-site
> variation, the manifest's only consumer scenarios collapse to a
> single fixed set, making the manifest itself speculative
> complexity. ADR-027 removes bundled n8n and locks the Quadlet set
> as a constants module. The reasoning in this ADR is preserved as
> a record of the considered alternative.

## Context

ADR-024 named n8n as optional per-client automation infrastructure
and accepted `AUTOMATION_PROVIDER=noop` as a valid production
configuration. Pass 01 implemented this at the **runtime layer** —
`readAutomationProviderConfig` and `validateAutomationProviderConfig`
are shared across launch gate, deploy preflight, runtime resolver,
and worker startup, so all four call sites agree on what each
provider requires.

The **infrastructure layer** has the same gap that pass 01 closed for
runtime config:

- The template ships `deploy/quadlets/n8n.container` for every clone,
  regardless of whether the client uses n8n.
- Sites that route through an external automation platform (Zapier,
  Make, n8n.cloud, a client's homegrown endpoint) carry a dormant
  n8n container that wastes CPU and RAM.
- Tooling that needs to know "which Quadlets are part of THIS site's
  deployment" — rollback (pass 05), `deploy:apply` (pass 06),
  `health:live` (pass 09) — has no source of truth to read.

The two layers are independent decisions that can vary per site:

- **Runtime:** `AUTOMATION_PROVIDER` selects how leads leave the
  outbox. `webhook` already covers any HTTPS+secret platform
  (Zapier/Make/external n8n/custom backend); `n8n` is for n8n's
  expected request shape; `noop` is the no-automation case.
- **Infrastructure:** which container services run as part of the
  site bundle. Today this is hardcoded; ADR-026 makes it
  declarative.

## Decision

`site.project.json` gains an explicit deployment manifest under the
existing `deployment` object:

```json
{
	"deployment": {
		"unitName": "project-web",
		"containerImage": "ghcr.io/owner/repo-name:<sha>",
		"quadlets": ["web.container", "postgres.container", "worker.container"],
		"rollbackQuadlets": ["web.container", "worker.container"]
	}
}
```

### Fields

- `quadlets`: ordered list of Quadlet filenames the site deploys.
  Filenames are relative to `deploy/quadlets/`. The template
  repository's working tree may contain Quadlets that no specific
  site deploys (e.g. `n8n.container` ships in the template; only
  sites that opt in include it in their manifest).
- `rollbackQuadlets`: subset of `quadlets` that participate in image
  rollback (i.e. share the app image and get their `Image=` line
  rewritten when rolling back). Postgres and n8n use distinct
  images and are therefore typically excluded.

### Defaults

When `deployment.quadlets` or `deployment.rollbackQuadlets` are
absent, tooling applies the lead-gen baseline from ADR-024:

- `quadlets`: `['web.container', 'postgres.container', 'worker.container']`
- `rollbackQuadlets`: `['web.container', 'worker.container']`

### Validation

- Every entry in `quadlets` must reference an existing file under
  `deploy/quadlets/`.
- `rollbackQuadlets` must be a subset of `quadlets`.
- **Cross-layer consistency:** if `AUTOMATION_PROVIDER=n8n` and
  `N8N_WEBHOOK_URL` resolves to a local-bundle host (`localhost`,
  `127.0.0.1`, `::1`, or the conventional `n8n` hostname), then
  `n8n.container` must be in `quadlets`. Otherwise the runtime
  cannot reach the URL it's configured for.

Validation is enforced by `scripts/doctor.ts` and the launch gate
(`scripts/lib/launch-blockers.ts`).

### How the three deployment cases map

| Client situation                                      | `AUTOMATION_PROVIDER` | `quadlets` manifest        |
| ----------------------------------------------------- | --------------------- | -------------------------- |
| Self-hosted n8n in the bundle                         | `n8n`                 | baseline + `n8n.container` |
| External automation (Zapier, Make, n8n.cloud, custom) | `webhook`             | baseline only              |
| No automation (outbox + worker noops)                 | `noop`                | baseline only              |

A self-hosted n8n route uses `AUTOMATION_PROVIDER=n8n` with
`N8N_WEBHOOK_URL=http://n8n:5678/webhook/lead`. An external n8n
instance can use either `n8n` (for n8n's expected request shape) or
`webhook` (generic), with the URL pointing at the remote host; in
both cases `n8n.container` is absent from the manifest.

## Alternatives considered

- **Hardcoded `n8n.container` always present.** Rejected: every site
  carries a dormant n8n container; rollback and deploy tooling has
  no per-site source of truth; case 2 (external) and case 3 (noop)
  pay the cost.
- **Predefined profiles** (e.g. `lead-gen-basic`, `lead-gen-with-n8n`,
  `lead-gen-with-redis`). Rejected: too rigid; future infrastructure
  needs would force new profiles. A composable manifest scales
  better.
- **Auto-detect Quadlets from filesystem.** Rejected: filesystem
  state can drift from intent (a Quadlet file present on disk but
  not deployed, or vice versa). A declarative manifest matches the
  rest of `site.project.json`'s style.
- **A new `automation` profile field separate from the manifest**
  (e.g. `automation: 'self-hosted-n8n'`). Rejected: conflates the
  runtime and infrastructure layers that pass 01 was careful to
  keep separate. The manifest stays purely about which containers
  deploy; `AUTOMATION_PROVIDER` stays purely about which provider
  the worker uses.

## Consequences

- `site.project.json` is the single source of truth for site bundle
  composition. Pass 05 (rollback CLI) reads `rollbackQuadlets`.
  Pass 06 (`deploy:apply`) reads `quadlets`. Pass 09 (`health:live`)
  reads `quadlets`. None of those passes invent their own list.
- Adding new infrastructure to a future template variant (Redis,
  search, queue) follows the same opt-in pattern: drop the Quadlet
  in `deploy/quadlets/`, add it to the manifest. No new
  abstraction.
- Removing infrastructure: drop from manifest. The Quadlet file can
  remain in the template's working tree as a starter for sites
  that need it later.
- The cross-layer consistency check eliminates a class of silent
  failures (`AUTOMATION_PROVIDER=n8n` with no n8n container) that
  would otherwise show up as runtime errors after launch.

## Out of scope (intentional)

- **Generating Quadlet files from the manifest.** The manifest is
  descriptive, not generative. Operators still author Quadlet files
  by hand.
- **Adding new Quadlet types** (Redis, search, queue). The current
  template ships `web`, `postgres`, `worker`, `n8n`. Future
  templates may add more; ADR-026 doesn't speculate.
- **A plugin system for arbitrary automation providers.** The
  existing `n8n | webhook | noop` set covers the cases ADR-024
  named. New providers are added when a real client requires one,
  by extending the `AutomationProvider` interface from pass 01.
- **Migrating existing sites.** This is a template; sites cloned
  from prior versions of the template can either backfill the
  manifest fields or rely on the defaults applied by tooling.
