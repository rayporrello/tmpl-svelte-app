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

A typical 5-client host:

| Component              | Count  |
| ---------------------- | ------ |
| Host Caddy             | 1      |
| `<project>-web`        | 5      |
| `<project>-postgres`   | 5      |
| `<project>-worker`     | 5      |
| Backup timers per site | 2      |
| **Total containers**   | **15** |

---

## Why per-client bundles

| Goal                         | How the bundle delivers                                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Secret isolation             | Each site has its own `<project>.prod.env` and its own database role. External automation credentials live in the receiver.       |
| Lift-and-shift portability   | "Hand the client their site": copy the named volume snapshot + the secrets file + the repo. Reinstall the Quadlets on a new host. |
| Single off-switch            | `systemctl --user stop <project>-*.service` halts the entire client cleanly, including the worker.                                |
| Predictable resource ceiling | Quadlet `MemoryHigh=` and `CPUQuota=` per container; one client cannot consume another's headroom.                                |
| Atomic backups               | One PITR backup per client covers app data and the durable outbox. External providers own their own backups.                      |

n8n is external per ADR-027. If a client uses n8n, provision it separately
(n8n.cloud, a shared self-hosted n8n, or a dedicated host) and store that
provider's credentials in the receiver's own security boundary.

---

## Database boundaries inside `<project>-postgres`

The website owns one app database and role:

```
<project>-postgres (one container)
├── database <project>_app
│   ├── role <project>_app_user                  ← SvelteKit + worker
│   └── tables: contact_submissions, automation_events, ...
```

External automation providers never receive database access. They receive
signed HTTPS deliveries from the worker and own their own state outside the
site bundle.

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
              │            ┌────────────┬────────┐
              │            ▼            ▼        ▼
              │       external n8n   webhook   noop
              │        endpoint      endpoint  (explicit
              │                                no-op)
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
