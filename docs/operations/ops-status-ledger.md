# Ops Status Ledger

The website repo keeps local evidence for website deploy operations.

## Channels

```text
releases.json
events.ndjson
```

Release records capture image, SHA, deployment time, migration safety, and the
migration filenames associated with that web deploy. `events.ndjson` captures
deploy, rollback, and smoke events.

Backup, restore, PITR, and fleet-worker state moved to
`platform-infrastructure`.

## Location

By default the state directory is under the operator user's local state path for
the project. Tests can override it with `OPS_STATE_DIR`.

## Consumers

- `deploy:apply`
- `rollback`
- `health:live`
- `/admin/health`
