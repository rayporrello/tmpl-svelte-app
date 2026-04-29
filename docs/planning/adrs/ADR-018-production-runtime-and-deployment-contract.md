# ADR-018 — Production Runtime and Deployment Contract

**Status:** Accepted  
**Date:** 2026-04-27  
**Checkpoint:** Batch A1

---

## Decision

`svelte-adapter-bun` is the production SvelteKit adapter for this template. The Bun runtime is the target for both the build process and the server process.

The deployment model follows ADR-007 (Podman + Caddy). Container images are built via a multi-stage `Containerfile`, tagged with the full Git commit SHA, pushed to GHCR, and deployed to a systemd user unit managed by Podman Quadlet.

---

## Rationale

### Why svelte-adapter-bun

SvelteKit's adapter model treats deployment targets as swappable plugins. `svelte-adapter-bun` is the community-maintained plugin for Bun as the runtime target. Using it is consistent with ADR-012's Bun-first policy — the same runtime handles package management, script execution, test running, and production serving.

Bun's official documentation recommends `svelte-adapter-bun` as the SvelteKit production runtime on Bun. The adapter's swap cost is low: replacing it with `@sveltejs/adapter-node` is a one-line change in `svelte.config.js` (see Escape Hatch below).

### Deployment model

Podman rootless containers + Caddy reverse proxy (ADR-007) are the deployment target. Systemd user units via Quadlet provide lifecycle management with restart-on-failure and SHA-pinned image references for deterministic rollback.

---

## Container Environment Variable Contract

Verified by inspecting `node_modules/svelte-adapter-bun/README.md` (version 0.5.2).

| Variable          | Default   | Required | Purpose                                                                                         |
| ----------------- | --------- | -------- | ----------------------------------------------------------------------------------------------- |
| `PORT`            | `3000`    | No       | Port the server listens on                                                                      |
| `HOST`            | `0.0.0.0` | No       | Host/interface the server binds to                                                              |
| `ORIGIN`          | —         | **Yes**  | Full origin URL (e.g. `https://example.com`). Required for CSRF protection and URL construction |
| `PROTOCOL_HEADER` | —         | No       | Alternative to `ORIGIN`; read protocol from this header (e.g. `x-forwarded-proto`)              |
| `HOST_HEADER`     | —         | No       | Alternative to `ORIGIN`; read host from this header (e.g. `x-forwarded-host`)                   |
| `ADDRESS_HEADER`  | —         | No       | Header to read client IP from when behind a proxy (e.g. `True-Client-IP`, `X-Forwarded-For`)    |
| `XFF_DEPTH`       | `1`       | No       | Number of trusted proxies for `X-Forwarded-For` depth (right-most counting)                     |

**Note on `BODY_SIZE_LIMIT`:** This variable appears in `@sveltejs/adapter-node` but is NOT present in `svelte-adapter-bun` v0.5.2. Do not set it — it will have no effect. Body size limiting must be handled at the Caddy layer if required.

**Note on `ORIGIN` vs `PROTOCOL_HEADER`/`HOST_HEADER`:** For a reverse-proxy deployment behind Caddy, setting `ORIGIN` explicitly is the simplest and most reliable approach. The header-based alternatives are acceptable but add surface area.

---

## /healthz Contract

Every release of this template must respond to `GET /healthz` with HTTP 200 and a JSON body `{"ok": true, ...}`. This is implemented at `src/routes/healthz/+server.ts`.

The Containerfile `HEALTHCHECK` directive, Quadlet `HealthCmd`, and the CI smoke step all verify this endpoint. It is contractual — breaking it breaks deployment pipelines.

`/readyz` (Postgres connectivity probe) is explicitly out of scope until Phase 5. See ADR-016.

---

## Image Tagging

- Registry: `ghcr.io/<owner>/<repo>` (GitHub Container Registry)
- Tag format: full 40-character commit SHA (e.g. `ghcr.io/owner/repo:abc123...`)
- Short-SHA aliases (e.g. `:abc1234`) may be added for human readability but the Quadlet pins the full SHA
- `:latest` is **never used in production** — it prevents deterministic rollback

---

## Rollback Procedure

1. Edit the `Image=` line in `deploy/quadlets/web.container` to the previous full SHA
2. `systemctl --user daemon-reload`
3. `systemctl --user restart <unit-name>`

No image pull is needed if the previous image is still in the local store. For older SHAs: `podman pull ghcr.io/<owner>/<repo>:<sha>` first.

---

## Template Invariant

A clone of this template must be able to:

1. `bun install` — install all dependencies without errors
2. `bun run validate` — pass all PR-grade checks (type, SEO, CMS, content, assets, build)
3. `bun run build` — produce a complete `build/` directory
4. `podman build -f Containerfile -t <name> .` — build a runnable image
5. `podman run --rm -p 3000:3000 -e ORIGIN=http://127.0.0.1:3000 <name>` — start successfully
6. `GET /healthz` → 200 `{"ok":true}` — pass the liveness check
7. Roll back by changing the SHA in the Quadlet and restarting the unit

This invariant is the load-bearing assertion every later batch defends. If any of these steps fails on a clean clone, that is a template defect, not a per-project configuration issue.

---

## Escape Hatch: adapter-node

If `svelte-adapter-bun` becomes unmaintained, breaks on a new Bun version, or fails to serve `@sveltejs/enhanced-img` assets correctly, the swap procedure is:

1. `bun add -d @sveltejs/adapter-node`
2. In `svelte.config.js`, replace `import adapter from 'svelte-adapter-bun'` with `import adapter from '@sveltejs/adapter-node'`
3. In the Containerfile, replace `bun build/index.js` with `node build/index.js` (see `Containerfile.node.example`)
4. `BODY_SIZE_LIMIT` and other `adapter-node` env vars become active at this point

`Containerfile.node.example` ships as a documented recipe for this swap. It is not CI-tested.

---

## Risks Acknowledged

| Risk                                                                     | Severity | Mitigation                                                                                                             |
| ------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `svelte-adapter-bun` is pre-1.0 and single-maintainer (gornostay25)      | Medium   | One-line escape hatch; Containerfile.node.example ships alongside                                                      |
| `@sveltejs/enhanced-img` assets may not serve correctly from Bun runtime | Low      | Verified in A2 smoke; pause and escalate if broken                                                                     |
| Bun `.env` auto-loading may conflict with explicit env passing           | Low      | Containerfile and Quadlet pass env explicitly; Bun's auto-loading is only active when no env file is explicitly passed |

---

## Out of Scope (explicit deferrals)

- `/readyz` with Postgres connectivity probe — Phase 5
- Backup automation — Phase 5
- Dead-letter table for failed automation events — Phase 5
- Better Auth activation pattern — Phase 5
- CSP nonce upgrade — Phase 5
- Tightening Trivy gate from CRITICAL-only to HIGH — after 3 successful releases
- Distributed rate limiting — not in template scope

---

## Related

- ADR-007: Podman + Caddy infrastructure
- ADR-012: Bun-first dependency and build artifact policy
- ADR-013: SOPS + age secrets management
- `Containerfile` — multi-stage Bun runtime build (A2)
- `Containerfile.node.example` — escape hatch recipe (A2)
- `deploy/quadlets/web.container` — Quadlet unit template (A2)
- `docs/deployment/runbook.md` — step-by-step operational guide (A2)
