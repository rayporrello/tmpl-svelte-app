# Restore Drill

The restore drill is a non-destructive PITR validation. It restores the latest
WAL-G base backup into a scratch Postgres container, replays WAL to the target
time, runs a read-only sanity query, removes the scratch resources, and writes
evidence to the local ops-status ledger.

## Schedule

Production installs `deploy/systemd/restore-drill.service` and
`deploy/systemd/restore-drill.timer` alongside the backup timers. The timer runs
weekly:

```text
Sun *-*-* 03:00:00 UTC
```

To override the schedule on a host:

```bash
systemctl --user edit <project>-restore-drill.timer
systemctl --user daemon-reload
systemctl --user restart <project>-restore-drill.timer
```

## Run Manually

Run an immediate drill from the project directory:

```bash
bun run backup:restore:drill
```

To exercise a specific PITR target:

```bash
bun run backup:restore:drill -- --target-time=2026-05-05T14:30:00Z
```

## Read Evidence

The latest result is stored in the ops-status ledger:

```bash
cat ~/.local/state/<project>/ops/restore-drill.json | jq
```

The channel records the attempt time, last success time, overall status, PITR
target time, backup source, duration, and per-step `OpsResult` evidence. A
`restore-drill` event is also appended to `events.ndjson`.

## If It Fails

Do not treat PITR as proven until the drill passes. Start with the step that
failed in `restore-drill.json`, then use the restore guide:

- [Restore guide](restore.md)
- [Ops status ledger](ops-status-ledger.md)
- [ADR-025: Ops status ledger](../planning/adrs/ADR-025-ops-status-ledger.md)
