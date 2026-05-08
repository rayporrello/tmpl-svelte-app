# ADR-030 — Health Surface Architecture

Status: Accepted, updated by ADR-031  
Date: 2026-05-08

## Decision

The website health surface reports website facts only:

- current/previous release ledger state
- recent web deploy and smoke events
- `web.service` systemd status
- disk and certificate probes
- `/readyz` database connectivity
- outbox depth, dead-letter count, and smoke backlog for the client DB

Backup, restore, and fleet-worker health are platform health concerns.

## Endpoints

- `/healthz` is process liveness and should stay lightweight.
- `/readyz` checks Postgres readiness and does not require a worker.
- `/admin/health` surfaces the same web-oriented health model behind admin auth.

## Consequences

The website health page stays accurate without requiring access to cluster-level
operations state.
