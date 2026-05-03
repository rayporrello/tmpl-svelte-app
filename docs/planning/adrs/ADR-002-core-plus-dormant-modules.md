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
- Postgres + Drizzle runtime data (`DATABASE_URL` required at runtime)
- Superforms + Valibot form behavior for business forms
- SEO, accessibility, semantic HTML, and image baseline
- Podman Quadlet + Caddy deployment templates and documentation
- Backup and restore scripts for Postgres/uploads, with optional off-host push
- Agent operating rules (`AGENTS.md`, `CLAUDE.md.template`)

**Dormant modules — prepared but off:**

- n8n (automation workflows)
- Postmark or equivalent (transactional email)
- Better Auth (auth, sessions, member areas, admin)
- Cookie consent UI components
- Pagefind search
- Cloudflare R2 image storage
- PWA/service worker behavior

## Consequences

- A project that only needs a public website still inherits the database-backed baseline. Runtime records, migrations, health checks, backups, and forms use the same shape in every clone.
- A project that grows into auth, search, consent UI, R2 storage, or external automation activates the relevant dormant module without structural changes.
- The core must be kept honest: adding a new always-on dependency requires justifying why every future project needs it.
- Dormant modules must be designed so activation is low-friction: a defined seam (Quadlet service entry, credential env vars, feature flag) rather than a refactor.

## Implementation Notes

- Dormant module files may exist in the repo as docs, components, examples, or provider seams, but they are not imported or enabled until a project activates them.
- The boundary between core and dormant is enforced by the template's own documentation and agent operating rules — not by a runtime plugin system.

## Revisit Triggers

- If a dormant module is activated in every single project spawned from the template, it should be reconsidered for promotion to core.
- If the core CSS or content baseline proves too opinionated for a project type, evaluate whether a lighter core slice is warranted.
