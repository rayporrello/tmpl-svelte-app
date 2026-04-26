# Vision: Reusable Golden SvelteKit Website Template

## What This Is

`tmpl-svelte-app` is a reusable, high-quality base website template for SvelteKit projects. It is designed to serve landing pages, content sites, product sites, founder projects, and advanced marketing sites — with app-capable seams for when a project grows into forms, runtime data, automations, auth, or admin areas.

It is **not** a full SaaS platform scaffold by default. It is a website template that can become one.

## The Core Problem It Solves

Starting a new web project from scratch means re-solving the same problems every time: deployment configuration, CSS architecture, content conventions, SEO baseline, agent operating rules, and container setup. This template makes good defaults permanent so future projects inherit them rather than reinvent them.

## What the Template Provides

**Always on:**
- SvelteKit/Svelte 5 skeleton
- Bun tooling and runtime direction
- Hand-authored CSS token/design-system baseline
- Sveltia CMS / file-based content conventions
- SEO, accessibility, semantic HTML, and image baseline
- Podman Quadlet + Caddy deployment templates and documentation
- Agent-readable operating rules (AGENTS.md, CLAUDE.md.template)

**Prepared but dormant:**
- Postgres + Drizzle for runtime data
- n8n for automation workflows
- Postmark or equivalent for transactional email
- Better Auth for auth and member/admin areas
- Backup automation for database and media

## The Target Workflow

When a new project starts:
1. Use this template on GitHub to create the new repo.
2. Configure site metadata, content collections, and which modules to activate.
3. Deploy to a Podman/Caddy host — the Caddyfile, Quadlet definitions, and deploy documentation are already in the repo.
4. Activate dormant modules only when the project actually needs them.

## Success Criteria

This template is successful if:
- A new project never has to write a Caddyfile, container definition, or backup script from scratch.
- The CSS and content conventions are already in place and ready to extend.
- Agent operating rules are already wired so AI-assisted work is safe and consistent from day one.
- Optional modules (Postgres, n8n, auth) can be activated without structural rework.
- The repo is readable and navigable by both humans and AI agents.
