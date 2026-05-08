# ADR-025 — Ops Status Ledger

Status: Accepted, updated by ADR-031  
Date: 2026-05-08

## Decision

The website repo keeps a small local ops ledger for web deploy evidence:

- release records
- rollback events
- deploy smoke events
- recent health events

Backup and restore facts no longer live in this repo's ledger because those
operations moved to `platform-infrastructure`.

## Ledger Paths

Website state remains under the project ops state directory:

```text
releases.json
events.ndjson
```

Platform state and fleet-wide backup/restore evidence are separate and owned by
the platform repo.

## Consequences

`deploy:apply`, rollback, health, and admin health stay useful for the web
service without pretending the website repo operates the shared cluster.
