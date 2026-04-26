# ADR-007: Podman Quadlets + Caddy as Deployment Target

## Status

Accepted

## Context

This template targets solo and founder-led projects running on a single VPS. The deployment stack must be:
- rootless (no Docker daemon, no root container runtime)
- manageable via standard systemd tooling
- capable of zero-downtime restarts via container image rebuilds
- simple enough for one person to operate and reason about

Docker Swarm and Kubernetes are explicitly out of scope (see `02-scope-and-non-goals.md`). The hosting environment uses Podman with systemd Quadlet definitions and Caddy as the reverse proxy.

## Decision

Use rootless Podman Quadlets and Caddy as the deployment target for all projects spawned from this template.

- Each service (SvelteKit app, Postgres, n8n, etc.) is defined as a Podman Quadlet unit (`.container` file) managed by systemd user units.
- Caddy handles TLS termination, reverse proxying, and automatic Let's Encrypt certificate management.
- **Production deploys rebuild the container image and restart the systemd service.** Running `bun run build` on the host alone does not update the live container.
- Deploy documentation is committed to the repo so the process is reproducible without institutional memory.

The deploy invariant:
1. Build a new container image (via Containerfile / CI).
2. Pull the new image on the production host.
3. `systemctl --user restart <service>` to bring up the new container.

## Consequences

- The full application state (Caddyfile, Quadlet definitions, environment variable map structure) is committed to the repo and reproducible on a fresh server.
- No runtime build step happens on the production host — the host is an appliance that runs images, not a build machine.
- Developers who attempt to deploy by SSHing in and running `bun run build` will not see their changes go live; the documented deploy process must be followed.
- Dormant services (Postgres, n8n) are simply disabled Quadlet units — enabling them requires enabling the unit and ensuring credentials are in place, not a structural change.

## Implementation Notes

- Quadlet unit files live in `deploy/quadlets/` (or equivalent directory in the repo).
- The Caddyfile lives in `deploy/Caddyfile`.
- Environment variables are provided via sops + age encrypted env files; the Quadlet unit references the decrypted file path.
- Port allocation follows the project's `ports.conf` convention to avoid conflicts between template instances running on the same host.
- `systemctl --user` is used throughout — this is rootless Podman, not system-level containers.

## Revisit Triggers

- If a project outgrows a single VPS and requires multi-host orchestration (at that point, Kubernetes or Nomad would be evaluated for that specific project).
- If Caddy introduces breaking changes or a clearly better TLS/proxy option emerges.
- If Podman Quadlet syntax changes substantially between OS versions on the target host.
