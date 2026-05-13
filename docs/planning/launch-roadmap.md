# Launch Roadmap

Last updated: 2026-05-13

This file is a historical launch checkpoint, not the active runbook. Current
launch instructions live in [docs/getting-started.md](../getting-started.md),
[docs/operations/connect-to-platform.md](../operations/connect-to-platform.md),
and the `web-data-platform` runbooks. The architecture follows
[ADR-031](adrs/ADR-031-shared-infrastructure-cell.md).

## Current Status

- Website repo: web app, content, forms, Drizzle schema, local bootstrap,
  web-only deploy artifacts.
- web-data-platform repo: shared network, shared Postgres, fleet worker, provisioning,
  production secrets rendering, fleet migrations, backups, restore, and Caddy
  site-block generation.
- First website deploy: `bun run launch:deploy`, which gates on the platform
  launch checklist, delegates to `deploy:apply`, runs `deploy:smoke`, runs
  `web:test-contact-delivery`, and marks the contact-delivery checklist item.

## Historical Phase 1

Clean `tmpl-svelte-app` in place. Delete retired per-site production
infrastructure, collapse Drizzle migrations to a baseline, and update docs/tests.

## Historical Follow-Up

The original follow-up was to build the `web-data-platform` skeleton, registry,
secrets rendering, provisioning, fleet worker, shared cluster backup/restore,
and migration orchestration. That work has moved into the platform repo; do not
use this planning note as a live task list.
