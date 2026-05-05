# Architecture — what runs where

This template is built around one strong opinion: **per-client isolation at
the bundle level**. Every site is a self-contained set of containers and
systemd units, named with the project slug, sharing nothing across clients
except the host's Caddy and the host's age key for SOPS.

This page is the canonical "where does X run" reference. It is the cheat
sheet for moving a client's site to a new host, or for explaining the
deployment to an outside auditor.

---

## A single host

```
┌────────────────────────────────────────────────────────────────────────┐
│  Host (rootless Podman + systemd user units + Caddy)                   │
│                                                                        │
│  Host services (one set per host)                                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Caddy            TLS, HSTS, compression, reverse-proxy          │  │
│  │  SOPS + age       secrets render → ~/secrets/<project>.prod.env  │  │
│  │  rclone           legacy logical-dump push (optional)            │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  Per-client bundle — repeats N times, named <project>-*                │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Containers (Quadlet)                                            │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │  <project>-web        SvelteKit app (svelte-adapter-bun)   │  │  │
│  │  │  <project>-postgres   Postgres 18 + WAL-G baked in         │  │  │
│  │  │  <project>-worker     bun automation:worker:daemon         │  │  │
│  │  │  <project>-n8n        n8n editor + webhook  (only if used) │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  │                                                                  │  │
│  │  Per-client systemd timers (host)                                │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │  <project>-backup-base.timer       daily WAL-G base backup │  │  │
│  │  │  <project>-backup-check.timer      6-hour PITR freshness   │  │  │
│  │  │  <project>-backup.timer            legacy pg_dump (opt)    │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  │                                                                  │  │
│  │  Per-client state                                                │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │  <project>.network                Podman network (Quadlet) │  │  │
│  │  │  <project>-postgres-data          named volume (Quadlet)   │  │  │
│  │  │  <project>-n8n-data               named volume (only n8n)  │  │  │
│  │  │  ~/secrets/<project>.prod.env     rendered runtime env     │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
                              │           │
            ┌─────────────────┘           └────────────────┐
            │                                              │
            ▼                                              ▼
  ┌─────────────────────┐                       ┌─────────────────────┐
  │ Cloudflare R2       │                       │ GitHub              │
  │  Postgres base      │                       │  repo (CMS source)  │
  │  WAL archive        │                       │  GHCR images        │
  │  per <project>      │                       │  CI / deploys       │
  └─────────────────────┘                       └─────────────────────┘
```

A typical 5-client host with three of those clients running automations:

| Component              | Count                   |
| ---------------------- | ----------------------- |
| Host Caddy             | 1                       |
| `<project>-web`        | 5                       |
| `<project>-postgres`   | 5                       |
| `<project>-worker`     | 5                       |
| `<project>-n8n`        | 3 (only when activated) |
| Backup timers per site | 2                       |
| **Total containers**   | **18**                  |

---

## Why per-client bundles

| Goal                         | How the bundle delivers                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Secret isolation             | Each site has its own `<project>.prod.env` and its own database role. n8n is per-client so credentials cannot leak across clients. |
| Lift-and-shift portability   | "Hand the client their site": copy the named volume snapshot + the secrets file + the repo. Reinstall the Quadlets on a new host.  |
| Single off-switch            | `systemctl --user stop <project>-*.service` halts the entire client cleanly, including the worker.                                 |
| Predictable resource ceiling | Quadlet `MemoryHigh=` and `CPUQuota=` per container; one client cannot consume another's headroom.                                 |
| Atomic backups               | One PITR backup per client covers app data AND n8n state. A restore puts both back to the same moment in time.                     |

n8n is the only multi-tenant trap in the stack. Its editor + credentials +
execution history all live in one namespace per instance. Running one
shared n8n across unrelated clients leaks all three. Run **one n8n per
client when activated**, never shared.

---

## Database boundaries inside `<project>-postgres`

When a client activates n8n, the existing `<project>-postgres` container
hosts both schemas, but with separate databases and roles:

```
<project>-postgres (one container)
├── database <project>_app
│   ├── role <project>_app_user                  ← SvelteKit + worker
│   └── tables: contact_submissions, automation_events, ...
└── database <project>_n8n   (only when n8n is enabled)
    ├── role <project>_n8n_user                  ← n8n container only
    └── tables: workflow_entity, credentials_entity, execution_entity, ...
```

The `bun run n8n:enable` helper provisions the second database, role, and
grants. Roles are scoped to their own database — n8n cannot read app
tables, the app cannot read n8n credentials.

A WAL-G base backup captures the entire cluster atomically, so PITR
restores both databases to the same moment.

---

## Backups: live data vs. backup storage

| What                        | Where it lives                               | Notes                                                                             |
| --------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| Live Postgres data          | `<project>-postgres-data` volume on the host | Authoritative; never in R2.                                                       |
| Postgres base backups + WAL | Cloudflare R2                                | Pushed by WAL-G inside the postgres container. R2 prefix is `<project>/postgres`. |
| Git-backed CMS content      | The site's repo                              | Edited via Sveltia CMS or directly. R2 has no role here.                          |
| Static demo upload assets   | The site's repo                              | Committed alongside their `.webp` siblings.                                       |
| Runtime user uploads (rare) | R2, only if a project activates              | Use the optional R2 image module, not the default.                                |

R2 is for backups by default. Promoting it to runtime media storage is a
per-project opt-in.

---

## Automation: where events go

```
HTTPS POST /contact ──▶ <project>-web container
                            │
                            ▼
              ┌───── one Postgres transaction ─────┐
              │                                    │
              ▼                                    ▼
   contact_submissions               automation_events (outbox row)
              │                                    │
              │                                    ▼
              │              <project>-worker container (daemon, 30s poll)
              │                                    │
              │                                    ▼
              │                       AUTOMATION_PROVIDER (env-driven)
              │            ┌────────────┬─────────────┬────────┐
              │            ▼            ▼             ▼        ▼
              │       <project>-n8n   shared n8n   webhook   noop
              │       (per client)    (remote)     (escape   (explicit
              │                                     hatch)    no-op)
              │
              └─▶ form action returns success here regardless of
                  worker/automation outcome. Lead is captured.
```

The contract: **the form action never calls n8n.** It commits the source
record and the outbox event in one transaction; the worker delivers later
with retries and dead-lettering. The site stays available even when the
automation provider is down.

---

## Operating multiple sites on the same host

The naming convention is the only thing that scopes correctly. Every
container, network, volume, env file, role, database, and timer is named
with the project slug. A second site is a fresh clone of the template, a
new `init:site` run, and a fresh set of Quadlets installed under
`~/.config/containers/systemd/`.

If two sites ever need to share state (e.g., a shared CRM read-replica),
that's an explicit cross-bundle decision — not the default.
