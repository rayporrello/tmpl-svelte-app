# Getting Started

The fast path:

```bash
git clone git@github.com:<you>/<your-project>.git
cd <your-project>
./bootstrap
bun run dev
```

`./bootstrap` provisions a local Podman Postgres container, writes a local
`.env`, applies migrations, and verifies database health. Local development is
still single-clone and self-contained.

Production is different: this website repo now ships only the site web runtime.
Shared Postgres, the fleet worker, production secrets rendering, backups, and
restore are owned by the separate `web-data-platform` repo.

## Prerequisites

- Bun in the version range pinned by `package.json`
- Git and a GitHub account
- Podman for local bootstrap and production web containers
- A Linux host with rootless Podman + host Caddy
- The `web-data-platform` repo on the same host for production work

## Create a Site

1. Create or clone a new project repo from this template.
2. Install dependencies:
   ```bash
   bun install
   ```
3. Initialize the site manifest and generated files:
   ```bash
   bun run init:site
   ```
4. Bootstrap local development:
   ```bash
   ./bootstrap
   ```
5. Start the dev server:
   ```bash
   bun run dev
   ```

`site.project.json` is the durable manifest. `deployment.loopbackPort` is the
production loopback port Caddy will proxy to for this site. The web-data-platform repo's
client registry should reserve the same port.

## Local Development

The local DB path remains intentionally easy:

- local Postgres container name is derived from the project slug
- `.env` contains a loopback `DATABASE_URL`
- `bun run automation:worker` can drain the local outbox once
- optional automation provider vars in `.env.example` are local-dev only

Useful local commands:

```bash
bun run db:generate
bun run db:migrate
bun run db:check
bun run automation:worker
bun run forms:check
bun run validate
```

## Production Handoff

For production, the operator provisions the client from `web-data-platform`:

1. `provision-client --slug=<slug>` creates the DB, role, generated secrets, and
   registry entry.
2. `render-client-env --client=<slug>` writes `~/secrets/<slug>.prod.env`.
3. `run-fleet-migrations --client=<slug>` applies this repo's Drizzle
   migrations to that client's DB.
4. This repo's `deploy/quadlets/web.container` is installed with
   `Network=web-platform.network` and the reserved loopback port.
5. Host Caddy proxies the domain to `127.0.0.1:<loopbackPort>`.

The website container connects to `web-platform-postgres`; Postgres is not
published by this website repo.

## Launch And Deploy

Before launch:

```bash
bun run launch:check
bun run deploy:preflight
```

Deploy is a web image swap:

```bash
bun run deploy:apply -- --image=ghcr.io/<owner>/<repo>:<sha> --sha=<sha>
```

During Phase 1 of the shared-infra redirect, `deploy:apply` warns and proceeds
when the web-data-platform CLI is missing. Once the web-data-platform migration CLI lands, that
migration gate becomes hard-fail.

## What Not To Add Back

Do not restore per-site production Postgres, worker daemon, backup/PITR,
restore, or `web.network` artifacts in this repo. See
[ADR-031](planning/adrs/ADR-031-shared-infrastructure-cell.md).
