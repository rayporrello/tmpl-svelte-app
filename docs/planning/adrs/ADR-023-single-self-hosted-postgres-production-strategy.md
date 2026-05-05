# ADR-023: Single Self-Hosted Postgres Production Strategy

Status: Accepted

Date: 2026-05-05

## Context

The template previously documented more than one production database path:
bundled Postgres for self-hosted installs, provider-hosted databases for
operators who preferred provider backups/HA, and occasional local Docker/native
Postgres setup notes. That made deployment docs, preflight checks, backup
expectations, and operator runbooks weaker than the actual intended use.

This template is clone-and-customize for my own servers. Every production site
is a DB-backed business/forms/workflow site running on rootless Podman with Bun.

## Decision

All production sites use one dedicated bundled Postgres container/cluster:

- `<project>-postgres` is required production infrastructure.
- The app database is `<project>_app`.
- The app role is `<project>_app_user`.
- The web and worker containers use `DATABASE_URL` as the internal
  Podman-network URL to `<project>-postgres`.
- Host/operator tools use `DATABASE_DIRECT_URL` for migrations, backups,
  restores, Drizzle Studio, and maintenance through the loopback-published
  Postgres port.
- Managed Postgres providers are not a supported template path.
- Multiple client sites must not share one Postgres container/cluster.
- The automation worker is required infrastructure; form actions capture source
  rows and outbox rows first, then the worker delivers later.
- n8n is optional per client. When enabled, it uses `<project>_n8n` and
  `<project>_n8n_user` inside the same client Postgres cluster. The app role
  cannot read n8n data and the n8n role cannot read app data.
- WAL-G/PITR backups and restore drills are required production operations.

Hyphens in the project slug become underscores for Postgres identifiers.

## Consequences

- Lower marginal cost per site because every site carries its own database
  without a managed-provider bill.
- Stronger per-client isolation and simpler lift-and-shift portability.
- One PITR backup captures app data and optional n8n state atomically.
- Operators take on more responsibility for Postgres health, patching, WAL-G,
  restore drills, and capacity planning.
- This is not equivalent to managed multi-zone HA unless a project explicitly
  adds that later.
- Validation and docs can be stricter because there is no database strategy
  choice to preserve.
