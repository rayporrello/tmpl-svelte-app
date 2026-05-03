# Vision: Reusable Golden SvelteKit Website Template

## What This Is

`tmpl-svelte-app` is a reusable, high-quality base website template for SvelteKit projects. It is designed to serve landing pages, content sites, product sites, founder projects, and advanced marketing sites — database-backed from day one, with seams for forms, automations, auth, and admin areas.

It ships with Postgres + Drizzle as a first-class default, not an optional add-on. Most real sites need contact form submissions, automation event tracking, and a migration workflow. This template provides that without extra setup.

It is **not** a full SaaS platform scaffold. It is a database-backed website template that can grow into one.

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
- **Postgres + Drizzle** — default data layer; `contact_submissions`, `automation_events`, `automation_dead_letters` tables; Drizzle Kit migration workflow (`db:generate`, `db:migrate`, `db:push`, `db:studio`, `db:check`)
- **`/readyz`** — Postgres connectivity probe (returns 503 if DB unreachable); `/healthz` remains lightweight process-only check
- Observability spine (friendly error page with request ID, `/healthz`, `/readyz`, structured logging, safe error normalization)
- Security baseline (Valibot env schemas, per-route CSP, minimal HTTP security headers)
- CMS content safety (`check:cms`, `check:content`, `check:content-diff`)
- Production runtime contract (Containerfile, Quadlet templates, Caddyfile example, deploy runbook)
- CI (validate / image / launch with Trivy CRITICAL gating, smoke tests, GHCR push)
- Tests (Vitest unit + Playwright + axe e2e)
- Ergonomics (Lefthook pre-commit, ESLint flat config, Prettier, interactive `init:site`)
- Secrets management (SOPS + age workflow, render and check scripts)
- Agent-readable operating rules (`AGENTS.md`, `CLAUDE.md.template`)

**Live / configured seams:**

- Contact form (Superforms + Valibot + EmailProvider seam + rate limiter at `src/routes/contact/`) — writes submissions to `contact_submissions`
- Postmark transactional email provider (`src/lib/server/forms/providers/postmark.ts`) — activated by `POSTMARK_SERVER_TOKEN`
- Provider-agnostic automation env contract (`AUTOMATION_PROVIDER`, generic webhook vars, and n8n provider vars) — writes outbound event state to `automation_events`
- Analytics spine: GTM + GA4 + Cloudflare Web Analytics + server conversion events (set `PUBLIC_ANALYTICS_ENABLED=true` in production — see `docs/analytics/README.md`)

**Deferred / per-project activation:**

Independent of the database layer — small wins, can be picked up anytime:

- Lighthouse CI gate (perf budget enforcement on PRs; today the perf gates in `08-quality-gates.md` are honor-system)

Beyond the website-only baseline — each will be scoped in its own thread (see `12-post-v1-roadmap.md`):

- i18n / localisation
- Cookie consent / privacy banner activation (dormant UI components ship; importing and legal copy are per-project)
- Newsletter subscription dormant module
- Site search (Pagefind)
- Per-article OG image generation
- Full screenshot-baseline visual regression testing (visual smoke tests already ship)
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
- Optional modules (n8n, auth, search, consent UI, R2) can be activated without structural rework.
- The repo is readable and navigable by both humans and AI agents.
