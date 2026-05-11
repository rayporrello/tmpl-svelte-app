# tmpl-svelte-app

SvelteKit website template for client lead-gen sites. It ships the per-site app,
content, forms, Drizzle schema, SEO/CMS/design-system tooling, and a web-only
Podman deploy artifact. Production infrastructure is shared and operated from a
separate `web-data-platform` repo.

Local development is unchanged: `./bootstrap` provisions a per-clone local
Postgres container on a hashed loopback port and writes a working `.env`.

## What's Included

- SvelteKit / Svelte 5 with Bun-first tooling
- Token-driven native CSS design system, no Tailwind or component library
- Superforms + Valibot contact form at `/contact`
- Postgres + Drizzle schema for `contact_submissions`, `automation_events`, and
  `automation_dead_letters`
- Transactional automation outbox helpers and a one-shot local dev worker
- Git-backed content system with Sveltia CMS
- SEO route registry, SEO component, sitemap, robots, RSS, and llms.txt
- `/healthz` process liveness and `/readyz` database readiness
- Privacy pruning, forms scaffolding, analytics guardrails, content checks, and
  launch/deploy validation
- Web runtime artifacts: `Containerfile`, `serve.js`,
  `deploy/quadlets/web.container`, and a per-site `deploy/Caddyfile.example`
  snippet

The template no longer ships production Postgres, production worker daemon,
backup/PITR, restore, or site-local network artifacts. Those live in the shared
web-data-platform repo.

## Runtime Shape

Production sites are separate SvelteKit clones, one per client. They share a
shared website data infrastructure cell:

- one Podman bridge network: `web-platform.network`
- one shared Postgres hostname: `web-platform-postgres`
- one database and one role per client
- one fleet worker operated by `web-data-platform`
- one host Caddy install proxying each site through a unique loopback port

This repo owns only the web container for a site. `deploy/quadlets/web.container`
joins `web-platform.network` and publishes `127.0.0.1:<loopbackPort>:3000` for
Caddy.

## Quick Start

```bash
git clone git@github.com:<you>/<your-project>.git
cd <your-project>
./bootstrap
bun run dev
```

Before opening a PR:

```bash
bun run validate
```

Before launch/deploy:

```bash
bun run launch:check
bun run deploy:preflight
```

CI runs `bun run validate:ci`, which adds Playwright, axe, visual smoke, launch,
and deploy-readiness checks.

## Database

`DATABASE_URL` is required at runtime. In production it is rendered by the
web-data-platform repo and points at `web-platform-postgres`:

```env
CLIENT_SLUG=example-client
DATABASE_URL=postgres://example_client_app_user:...@web-platform-postgres:5432/example_client_app
DATABASE_POOL_MAX=5
DATABASE_STATEMENT_TIMEOUT_MS=5000
```

Drizzle migrations live in `drizzle/`. Because this template had no live client
data during the architecture redirect, the migration history is collapsed to a
fresh `0000_baseline.sql` that matches `src/lib/server/db/schema.ts`.

Local commands:

```bash
bun run db:generate
bun run db:migrate
bun run db:check
bun run db:studio
```

Fleet migrations in production are run from `web-data-platform`, not from
this website repo.

## Automation

The app writes minimized outbox rows transactionally. The production fleet worker
is shared website data and reads provider config from web-data-platform secrets per client.

`bun run automation:worker` remains as a one-shot local development tool only.
Its optional provider env vars are still supported in `.env.example` under the
local-dev section:

- `AUTOMATION_PROVIDER`
- `N8N_WEBHOOK_*`
- `AUTOMATION_WEBHOOK_*`

Production website deploys do not require automation provider secrets.

## Deployment

`deploy:apply` is a migration-aware web image swap:

1. run deploy preflight
2. ask the web-data-platform CLI whether migrations are current
3. pull the new GHCR web image
4. update `Image=` in `web.container`
5. reload/restart `web.service`
6. poll `/readyz`
7. run `deploy:smoke`
8. record release evidence locally

## Production Deployment

Production data infrastructure is shared and operated from
`~/web-data-platform`. Set `WEB_DATA_PLATFORM_PATH` when the platform repo is not
at the default sibling path used by deploy scripts:

```bash
export WEB_DATA_PLATFORM_PATH="$HOME/web-data-platform"
```

`deploy:apply` uses that path to run the platform migration gate before swapping
the web image:

```bash
bun run --cwd "$WEB_DATA_PLATFORM_PATH" web:fleet-migration-status -- --client=<slug> --repo=<website-root>
```

The gate reads this repo's Drizzle journal, compares it with the client's shared
Postgres database, refuses drift, verifies a recent backup before applying
pending migrations, and exits non-zero when deploy must stop. The Phase 9 smoke
test in `~/web-data-platform/tests/e2e-smoke.test.ts` is the contract test for
this two-repo flow.

This website template owns its Drizzle schema. The shared platform consumes the
known runtime tables and grants needed for compatibility; see
`~/web-data-platform/docs/decisions/ADR-012-fleet-worker-outbox-state-machine.md`
and
`~/web-data-platform/docs/decisions/ADR-017-public-schema-grants-for-website-compatibility.md`.

## Key Docs

| Area              | Doc                                                                |
| ----------------- | ------------------------------------------------------------------ |
| Getting started   | [docs/getting-started.md](docs/getting-started.md)                 |
| Deployment        | [docs/deployment/README.md](docs/deployment/README.md)             |
| Secrets           | [docs/deployment/secrets.md](docs/deployment/secrets.md)           |
| Database          | [docs/database/README.md](docs/database/README.md)                 |
| Automations       | [docs/automations/README.md](docs/automations/README.md)           |
| Architecture      | [docs/operations/architecture.md](docs/operations/architecture.md) |
| Forms             | [docs/forms/README.md](docs/forms/README.md)                       |
| Design system     | [docs/design-system/README.md](docs/design-system/README.md)       |
| Documentation map | [docs/documentation-map.md](docs/documentation-map.md)             |

## Maintenance Notes

- Package management is Bun only: `bun install`, `bun add`, `bun run`.
- Production secrets are owned by `web-data-platform`; website
  `secrets.yaml` is dev-only if used at all.
- Do not reintroduce per-site production Postgres, worker daemon, backup/PITR,
  restore, or network Quadlets in this repo.
- See [ADR-031](docs/planning/adrs/ADR-031-shared-infrastructure-cell.md) for
  the shared infrastructure decision.
