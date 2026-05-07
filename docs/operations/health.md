# Live Health

The template has two operator health surfaces:

- `bun run health:live` for SSH sessions on the host. It reads the ops-status
  ledger plus host-live probes such as systemd units, disk space, and
  certificate expiry.
- `/admin/health` for browser operations. It reads the same ledger plus DB-live
  probes such as outbox depth, dead letters, and smoke backlog.

Both surfaces render the same `OpsResult` shape from
`scripts/lib/health-engine.ts`. The source tag tells you what kind of fact you
are reading:

| Tag         | Meaning                                                |
| ----------- | ------------------------------------------------------ |
| `ledger`    | Snapshot evidence from `~/.local/state/<project>/ops/` |
| `live-host` | Host-side probe from the current machine               |
| `live-db`   | Database-side probe from the running app database      |

Use the distinction while triaging. A green backup or restore drill is ledger
evidence; a green outbox depth is live DB evidence.

## CLI

Run the full host view:

```bash
bun run health:live -- --no-color
```

Read only the ledger, useful when the host probes are unavailable:

```bash
bun run health:live -- --source=ledger --json
```

Run it remotely:

```bash
ssh <host> "cd <project> && bun run health:live -- --no-color"
```

## Web View

Open `/admin/health` in a browser. It is server-rendered and has no live
JavaScript updates; refresh the page for a new read.

Access is enforced by Caddy `basicauth` on `/admin/*`. Generate the password
hash on the host:

```bash
caddy hash-password
```

Example output:

```text
$2a$14$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY12
```

Store the hash as `HEALTH_ADMIN_PASSWORD_HASH` in `secrets.yaml` and render the
production env file. Never write the cleartext password into repo files.

## Probes

| Probe              | Source      | Meaning                                                  | Remediation                                        |
| ------------------ | ----------- | -------------------------------------------------------- | -------------------------------------------------- |
| Current release    | `ledger`    | `releases.json` has deploy evidence                      | See [deploy apply](deploy-apply.md)                |
| Backup recency     | `ledger`    | `backup.json` has a recent successful backup attempt     | See [backups](backups.md)                          |
| Restore drill      | `ledger`    | Latest restore drill exists and is fresh                 | See [restore drill](restore-drill.md)              |
| Recent events      | `ledger`    | `events.ndjson` can be read                              | See [ops ledger](ops-status-ledger.md)             |
| Systemd units      | `live-host` | Web, Postgres, and worker units are active               | See [deployment runbook](../deployment/runbook.md) |
| Disk free          | `live-host` | Root filesystem has headroom                             | See [backups](backups.md)                          |
| Certificate expiry | `live-host` | HTTPS certificate is not expired or close to expiry      | See [deployment runbook](../deployment/runbook.md) |
| Outbox depth       | `live-db`   | Automation worker is keeping up                          | See [automations](../automations/README.md)        |
| Dead letters       | `live-db`   | No exhausted automation failures are waiting             | See [automations](../automations/README.md)        |
| Smoke backlog      | `live-db`   | Old smoke rows are below ADR-029's fail-closed threshold | See [smoke](smoke.md)                              |

Each live probe has a 5-second timeout. A timeout becomes a warning and the
remaining probes continue, so one slow subsystem does not hide the rest of the
health view.
