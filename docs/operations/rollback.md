# Rollback

Use rollback when the newly deployed app image is bad but the database schema
can safely stay at its current post-migration shape. Rollback changes only the
app image in the web and worker Quadlets. It never reverses migrations.

## Choose The Right Recovery Path

| Situation                                       | Use                                          |
| ----------------------------------------------- | -------------------------------------------- |
| Bad app code, schema is backward-compatible     | `bun run rollback --to previous`             |
| Small bug that can be fixed and redeployed fast | Roll forward with a new release              |
| Data corruption, accidental delete, bad schema  | PITR restore in `docs/operations/restore.md` |
| No rollback-safe prior release                  | Roll forward or PITR; do not skip SHAs       |

The rollback target is the most recent prior release recorded in the
ops-status ledger with `migrationSafety: "rollback-safe"`. If the CLI refuses,
that refusal is part of the safety model.

## Commands

Check the ledger without changing anything:

```bash
bun run rollback --status
```

Preview the plan:

```bash
bun run rollback --to previous --dry-run
```

Apply the Quadlet image edits:

```bash
bun run rollback --to previous
```

The CLI prints the exact commands to run next. It does not execute
`systemctl`:

```bash
systemctl --user daemon-reload
systemctl --user restart web.service worker.service
```

Run those on the host after a successful non-dry-run rollback, then check the
units:

```bash
systemctl --user status web.service worker.service
journalctl --user -u web.service -n 200
journalctl --user -u worker.service -n 200
```

## Why Migrations Are Not Reversed

Database migrations are forward-only operational events in this template.
Rollback-safe means the previous image is expected to run against the current
post-migration schema. Reversing migrations during an incident can destroy
data or strand partially completed writes, so schema rewind belongs to PITR,
not image rollback.

## If Rollback Refuses

Read the refusal text first:

- `no releases on record` means the ledger does not know what is running.
- `no prior release on record` means there is no earlier target.
- `previous release marked rollback-blocked` means the ledger has no safe
  prior target.

When rollback refuses, choose one of these paths:

- Roll forward with a new image that fixes the problem.
- Use PITR from `docs/operations/restore.md` when the database must move back.
- Use the manual fallback in `docs/deployment/runbook.md` only when the ledger
  is unavailable and you have independently confirmed the target image is
  schema-compatible.

## Related Docs

- `docs/deployment/runbook.md`
- `docs/operations/ops-status-ledger.md`
- `docs/operations/restore.md`
- `docs/planning/adrs/ADR-024-lead-gen-website-appliance.md`
- `docs/planning/adrs/ADR-025-ops-status-ledger.md`
- `docs/planning/adrs/ADR-027-lead-gen-bundle-excludes-n8n.md`
