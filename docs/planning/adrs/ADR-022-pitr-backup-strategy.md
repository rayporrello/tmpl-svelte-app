# ADR-022 — PITR Backup Strategy

Status: Withdrawn  
Date: 2026-05-08

This ADR is retained as a tombstone. The website template no longer owns
production Postgres, WAL-G, PITR checks, backup timers, or restore drills.

The backup strategy moved to `platform-infrastructure` as part of
[ADR-031](ADR-031-shared-infrastructure-cell.md). Any future cluster backup,
PITR, restore drill, or per-client export decision belongs there.
