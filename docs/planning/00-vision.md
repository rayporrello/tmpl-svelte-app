# Vision: Reusable Golden SvelteKit Website Template

## What This Is

`tmpl-svelte-app` is a reusable, high-quality base website template for SvelteKit projects. It is designed to serve landing pages, content sites, product sites, founder projects, and advanced marketing sites — with app-capable seams for when a project grows into forms, runtime data, automations, auth, or admin areas.

It is **not** a full SaaS platform scaffold by default. It is a website template that can become one.

## The Core Problem It Solves

Starting a new web project from scratch means re-solving the same problems every time: deployment configuration, CSS architecture, content conventions, SEO baseline, agent operating rules, and container setup. This template makes good defaults permanent so future projects inherit them rather than reinvent them.

## What the Template Provides

**Always on (implemented):**

- SvelteKit/Svelte 5 skeleton with Bun tooling, svelte-adapter-bun, and `engines.bun`/`preinstall` guards
- Hand-authored CSS token/design-system baseline (`tokens.css`, `reset.css`, `base.css`, `animations.css`, `utilities.css` with global button utilities, `forms.css`)
- Sveltia CMS + Git-backed content for pages, articles, team, testimonials; sanitized Markdown renderer with three trust tiers
- Built-in SEO (SEO component, schema helpers, sitemap, robots.txt, llms.txt, route registry, validation)
- Image pipeline (Sharp prebuild for `static/uploads/`, `<enhanced:img>` for `src/lib/assets/`)
- Typography baseline (Fontsource variable fonts; tokens in `tokens.css`)
- Semantic HTML contract (`Section.svelte`, accessible site shell with skip link, real header/footer nav, `/articles` index)
- Observability spine (friendly error page with request ID, `/healthz`, structured logging, safe error normalization)
- Security baseline (Valibot env schemas, per-route CSP, minimal HTTP security headers)
- CMS content safety (`check:cms`, `check:content`, `check:content-diff`)
- Production runtime contract (Containerfile, Quadlet templates, Caddyfile example, deploy runbook)
- CI (validate / image / launch with Trivy CRITICAL gating, smoke tests, GHCR push)
- Tests (Vitest unit + Playwright + axe e2e)
- Ergonomics (Lefthook pre-commit, ESLint flat config, Prettier, interactive `init:site`)
- Secrets management (SOPS + age workflow, render and check scripts)
- Agent-readable operating rules (`AGENTS.md`, `CLAUDE.md.template`)

**Scaffolded but dormant (activate per project):**

- Contact form pattern (Superforms + Valibot + EmailProvider seam + rate limiter at `src/routes/contact-example/`)
- Postmark transactional email provider (`src/lib/server/forms/providers/postmark.example.ts`)
- n8n integration env contract (`N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`)

**Planned, not yet implemented:**

Phase 5 — runtime data bundle (single coordinated batch; needs Postgres to land first):

- Postgres + Drizzle for runtime data
- Typed automation event emitter + HMAC signing (`src/lib/automation/events.ts`, `signing.ts`)
- `lead.created` / `newsletter.subscribed` event wiring
- `/readyz` with Postgres connectivity probe (today it would be identical to `/healthz`; only meaningful once a backing service exists)
- Dead-letter table for failed n8n events

Independent of Phase 5 — small wins, can be picked up anytime:

- Lighthouse CI gate (perf budget enforcement on PRs; today the perf gates in `08-quality-gates.md` are honor-system)
- Backup automation (uploads → off-host storage on a schedule; extends to `pg_dump` once Postgres lands)

Beyond the website-only baseline — each will be scoped in its own thread (see `12-post-v1-roadmap.md`):

- i18n / localisation
- Analytics / RUM
- Cookie consent / privacy banner
- Newsletter subscription dormant module
- Site search (Pagefind)
- Per-article OG image generation
- Visual regression testing
- Page archetypes / examples gallery
- Better Auth for gated/member areas
- Edge image storage (R2 tier)

## The Target Workflow

When a new project starts:

1. Use this template on GitHub to create the new repo.
2. Run `bun run init:site` — interactive prompt rewrites placeholders across 9 files (package name, site URL, organisation, repo, contact email, deploy hostname).
3. Edit `tokens.css` for brand colors / fonts / shape (see `brand.example.css`).
4. Register routes in `src/lib/seo/routes.ts`.
5. Activate dormant modules only when the project actually needs them.
6. Deploy to a Podman/Caddy host — Containerfile, Quadlets, Caddyfile, and runbook are already in the repo.

See [docs/getting-started.md](../getting-started.md) for the full step-by-step walkthrough.

## Success Criteria

This template is successful if:

- A new project never has to write a Caddyfile, container definition, or backup script from scratch.
- The CSS and content conventions are already in place and ready to extend.
- Agent operating rules are already wired so AI-assisted work is safe and consistent from day one.
- Optional modules (Postgres, n8n, auth) can be activated without structural rework.
- The repo is readable and navigable by both humans and AI agents.
