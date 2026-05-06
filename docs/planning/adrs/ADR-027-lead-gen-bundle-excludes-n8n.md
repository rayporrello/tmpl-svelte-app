# ADR-027: Lead-gen bundle excludes n8n; automation is external

- Status: Accepted
- Date: 2026-05-06
- Related: ADR-024 (lead-gen website appliance contract), ADR-025
  (ops-status ledger).
- Supersedes: ADR-026 (per-site Quadlet manifest, withdrawn).

## Context

ADR-024 declared the lead-gen website appliance with web + Postgres

- worker as the production-required baseline and named n8n as
  "optional per-client automation infrastructure." Pass 01
  implemented the runtime side cleanly: `AUTOMATION_PROVIDER`
  selects `n8n | webhook | noop`, and a single config validator
  (`validateAutomationProviderConfig`) is shared across launch gate,
  deploy preflight, runtime resolver, and worker startup.

The infrastructure side of "optional n8n" was less clean. The
template ships:

- `deploy/quadlets/n8n.container` and `deploy/quadlets/n8n.volume`
  in the working tree.
- `scripts/enable-n8n.sh` (invoked via `bun run n8n:enable`) that
  provisions an n8n schema and role **inside the site's Postgres**
  container, generates a password, and instructs the operator to
  copy the n8n Quadlets into `~/.config/containers/systemd/`.
- Init-time rewriting (`scripts/lib/site-project.ts`) that
  project-slug-aware-rewrites the n8n Quadlets when a clone is
  initialized.
- Protected-files entries (`scripts/lib/protected-files.ts`) that
  prevent the n8n Quadlets from being deleted by tooling.
- Bootstrap (`scripts/check-bootstrap.ts`) and init-site
  (`scripts/check-init-site.ts`) checks that treat the n8n
  Quadlets as required template artifacts.
- A CI workflow special-case for the n8n Quadlets.

That arrangement is the worst of both worlds: n8n is half-coupled
to the site (init-time rewrites, protected status, bootstrap
checks, CI special-cases, shared Postgres) without ever being
auto-deployed. ADR-026 attempted to formalize the variation as a
per-site manifest, but reviewing operator practice clarified that
no site bundles n8n. None plans to.

The operator's actual practice: **n8n is provisioned separately**
when a client needs it — typically a single shared n8n instance
serving multiple clients, or an n8n.cloud subscription, or a
client's existing automation platform (Zapier, Make, custom
backend) reached over webhook.

## Decision

The lead-gen site bundle is **locked** at three Quadlets:

- `web.container`
- `postgres.container`
- `worker.container`

n8n is not part of any site's bundle. The template removes:

- `deploy/quadlets/n8n.container`
- `deploy/quadlets/n8n.volume`
- `scripts/enable-n8n.sh`
- The `n8n:enable` entry in `package.json`
- All init-time rewriting and protected-files entries for n8n
  Quadlets.
- All bootstrap and init-site checks that treat n8n Quadlets as
  required.
- The CI special-case for n8n Quadlets.

What stays:

- `AUTOMATION_PROVIDER` accepts `n8n` as a value. Clients with an
  external n8n instance (n8n.cloud or self-hosted on a separate
  host) pick this for the n8n-specific request shape.
- `AUTOMATION_PROVIDER=webhook` is the path for Zapier, Make,
  custom backends, anything HTTPS+secret.
- `AUTOMATION_PROVIDER=noop` is a valid production path
  (per ADR-024).
- The n8n env-var schema in `src/lib/server/env.ts` stays — those
  vars now describe the connection to an _external_ n8n endpoint
  rather than a bundled one. The accompanying source comment is
  updated.

### How the three real deployment cases map

| Client situation                                 | `AUTOMATION_PROVIDER` | Where n8n runs (if at all)                |
| ------------------------------------------------ | --------------------- | ----------------------------------------- |
| External n8n (shared self-hosted, n8n.cloud)     | `n8n`                 | Separate host or SaaS, not in this bundle |
| External non-n8n platform (Zapier, Make, custom) | `webhook`             | The platform's own infrastructure         |
| No automation                                    | `noop`                | n/a                                       |

### Quadlet set as a constants module

A small `scripts/lib/quadlets.ts` exports:

```ts
export const ALL_QUADLETS = ['web.container', 'postgres.container', 'worker.container'] as const;

export const ROLLBACK_QUADLETS = ['web.container', 'worker.container'] as const;
```

`ALL_QUADLETS` is consumed by deploy-side tooling (pass 06
`deploy:apply`, pass 09 `health:live`). `ROLLBACK_QUADLETS` is the
subset that participates in image rollback (pass 05).
`postgres.container` is excluded from rollback because it has its
own image (Postgres image, not the app image).

Per-site variation is reconsidered only if a real second case
appears (e.g. a future template variant adds Redis or search and
some sites opt out).

## Alternatives considered (and rejected)

- **Per-site Quadlet manifest in `site.project.json`** (ADR-026,
  withdrawn). Rejected: solves a per-site variation that doesn't
  exist.
- **Keep n8n.container in the working tree as a "starter" file
  that is not deployed by default.** Rejected: the present-state
  template has exactly that, and it created the half-coupled mess
  that motivated this ADR. Operators read "file in deploy/" as
  "part of the deployment."
- **Move n8n.container to `templates/optional/n8n/`.** Rejected:
  unused starter scaffolding tends to drift; an external runbook
  (or vendor's docs) is a better source for "how to set up n8n."
- **Provision n8n's DB inside the site Postgres but run n8n
  externally.** Rejected: still couples lifecycles for backup,
  restore, rollback, and version upgrades. Cleaner if n8n owns its
  own DB on its own host.

## Consequences

- The site bundle is smaller, simpler, and more uniform. Every
  site clone deploys the same three containers.
- n8n's lifecycle is fully decoupled from the website's. n8n
  upgrades, backups, and resource allocation are handled in
  whatever ops surface the operator chooses.
- One self-hosted n8n instance can serve many client sites with no
  per-site overhead.
- `enable-n8n.sh` is gone. Operators provisioning external n8n
  follow whatever runbook applies to their hosting choice
  (n8n.cloud onboarding, Quadlet bundle on a separate machine,
  etc.). That is intentionally not in scope of this template.
- A future template variant that needs a different infrastructure
  shape (e.g. Redis, search, queue) ships the relevant `.container`
  files in `deploy/quadlets/` and updates `ALL_QUADLETS`. If
  per-site variation appears at that point, the manifest concept
  from ADR-026 can be revisited.

## Out of scope

- **Documentation for self-hosting n8n.** Belongs in a separate
  ops runbook or vendor docs, not this template.
- **Migrating prior clones** that have n8n Quadlets present. The
  operator of a site cloned before this change can either delete
  the files or leave them; nothing here removes them from already-
  running deployments.
- **Removing the `n8n` provider option from
  `AUTOMATION_PROVIDER`.** It stays — clients with external n8n
  still need it for the n8n-specific request shape.
- **Adding new Quadlet types** (Redis, search, queue). Out of
  ADR-024 scope.
