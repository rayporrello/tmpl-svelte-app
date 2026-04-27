# Deployment

Documentation for deploying sites built from this template. The deployment model uses **Podman + Caddy** — containers for the app, Caddy as the reverse proxy.

---

## What is documented here

| File | Status | Purpose |
|------|--------|---------|
| [secrets.md](secrets.md) | Complete | SOPS + age secrets workflow — encrypting, committing, and rendering secrets |
| [runbook.md](runbook.md) | Complete | Step-by-step deploy guide: bootstrap, rolling deploy, rollback by SHA, post-deploy smoke |

---

## Deployment artifacts

| Artifact | Location | Purpose |
|----------|----------|---------|
| `Containerfile` | repo root | Multi-stage Bun runtime image (builder + lean runtime) |
| `Containerfile.node.example` | repo root | Escape-hatch recipe for adapter-node swap (not CI-tested) |
| `deploy/env.example` | `deploy/` | Runtime env var reference for container / Quadlet |
| `deploy/quadlets/web.container` | `deploy/quadlets/` | Systemd user unit via Podman Quadlet |
| `deploy/quadlets/web.network` | `deploy/quadlets/` | Project-local Podman network |
| `deploy/Caddyfile.example` | `deploy/` | Caddy reverse proxy with TLS, HSTS, compression |

---

## Quick start

```bash
# 1. Build the image locally
podman build -f Containerfile -t my-site .

# 2. Test it
podman run --rm -p 3000:3000 -e ORIGIN=http://127.0.0.1:3000 my-site

# 3. Verify liveness
curl -fsS http://127.0.0.1:3000/healthz
```

For production bootstrap, rolling deploys, rollback by SHA, and post-deploy smoke testing — see [runbook.md](runbook.md).

---

## Secrets workflow

The SOPS + age secrets workflow is fully documented and implemented. See [secrets.md](secrets.md) for:

- How secrets are encrypted, committed, and rendered to `.env`
- The `bun run secrets:render` and `bun run secrets:check` commands
- How to add new secrets
- How to rotate or revoke keys

Decision: [ADR-013](../planning/adrs/ADR-013-sops-age-secrets-management.md)

---

## Infrastructure model

Sites built from this template are self-hosted on a Linux server:

- **App container**: Podman running the SvelteKit + Bun image
- **Reverse proxy**: Caddy (handles TLS, HSTS, compression, access logging)
- **Automation layer** (optional): n8n as a separate container
- **Database** (optional, Phase 5): Postgres as a separate container
- **Process management**: systemd user units via Podman Quadlet

This is not a Vercel/Netlify/cloud-platform deployment. The template is designed for solo/founder-led projects on a VPS or dedicated server.

---

## Related

- [ADR-007](../planning/adrs/ADR-007-podman-caddy-infrastructure.md) — Podman + Caddy decision
- [ADR-013](../planning/adrs/ADR-013-sops-age-secrets-management.md) — secrets management decision
- [ADR-018](../planning/adrs/ADR-018-production-runtime-and-deployment-contract.md) — production runtime contract
