# ADR-004: Postgres for Runtime Data

## Status

Accepted

## Context

Some planning notes and earlier template drafts included SQLite as a "lighter" default path for runtime data, on the grounds that many projects start small and SQLite is simpler to set up. However, SQLite introduces constraints (single-writer, file-on-disk, limited tooling) that become painful when a project grows into concurrent writes, multiple containers, or the need for a real migration workflow. Switching from SQLite to Postgres later is a disruptive migration.

Editorial content (blog posts, landing page copy, static assets) is separately addressed by Sveltia CMS / file-based Git content (see ADR-014). This ADR concerns only dynamic, application-generated data.

## Decision

Postgres is the prepared/default runtime data path for this template. SQLite is not offered as an alternative or fallback.

- The runtime data dormant module ships with a Postgres container (Podman Quadlet), Drizzle ORM configuration, and a starter migration.
- Drizzle is the schema definition and query layer — not Prisma, not raw SQL string construction.
- The Postgres container is dormant by default; it is activated when a project needs runtime data.
- No managed cloud database (RDS, Supabase, PlanetScale, Vercel Postgres) is the default — runtime data is self-hosted.

## Consequences

- Projects that only need editorial content run with no database container at all.
- Projects that activate runtime data get a production-grade database from day one, without a later migration away from SQLite.
- The Postgres container must be configured with correct credentials (via sops + age encrypted env vars) before activation.
- Backup automation (pg_dump to Cloudflare R2) is available as a companion dormant module.

## Implementation Notes

- Postgres connection string is provided via environment variable; Drizzle config reads it at startup.
- The starter schema stub lives in `src/db/schema.ts` (or equivalent).
- Migration workflow: `bun run db:migrate` applies pending Drizzle migrations.
- The `postgres` superuser does not exist in this setup; the application uses a dedicated database user.

## Revisit Triggers

- If a future project genuinely has zero concurrent-write requirements and needs the absolute simplest possible data layer (e.g., a personal tool with one user), SQLite could be reconsidered for that specific project — but not as the template default.
- If Drizzle's API changes substantially or a clearly better alternative emerges.
