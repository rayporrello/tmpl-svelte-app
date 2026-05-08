# Database

Postgres + Drizzle remains the default data layer. The isolation boundary is now
database-per-client inside the platform-owned shared cluster.

## Runtime Contract

Production `DATABASE_URL` is rendered by `platform-infrastructure` and points at
the shared network hostname:

```env
CLIENT_SLUG=example-client
DATABASE_URL=postgres://example_client_app_user:...@web-platform-postgres:5432/example_client_app
DATABASE_POOL_MAX=5
DATABASE_STATEMENT_TIMEOUT_MS=5000
```

This website repo no longer ships or provisions production Postgres. There is no
`DATABASE_DIRECT_URL`, no `POSTGRES_*` production env, and no per-site Postgres
Quadlet in this repo.

## Schema

Starter tables live in `src/lib/server/db/schema.ts`:

| Table                     | Purpose                                               |
| ------------------------- | ----------------------------------------------------- |
| `contact_submissions`     | Persists lead/contact submissions                     |
| `automation_events`       | Durable outbox rows for fleet-worker delivery         |
| `automation_dead_letters` | Exhausted delivery errors without full payload copies |

The current migration history is collapsed to `drizzle/0000_baseline.sql`
because no live client data existed during the redirect. The baseline preserves
the same schema, including `contact_submissions.is_smoke_test`.

## Local Development

`./bootstrap` still provisions a local Podman Postgres container and writes a
loopback `DATABASE_URL`.

```bash
./bootstrap
bun run db:generate
bun run db:migrate
bun run db:check
bun run privacy:prune
```

## Production Migrations

Fleet migrations are run from the platform repo:

```bash
bun run -C ../platform-infrastructure platform:run-fleet-migrations -- --client=<slug>
```

`deploy:apply` verifies migration status through the platform CLI before
swapping the web image. The website repo records release evidence locally but
does not maintain a separate migration ledger; Drizzle's own
`drizzle.__drizzle_migrations` table remains source of truth.

## Readiness

| Endpoint   | Checks                              | Status    |
| ---------- | ----------------------------------- | --------- |
| `/healthz` | App process                         | 200       |
| `/readyz`  | App process + Postgres connectivity | 200 / 503 |

`/readyz` does not depend on a worker being present. The fleet worker is a
platform service.
