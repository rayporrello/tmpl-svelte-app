# Scope and Non-Goals

## 1. Always-On Core

Every project spawned from this template includes these by default.

- **SvelteKit / Svelte 5 skeleton** — routing, layouts, and page structure.
- **Bun** — package manager, dev server, and runtime direction.
- **CSS token/design-system baseline** — custom properties, explicit CSS layers, and hand-authored component styles. No Tailwind dependency. Includes `forms.css` for visual form primitives.
- **Superforms** — the standard form behavior library for any form with submission behavior. Install per project when the first form with a server action is added (`bun add sveltekit-superforms valibot`). The CSS layer (`forms.css`) works without it for display-only forms, but Superforms is always the right choice when a form submits.
- **Sveltia CMS / file-based content conventions** — Git-backed editorial content via Markdown/JSON; Sveltia admin at `/admin`.
- **SEO, accessibility, semantic HTML, and image baseline** — meta tags, Open Graph, structured data stubs, accessible markup conventions, and image handling patterns.
- **Podman Quadlet + Caddy deployment templates and documentation** — Caddyfile, Quadlet service definitions, and deploy notes committed to the repo.
- **Agent operating rules** — `AGENTS.md` and `CLAUDE.md.template` ship with the template.
- **Validation expectations** — clear definition of what "working" means for this template and each module.

## 2. Prepared/Dormant Modules

These capabilities are part of the template but off by default. Activating them should require enabling a defined seam — not structural rework.

| Module | What it provides | Activation |
|---|---|---|
| Postgres + Drizzle | Runtime data: forms, waitlists, app state | Add Quadlet service + run migrations |
| n8n | Automation workflows and webhook handling | Add Quadlet service + configure webhook URLs |
| Postmark / email | Transactional email delivery | Add credentials + enable email module |
| Better Auth | Auth, sessions, member areas, admin | Add auth config + enable protected routes |
| Backup automation | pg_dump + media to Cloudflare R2 | Enable when Postgres is activated |
| GitHub Actions deploy | Automated CI/CD to production | Optional; manual deploy documented as the baseline |

## 3. Per-Project Configurable

These decisions are intentionally left to the future project, not locked in the template.

- Domain and site metadata (name, URL, social handles, analytics IDs)
- Content collections (blog, team, services, FAQs — add or remove as needed)
- Which dormant modules are activated
- Email provider details and transactional email templates
- Deployment host, port allocation, and Caddy domain rules
- Whether auth is required and which auth providers to configure
- Whether n8n automation is enabled and which workflows to run
- Whether advanced media storage (R2) is enabled

## 4. Non-Goals

These are explicitly out of scope. Pressure to include them should be resisted.

- **Kubernetes or multi-server orchestration** — this template targets a single Podman host. Multi-server concerns belong in infrastructure tooling, not the app template.
- **Managed cloud database as default** — no AWS RDS, Supabase, PlanetScale, or Vercel Postgres. Runtime data is self-hosted Postgres.
- **SQLite as the default data path** — dormant module is Postgres + Drizzle; SQLite is not a fallback here.
- **WordPress / plugin architecture** — this template replaces that model entirely.
- **React, Next.js, or Tailwind as the default stack** — SvelteKit and hand-authored CSS are the chosen directions. Do not add Tailwind as a default dependency.
- **Heavy UI component libraries** — no Shadcn, DaisyUI, Flowbite, or equivalent baked into the template. The design system is hand-authored and project-specific.
- **Complex multi-environment infrastructure** — `main` deploys to production. The dev server is the staging environment. No additional environment tiers in the template by default.
- **Full SaaS platform scaffold by default** — this is a website template with app-capable seams. It is not a pre-built SaaS. Auth, billing, and multi-tenancy are future-project concerns.
- **Forcing every project to use every module** — dormant means dormant. A simple landing page site should not be required to run Postgres or n8n.
