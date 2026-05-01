# ADR-002: Core Always On, Modules Dormant

## Status

Accepted

## Context

A reusable template must balance two competing pressures: it should be rich enough to save real setup time, but lean enough that a simple project is not burdened by infrastructure it will never use. Without a clear core/module boundary, the template either bloats over time or stays so minimal that it provides little leverage.

## Decision

The template maintains a strict two-tier structure:

**Core — always on:**

- SvelteKit / Svelte 5 (framework)
- Bun (tooling and runtime)
- CSS token/design-system baseline (custom properties, explicit CSS layers, hand-authored component styles)
- Sveltia / file-based content conventions (Markdown/JSON, `/admin` route)
- SEO, accessibility, semantic HTML, and image baseline
- Podman Quadlet + Caddy deployment templates and documentation
- Agent operating rules (`AGENTS.md`, `CLAUDE.md.template`)

**Dormant modules — prepared but off:**

- Postgres + Drizzle (runtime data)
- n8n (automation workflows)
- Postmark or equivalent (transactional email)
- Better Auth (auth, sessions, member areas, admin)
- Backup automation (pg_dump + media to Cloudflare R2)
- GitHub Actions deploy automation (documented as optional; manual deploy is the baseline)

## Consequences

- A project that only needs a static content site runs with the core only — no database container, no automation service.
- A project that grows into runtime data or auth activates the relevant dormant module without structural changes.
- The core must be kept honest: adding a new always-on dependency requires justifying why every future project needs it.
- Dormant modules must be designed so activation is low-friction: a defined seam (Quadlet service entry, credential env vars, feature flag) rather than a refactor.

## Implementation Notes

- Dormant module files exist in the repo (Quadlet templates, schema stubs, route stubs) but are either commented out or gated behind an activation step documented in the module's README or inline comment.
- The boundary between core and dormant is enforced by the template's own documentation and agent operating rules — not by a runtime plugin system.

## Revisit Triggers

- If a dormant module is activated in every single project spawned from the template, it should be reconsidered for promotion to core.
- If the core CSS or content baseline proves too opinionated for a project type, evaluate whether a lighter core slice is warranted.
