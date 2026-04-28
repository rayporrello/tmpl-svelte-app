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

---

## Schema

Starter tables live in [src/lib/server/db/schema.ts](../../src/lib/server/db/schema.ts):

| Table                     | Purpose                                                                          |
| ------------------------- | -------------------------------------------------------------------------------- |
| `contact_submissions`     | Persists contact form submissions for audit and follow-up                        |
| `automation_events`       | Tracks outbound webhook events with retry state (`pending → completed / failed`) |
| `automation_dead_letters` | Captures events that exceeded retry limits                                       |

Extend the schema by adding tables to `schema.ts` and running `bun run db:generate`.

---

## Local setup

1. **Create a Postgres database:**

   ```bash
   createdb site_db
   createuser site_user --pwprompt
   psql site_db -c "GRANT ALL ON DATABASE site_db TO site_user;"
   psql site_db -c "GRANT ALL ON SCHEMA public TO site_user;"
   ```

   Or use the Podman Quadlet if the project has one provisioned.

2. **Set `DATABASE_URL` in your environment:**

   ```
   DATABASE_URL=postgres://site_user:yourpassword@127.0.0.1:5432/site_db
   ```

   - For SOPS workflow: add to `secrets.yaml`, then `bun run secrets:render`.
   - For direct `.env` workflow: copy `.env.example` to `.env` and fill in the value.

3. **Run migrations:**
   ```bash
   bun run db:migrate
   ```

---

## Scripts

| Script                | Effect                                                          |
| --------------------- | --------------------------------------------------------------- |
| `bun run db:generate` | Generate a new migration file from schema changes               |
| `bun run db:migrate`  | Apply pending migrations to the database                        |
| `bun run db:push`     | Push schema changes directly (dev only — skips migration files) |
| `bun run db:studio`   | Open Drizzle Studio at `http://127.0.0.1:4983`                  |
| `bun run db:check`    | Check for schema drift between schema.ts and the DB             |

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

- [ ] `DATABASE_URL` is in `secrets.yaml` (encrypted) and verified non-empty
- [ ] `bun run db:migrate` has been run against the production database
- [ ] The Postgres user has `CONNECT`, `SELECT`, `INSERT`, `UPDATE`, `DELETE` on application tables — not superuser
- [ ] `/readyz` returns 200 with the production URL
- [ ] A backup schedule is configured (see [docs/deployment/runbook.md](../deployment/runbook.md))

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
