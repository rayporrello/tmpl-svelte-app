# ADR-004: Postgres for Runtime Data

## Status

Accepted and Implemented

## Context

Some planning notes and earlier template drafts included SQLite as a "lighter" default path for runtime data, on the grounds that many projects start small and SQLite is simpler to set up. However, SQLite introduces constraints (single-writer, file-on-disk, limited tooling) that become painful when a project grows into concurrent writes, multiple containers, or the need for a real migration workflow. Switching from SQLite to Postgres later is a disruptive migration.

Editorial content (blog posts, landing page copy, static assets) is separately addressed by Sveltia CMS / file-based Git content (see ADR-014). This ADR concerns only dynamic, application-generated data.

## Decision

Postgres is the default runtime data path for this template. SQLite is not offered as an alternative or fallback.

- The template ships with `drizzle-orm`, `postgres` (postgres.js), and `drizzle-kit` installed.
- Drizzle is the schema definition and query layer — not Prisma, not raw SQL string construction.
- `DATABASE_URL` is a required environment variable. The app will not start without it.
- No managed cloud database (RDS, Supabase, PlanetScale, Vercel Postgres) is the default — runtime data is self-hosted.
- A starter schema ships with `contact_submissions`, `automation_events`, and `automation_dead_letters` tables.

## Consequences

- All projects built from this template require a Postgres database. Editorial-only sites are not a special case.
- Projects get a production-grade database from day one, without a later migration away from SQLite.
- `DATABASE_URL` must be set before the app can serve any request. CI uses a stub value; no live DB is required for the validate pipeline.
- Production backup and restore automation is owned by `platform-infrastructure` per ADR-031.

## Implementation Notes

- `DATABASE_URL` is validated by `initEnv()` on first request; missing or empty value throws immediately.
- Driver: `postgres` (postgres.js v3) — lazy connection pool, no TCP connection until first query.
- ORM: `drizzle-orm` with `drizzle-orm/postgres-js` adapter.
- Schema: `src/lib/server/db/schema.ts` — three starter tables.
- DB singleton: `src/lib/server/db/index.ts` — imported lazily by routes that need the DB.
- Health: `src/lib/server/db/health.ts` — `checkDbHealth(db)` issues `SELECT 1`; accepts injected executor for unit testing.
- `/readyz` endpoint checks DB health and returns 503 if unreachable.
- Migration workflow: `bun run db:generate` creates SQL files; `bun run db:migrate` applies them.
- Config: `drizzle.config.ts` at project root reads `DATABASE_URL` from environment.
- The `postgres` superuser does not exist in this setup; the application uses a dedicated database user.
- See [docs/database/README.md](../../docs/database/README.md) for the full setup guide.
- See [docs/database/README.md](../../database/README.md) and [ADR-031](ADR-031-shared-infrastructure-cell.md) for the shared production database path.

## Revisit Triggers

- If a future project genuinely has zero concurrent-write requirements and needs the absolute simplest possible data layer (e.g., a personal tool with one user), SQLite could be reconsidered for that specific project — but not as the template default.
- If Drizzle's API changes substantially or a clearly better alternative emerges.
