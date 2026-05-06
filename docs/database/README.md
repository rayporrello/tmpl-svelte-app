# Database

Postgres + Drizzle is the default data layer for this template. Every project built from this template is expected to have a Postgres database. Projects that need only editorial content (blog posts, CMS pages) still need a database for contact submissions, automation events, and future runtime records.

---

## Architecture

| Layer   | Package                  | Purpose                                             |
| ------- | ------------------------ | --------------------------------------------------- |
| Driver  | `postgres` (postgres.js) | Low-level Postgres client; lazy connection pool     |
| ORM     | `drizzle-orm`            | Schema definition, query builder, type-safe queries |
| Tooling | `drizzle-kit`            | Migrations, schema push, Drizzle Studio             |

**Connection lifecycle:**

- `DATABASE_URL` is validated by `initEnv()` at server startup (first request).
- The `postgres` client is initialized lazily when `$lib/server/db/index` is first imported.
- No actual TCP connection is made until the first query.

**Pool configuration** (in `src/lib/server/db/index.ts`):

- `idle_timeout: 30` — close idle connections after 30 seconds so a hung client doesn't keep a slot.
- `connect_timeout: 10` — fail fast on connection attempts; surfaces DB outages instead of hanging requests.
- `max` — left at the postgres-js default (10), which is appropriate for a single-instance marketing site. Tune upward if you add high-traffic routes or run multiple worker processes.

A `statement_timeout` is intentionally not set client-side — enforce it on the app Postgres role with `ALTER ROLE <project>_app_user SET statement_timeout = '5s'` for portable enforcement across all clients.

---

## Schema

Starter tables live in [src/lib/server/db/schema.ts](../../src/lib/server/db/schema.ts):

| Table                     | Purpose                                                                      |
| ------------------------- | ---------------------------------------------------------------------------- |
| `contact_submissions`     | Persists contact form submissions for audit and follow-up                    |
| `automation_events`       | Durable automation outbox with retry, locking, and idempotency state         |
| `automation_dead_letters` | Captures events that exceeded retry limits without duplicating full payloads |

Extend the schema by adding tables to `schema.ts` and running `bun run db:generate`.
For business forms, prefer one typed source table per meaningful workflow and
register it in `src/lib/server/forms/registry.ts`; see
[docs/forms/README.md](../forms/README.md).

The fastest typed-form path is:

```bash
bun run scaffold:form -- --slug=idea-box --title="Idea Box" --description="Send a small project idea."
bun run db:generate
bun run db:migrate
```

The scaffold edits `schema.ts`; it intentionally does not fake a migration file.

The runtime tables include pruning indexes for privacy retention:

- `contact_submissions(created_at)`
- `automation_events(status, created_at)`
- `automation_events(status, next_attempt_at, created_at)`
- `automation_events(idempotency_key)`
- `automation_dead_letters(created_at)`

Default retention windows live in `src/lib/server/privacy/retention.ts` and are documented in [docs/privacy/data-retention.md](../privacy/data-retention.md). Run `bun run privacy:prune` for a dry-run and `bun run privacy:prune -- --apply` to delete expired rows.

---

## Runtime Contract

Production always runs a dedicated bundled Postgres container for each site:

- `<project>-postgres` is the only production database service for the site.
- `<project>_app` is the app database and `<project>_app_user` is the app role.
- Web and worker containers use `DATABASE_URL=postgres://...@<project>-postgres:5432/<project>_app`.
- Host tools use `DATABASE_DIRECT_URL=postgres://...@127.0.0.1:5432/<project>_app`.
- `DATABASE_DIRECT_URL` is for migrations, backups, restores, and Drizzle Studio; do not use it inside web/worker containers.
- Managed Postgres providers and shared client clusters are not supported production paths for this template.

Hyphens in the project slug become underscores for Postgres identifiers.

Automation platforms are external to this database. If a site uses n8n,
Zapier, Make, or a custom receiver, the worker reaches it over HTTPS using the
configured automation provider; the website Postgres cluster remains dedicated
to app data and the outbox.

## Local setup

Use `./bootstrap` for local development. It provisions the local Podman
Postgres container, writes both database URLs to `.env`, runs migrations, and
verifies connectivity.

```bash
./bootstrap
bun run check:db
```

If you edit schema after bootstrap, generate and apply migrations:

```bash
bun run db:generate
bun run db:migrate
```

---

## Scripts

| Script                  | Effect                                                            |
| ----------------------- | ----------------------------------------------------------------- |
| `bun run db:generate`   | Generate a new migration file from schema changes                 |
| `bun run db:migrate`    | Apply pending migrations to the database                          |
| `bun run db:push`       | Push schema changes directly (dev only — skips migration files)   |
| `bun run db:studio`     | Open Drizzle Studio at `http://127.0.0.1:4983`                    |
| `bun run db:check`      | Check for schema drift between schema.ts and the DB               |
| `bun run privacy:prune` | Dry-run expired runtime-data pruning; pass `-- --apply` to delete |
| `bun run forms:ops`     | Redacted operator inspection for registered form/runtime records  |

`db:push` is useful for rapid iteration in development. Use `db:generate` + `db:migrate` for any change that needs to be tracked and deployed.

---

## Health endpoints

| Endpoint   | Checks                              | Status codes           |
| ---------- | ----------------------------------- | ---------------------- |
| `/healthz` | App process is running              | 200 always             |
| `/readyz`  | App process + Postgres connectivity | 200 ok / 503 unhealthy |

**Monitoring guidance:**

- Caddy `health_uri` and container HEALTHCHECK should point to `/healthz` (lightweight; no DB query).
- Load balancer / orchestration readiness probes should use `/readyz`.
- Alert on sustained `/readyz` failures — they indicate a broken DB connection.

---

## Production checklist

Before going live:

- [ ] `DATABASE_URL` is in `secrets.yaml` and points to `<project>-postgres` on the Podman network
- [ ] `DATABASE_DIRECT_URL` is in `secrets.yaml` and points to the loopback-published host port
- [ ] `deploy/quadlets/postgres.container` and `postgres.volume` are installed for the project
- [ ] `deploy/quadlets/worker.container` is installed for the durable outbox worker
- [ ] `bun run db:migrate` has been run against the production database
- [ ] The Postgres user has `CONNECT`, `SELECT`, `INSERT`, `UPDATE`, `DELETE` on application tables — not superuser
- [ ] `/readyz` returns 200 with the production URL
- [ ] A backup schedule is configured — turnkey path documented in [docs/operations/backups.md](../operations/backups.md) (rclone + systemd timer + Healthchecks)
- [ ] Retention policy reviewed and `bun run privacy:prune` dry-run checked against production counts

---

## Extending the schema

Add a new table to `schema.ts`:

```typescript
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const myTable = pgTable('my_table', {
	id: uuid('id').defaultRandom().primaryKey(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	value: text('value').notNull(),
});
```

Then generate and apply:

```bash
bun run db:generate   # creates drizzle/XXXX_my_table.sql
bun run db:migrate    # applies to database
```

Import and use in a server route:

```typescript
import { db } from '$lib/server/db';
import { myTable } from '$lib/server/db/schema';

const rows = await db.select().from(myTable).limit(10);
```

---

## CI and testing

- **Unit tests** do not require a live database. `checkDbHealth()` accepts an injected executor, so it can be tested with a mock.
- **Playwright e2e tests** use a stub `DATABASE_URL` (non-connectable). No routes tested by e2e make DB queries.
- **CI validate job** passes a stub `DATABASE_URL` so `initEnv()` succeeds without a real Postgres instance.
- If you add routes that query the DB in e2e tests, set up a real test database and update `playwright.config.ts`.
