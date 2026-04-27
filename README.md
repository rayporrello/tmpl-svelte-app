# tmpl-svelte-app

Reusable SvelteKit website template. Targets websites, landing pages, content sites, and product marketing sites. Not a dashboard application scaffold.

## What's included

- SvelteKit / Svelte 5 skeleton with Bun tooling
- Token-driven CSS design system (native CSS, no Tailwind, no component library)
- `forms.css` visual form primitives — compatible with Superforms
- **Built-in SEO system** — central site config, SEO component, schema helpers, sitemap, robots.txt, validation
- Semantic HTML contract with `Section.svelte`, skip link, accessible site shell
- **Git-backed content system** — `content/` directory, Sveltia CMS admin, typed content loaders
- **Automation-ready** — n8n patterns and contracts documented; no n8n dependency required
- Podman Quadlet + Caddy deployment templates (planned)
- Agent-readable operating rules (`AGENTS.md`, `CLAUDE.md.template`)

## Design system

This is a website-first SvelteKit template. The design system is native CSS, token-driven, and dependency-light.

| Guide | Purpose |
|-------|---------|
| [docs/design-system/README.md](docs/design-system/README.md) | Overview, file structure, how to customize |
| [docs/design-system/tokens-guide.md](docs/design-system/tokens-guide.md) | Complete token reference |
| [docs/design-system/component-css-rules.md](docs/design-system/component-css-rules.md) | CSS authoring rules for components |
| [docs/design-system/forms-guide.md](docs/design-system/forms-guide.md) | Forms: CSS layer + Superforms behavior |
| [docs/design-system/llm-css-rules.md](docs/design-system/llm-css-rules.md) | Concise rules for AI agents (paste into CLAUDE.md) |

**Tailwind is not included.** Styling uses `tokens.css` + scoped Svelte `<style>` blocks.

**Superforms is the standard form behavior library.** Install per project when the first form with a server action is added: `bun add sveltekit-superforms valibot`. The CSS layer (`forms.css`) works without it for display-only forms.

## SEO

Every site built from this template inherits a complete SEO system:

| File | Purpose |
|------|---------|
| `src/lib/config/site.ts` | Site name, domain, OG image, org info — replace all values per project |
| `src/lib/seo/routes.ts` | Register every route; declare `indexable: true/false` |
| `src/lib/components/seo/SEO.svelte` | Add to every `+page.svelte` with `title`, `description`, `canonicalPath` |
| `src/lib/seo/schemas.ts` | JSON-LD helpers — use when visible page content supports the schema type |
| `/sitemap.xml`, `/robots.txt`, `/llms.txt` | Auto-generated from config and route registry |

```bash
bun run check:seo   # fails on placeholder values; run before deploying
```

Full docs: [docs/seo/README.md](docs/seo/README.md)

## CMS and content

The template ships a complete Git-backed content system:

| Path | Purpose |
|------|---------|
| `static/admin/index.html` | Sveltia CMS editor UI (loads from CDN) |
| `static/admin/config.yml` | CMS schema — update `backend.repo` before deploying |
| `content/pages/home.yml` | Homepage content (edit via CMS or directly) |
| `content/articles/` | Markdown articles with YAML frontmatter |
| `content/team/` | Team member YAML files |
| `content/testimonials/` | Testimonial YAML files |
| `src/lib/content/` | Typed content loaders (js-yaml for YAML, gray-matter for Markdown) |

Full docs: [docs/cms/README.md](docs/cms/README.md)

## Automation readiness

n8n is an optional automation layer — the site works without it. When needed:

- **Content automations:** n8n writes files to `content/` via the GitHub API, following the same schema as Sveltia CMS
- **Runtime automations (Phase 5):** SvelteKit server actions emit typed webhook events after Postgres writes; n8n handles downstream tasks

Env vars `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET` are documented in `.env.example` but not required. See [docs/automations/README.md](docs/automations/README.md).

## Using this template

1. Create a new repo from this template on GitHub
2. Copy `CLAUDE.md.template` → `CLAUDE.md`, fill in project details
3. Edit `src/lib/config/site.ts` — replace all placeholder values with production site info
4. Edit `tokens.css` with brand colors, fonts, and shape
5. Update `src/app.html`: title, `theme-color` hex, favicon path
6. Register all routes in `src/lib/seo/routes.ts`
7. Update `static/admin/config.yml`: set `backend.repo` and `backend.branch`
8. Edit `content/pages/home.yml` with real site content
9. Install Superforms when adding the first form: `bun add sveltekit-superforms valibot`
10. Activate dormant modules (Postgres, n8n, auth) only when needed

## Bun-first workflow

This template uses **Bun** for all package management and script execution.

```bash
bun install                  # install dependencies
bun run dev                  # start dev server
bun run build                # production build
bun run check                # TypeScript + svelte-check
bun run images:optimize      # run image optimizer manually (idempotent)
bun run check:seo            # validate SEO config
bun run validate             # full pipeline: check → optimize → build → seo check
```

Never use `npm`, `npx`, `pnpm`, or `yarn`. Commit `bun.lock`. See [docs/template-maintenance.md](docs/template-maintenance.md) for the full workflow.

## Secrets management

This template uses **SOPS + age** as the default secrets workflow.

| File | Role |
|------|------|
| `.env.example` | Public contract — lists required variable names without values |
| `secrets.example.yaml` | Example shape for `secrets.yaml` with fake values |
| `.sops.yaml.example` | Example SOPS encryption config to copy per project |
| `secrets.yaml` | Encrypted source of truth — committed only after encryption |
| `.env` | Rendered local/runtime file — **never committed** |

```bash
bun run secrets:check   # verify no plaintext secrets are tracked
bun run secrets:render  # decrypt secrets.yaml → .env (requires SOPS + age installed)
```

Full guide: [docs/deployment/secrets.md](docs/deployment/secrets.md)  
Decision: [ADR-013](docs/planning/adrs/ADR-013-sops-age-secrets-management.md)

## Generated files are not committed

The following are **never** committed to this repo:

| Path | Why |
|------|-----|
| `node_modules/` | Installed by `bun install` |
| `.svelte-kit/` | Generated by SvelteKit at dev/sync time |
| `build/` | Production bundle — regenerated on every deploy |
| `.env`, `.env.*` | May contain secrets — use `.env.example` for safe defaults |
| `bun.lockb` | Legacy binary lockfile — this repo uses `bun.lock` (text format) |

**Exception — image `.webp` files in `static/uploads/`:** Generated `.webp` siblings are committed alongside their source images. The prebuild script is idempotent; committing both means the site works without a prebuild on every checkout. See [ADR-009](docs/planning/adrs/ADR-009-image-pipeline.md) and [docs/design-system/images.md](docs/design-system/images.md).

## Styleguide

Visit `/styleguide` in development to see all design system primitives rendered live.

## Dormant modules

Planned and documented but not active in the base template:

| Module | Activation |
|--------|-----------|
| Postgres + Drizzle | Add `DATABASE_URL`, create schema |
| n8n webhooks | Add webhook URL env var |
| Postmark | Add `POSTMARK_API_TOKEN`, implement mail helper |
| Better Auth | Follow auth module docs |

## Agent operating rules

- [AGENTS.md](AGENTS.md) — rules for AI coding agents
- [CLAUDE.md.template](CLAUDE.md.template) — template for per-project `CLAUDE.md`
- [docs/design-system/llm-css-rules.md](docs/design-system/llm-css-rules.md) — paste-ready CSS rules for AI agents

## What is deliberately not in this template

- Tailwind CSS
- shadcn or any pre-built component library
- A dashboard or app-shell layout
- `html, body { overflow: hidden }` — normal document scrolling is the default
- Disabled user zoom — website accessibility requires zoom to work
