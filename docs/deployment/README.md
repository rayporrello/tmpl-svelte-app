# Deployment

Documentation for deploying sites built from this template. The deployment model uses **Podman + Caddy** — containers for the app, Caddy as the reverse proxy.

---

## What is documented here

| File | Status | Purpose |
|------|--------|---------|
| [secrets.md](secrets.md) | Complete | SOPS + age secrets workflow — encrypting, committing, and rendering secrets |

---

## What is planned but not yet implemented

The following are in the backlog (Phase 6 of the template build):

| Artifact | Purpose |
|----------|---------|
| `Containerfile` | Build the SvelteKit app as a Podman image |
| Quadlet templates | Systemd-managed container units |
| Caddy config examples | Reverse proxy with HTTPS |
| Deployment runbook | Step-by-step guide for first deploy and ongoing updates |

---

## Secrets workflow (complete)

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
- **Reverse proxy**: Caddy (handles TLS, routing, compression)
- **Automation layer** (optional): n8n as a separate container
- **Database** (optional, Phase 5): Postgres as a separate container
- **Process management**: systemd user units via Quadlet

This is not a Vercel/Netlify/cloud-platform deployment. The template is designed for solo/founder-led projects on a VPS or dedicated server.

---

## Related

- [docs/planning/adrs/ADR-007-podman-caddy-infrastructure.md](../planning/adrs/ADR-007-podman-caddy-infrastructure.md)
- [docs/planning/adrs/ADR-013-sops-age-secrets-management.md](../planning/adrs/ADR-013-sops-age-secrets-management.md)
