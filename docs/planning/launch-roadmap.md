# Launch Roadmap

Last updated: 2026-05-08

The launch roadmap now follows [ADR-031](adrs/ADR-031-shared-infrastructure-cell.md).

## Current Direction

- Website repo: web app, content, forms, Drizzle schema, local bootstrap,
  web-only deploy artifacts.
- Platform repo: shared network, shared Postgres, fleet worker, provisioning,
  production secrets rendering, fleet migrations, backups, restore, and Caddy
  site-block generation.

## Phase 1

Clean `tmpl-svelte-app` in place. Delete retired per-site production
infrastructure, collapse Drizzle migrations to a baseline, and update docs/tests.

## Next

Build `platform-infrastructure` skeleton, registry, secrets rendering,
provisioning, fleet worker, shared cluster backup/restore, and migration
orchestration.
