# Guiding Principles

These principles are the guardrails for all architectural and implementation decisions in this repository. A tool, pattern, or methodology that violates these principles is rejected.

## 1. Immutable Infrastructure First

Never assume the server will remember anything. The entire running state of any project spawned from this template must be reconstructible from the git repository plus encrypted backups.

- All server configurations (Caddyfiles, Podman Quadlet definitions, environment variable maps) are committed to the repo.
- No manual software installations on the host — everything runs in isolated containers.
- If the server is destroyed, a fresh deploy from the repo plus restored backups returns the site to full operation.

## 2. Dev and Prod Strict Separation

We do not code in production. Ever.

- The local/dev environment mirrors production using the same container architecture.
- Real data (production Postgres, live n8n workflows) is never touched during routine development.
- Deployment is handled by the documented deploy process (container rebuild + systemd service restart), not by SSHing in and pulling code manually.

## 3. Core Always On, Modules Dormant

The template is unified, not bloated. Only what every project needs runs by default.

**Core (always on):**

- SvelteKit / Svelte 5
- Bun (tooling and runtime)
- CSS token/design-system baseline (hand-authored custom properties and explicit CSS layers)
- Sveltia / file-based content conventions
- Postgres + Drizzle runtime data
- Business form, outbox, and backup/restore seams
- SEO, accessibility, semantic HTML, and image baseline
- Deployment-ready config and documentation
- Agent-readable operating rules

**Dormant/prepared modules (off by default, ready to activate):**

- n8n (automation workflows)
- Postmark or equivalent (transactional email)
- Better Auth (auth, member areas, admin)
- R2 image storage, Pagefind search, and cookie-consent UI activation

Activating a module should require uncommenting or enabling a defined seam — not structural rework.

## 4. Backups Are Foundational, Not Afterthoughts

Data security is solved at the template level. Every project that activates runtime data automatically has a backup path available — not something to wire up later.

- Backup scripts are part of the template.
- Postgres dumps and media assets can be pushed off-host through rclone to R2, B2, S3, or another configured remote.
- Backup automation is shipped: scripts, verification, and systemd timer examples are present; projects activate off-host push by setting backup env vars and host rclone config.

## 5. AI-Native Readability

AI agents will be used heavily to scaffold, modify, and maintain projects built from this template. The repo must be structured so agents can work safely and consistently.

- `AGENTS.md` defines universal operating rules for AI agents working in any project spawned from this template.
- `CLAUDE.md.template` ships with the template so each new project establishes its own agent context immediately.
- Infrastructure decisions link to the `docs/planning/adrs/` folder so agents understand the _why_, not just the _what_.

## 6. Sveltia for Content, Postgres for Runtime

A strict boundary separates editorial content from application data.

- **Editorial content** (blog posts, landing page copy, FAQs, static assets) is managed via Sveltia CMS and stored as Markdown/JSON files in the git repository.
- **Runtime data** (user accounts, form submissions, waitlists, app state) lives in Postgres.
- We do not force static content into a database, and we do not try to run application state out of Markdown files.
