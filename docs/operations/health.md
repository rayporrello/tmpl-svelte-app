# Health

The website health surface reports website facts. Platform cluster, backup,
restore, and fleet-worker health are platform concerns.

## Endpoints

| Endpoint        | Purpose                              |
| --------------- | ------------------------------------ |
| `/healthz`      | Process liveness, always lightweight |
| `/readyz`       | Postgres connectivity/readiness      |
| `/admin/health` | Authenticated web health view        |

`/readyz` does not depend on a worker being present.

## CLI

```bash
bun run health:live
```

The live health command can report:

- current release and previous rollback-safe release
- recent web deploy/smoke events
- `web.service` status
- disk and certificate probes
- outbox depth, dead letters, and smoke backlog for this client DB

## Interpreting Results

Outbox warnings mean the platform fleet worker may need inspection, but this
repo does not own the daemon. Use the platform runbook for fleet-worker status
and cross-client dead-letter views.
