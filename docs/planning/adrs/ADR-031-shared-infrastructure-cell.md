# ADR-031 — Shared Infrastructure Cell For Client Websites

Status: Accepted  
Date: 2026-05-08

## Context

The template originally moved toward a fully independent production bundle per
client: web, Postgres, worker, backup, restore, and network artifacts in each
site clone. That is unnecessary management overhead for a solo operator with no
live clients yet.

## Decision

Use two repos:

- `tmpl-svelte-app`: per-client SvelteKit website template, cleaned in place.
- `platform-infrastructure`: shared production infrastructure for the website
  fleet.

Use one shared Postgres cluster with one database and one role per client. Use
one shared fleet worker. Use one Podman bridge network named
`web-platform.network`.

## Network

- Shared Postgres hostname: `web-platform-postgres`
- Fleet worker hostname: `web-platform-fleet-worker`
- Website containers join `web-platform.network`
- Website containers publish unique loopback ports for host Caddy
- Other host projects are not members of this network

## Secrets

Production secrets are owned by `platform-infrastructure/secrets.yaml`.
Website `secrets.yaml` is dev-only if it exists.

The platform repo renders:

- `~/secrets/web-platform-cluster.env`
- `~/secrets/<slug>.prod.env`

## Website Repo Consequences

Delete production Postgres, worker daemon, backup/PITR, restore, and site-local
network artifacts. Keep local bootstrap and the one-shot local automation worker.

Collapse Drizzle migrations to a single fresh baseline because no live data
exists.

## Non-Goals

- no `tenant_id`
- no schema-per-client
- no RLS
- no managed Postgres
- no shared SvelteKit app
- no dual deployment mode
