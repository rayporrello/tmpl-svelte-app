# ADR-023 — Single Self-Hosted Postgres Production Strategy

Status: Withdrawn  
Date: 2026-05-08

This ADR is retained as a tombstone. The accepted dedicated per-site Postgres
container strategy was retired before any live client data existed.

Production now uses one web-data-platform-owned shared Postgres cluster with one database
and one role per client. See [ADR-031](ADR-031-shared-infrastructure-cell.md).
