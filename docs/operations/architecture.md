# Architecture — Shared Infrastructure Cell

Each client remains its own SvelteKit website clone. Infrastructure is shared at
the host level.

```
Host: rootless Podman + user systemd + host Caddy

web-platform.network
├── web-platform-postgres        shared Postgres cluster
├── web-platform-fleet-worker    shared outbox delivery daemon
├── client-a-web                 SvelteKit web container
├── client-b-web                 SvelteKit web container
└── ...

Host Caddy
├── example-a.com -> 127.0.0.1:3101 -> client-a-web:3000
└── example-b.com -> 127.0.0.1:3102 -> client-b-web:3000
```

## Ownership Split

| Owner                  | Responsibilities                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Website repo           | SvelteKit app, content, forms, schema, web image, web Quadlet                                                             |
| web-data-platform repo | Shared network, shared Postgres, DB/role provisioning, fleet worker, production secrets, backups, restore, Caddy includes |

## Database Isolation

The v1 isolation boundary is one database and one role per client:

```
web-platform-postgres
├── client_a_app      role client_a_app_user
├── client_b_app      role client_b_app_user
└── ...
```

No tenant column, no schema-per-client, and no app-layer multi-tenancy.

## Network Boundaries

- `web-platform-postgres` is reachable only on `web-platform.network`.
- Client web containers join `web-platform.network`.
- Other host projects and SaaS app containers are not members of this network.
- Web containers publish loopback-only ports for Caddy.

## Automation

Web actions enqueue outbox rows. The fleet worker claims events per client,
delivers with client-specific provider config from web-data-platform secrets, and keeps
failures isolated to that client's DB.

## Backups And Restore

Cluster backups, PITR checks, restore drills, and per-client export/handoff
belong to `web-data-platform`. This website repo keeps only privacy
pruning and application-level data-retention code.
