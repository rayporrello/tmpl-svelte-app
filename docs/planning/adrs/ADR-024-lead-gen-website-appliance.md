# ADR-024 — Lead-Gen Website Profile

Status: Accepted, rewritten by ADR-031  
Date: 2026-05-08

## Decision

The default product is a reliable lead-gen website, not a full per-site
infrastructure appliance.

The website repo ships:

- SvelteKit + Bun web runtime
- Postgres-backed contact/form persistence
- transactional automation outbox tables and enqueue helpers
- local dev Postgres bootstrap
- one-shot local dev automation worker
- SEO, CMS, forms, privacy, health, deploy, and launch checks
- web-only Podman Quadlet

The website repo does not ship production Postgres, production worker daemon,
backup/PITR, restore, or platform network artifacts.

## Production Contract

Production websites connect to web-data-platform-owned shared infrastructure:

- `web-platform.network`
- `web-platform-postgres`
- database-per-client isolation
- platform fleet worker
- platform-rendered runtime env files

Postmark remains the production notification path for lead email. The platform
repo owns automation provider secrets and fleet-worker delivery.

## Consequences

- Local development remains simple and self-contained.
- Production operations move to one place.
- Per-site management load drops sharply.
- The website template stays focused on the client-facing site surface.
