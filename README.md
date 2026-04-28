# tmpl-svelte-app

Database-backed SvelteKit website template. Targets websites, landing pages, content sites, and product marketing sites — with Postgres + Drizzle, forms, n8n-ready events, SEO, CMS, deployment, and examples built in.

## What's included

- SvelteKit / Svelte 5 skeleton with Bun tooling
- Token-driven CSS design system (native CSS, no Tailwind, no component library)
- Global button utilities (`.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-sm`, `.btn-lg`)
- `forms.css` visual form primitives + Superforms + Valibot pre-installed (contact form ships dormant)
- **Postgres + Drizzle** — default data layer; starter schema (`contact_submissions`, `automation_events`, `automation_dead_letters`); Drizzle Kit migration workflow
- **Health endpoints** — `/healthz` (process check) and `/readyz` (Postgres connectivity probe, returns 503 if DB unreachable)
- **Built-in SEO system** — central site config, SEO component, schema helpers, sitemap, robots.txt, llms.txt, validation
- **Articles system** — `/articles` index + `/articles/[slug]` with sanitized Markdown rendering (three trust tiers)
- Semantic HTML contract with `Section.svelte`, skip link, accessible site shell, real header/footer nav
- **Git-backed content system** — `content/` directory, Sveltia CMS admin, typed content loaders for pages/articles/team/testimonials
- **Observability spine** — friendly error page (with request ID + support link), `/healthz`, `/readyz`, structured logging, safe error handling
- **Security baseline** — Valibot env schemas, per-route CSP (`/admin`-aware for Sveltia CDN), minimal HTTP security headers
- **CMS content safety** — validation scripts that catch blank fields, bad dates, and destructive diffs before deploy
- **Automation-ready** — n8n patterns and contracts documented; `automation_events` table ready for outbound webhook tracking
- **Production runtime contract** — Containerfile (multi-stage, non-root, HEALTHCHECK), Podman Quadlet templates, Caddyfile example
- **CI** — GitHub Actions workflow with validate / image / launch jobs, Trivy CRITICAL gating, smoke tests, GHCR push
- **Tests** — Vitest unit tests + Playwright e2e smoke (with axe accessibility checks) wired into `bun run validate`
- **Ergonomics** — Lefthook pre-commit (prettier + eslint --fix on staged files), interactive `bun run init:site`
- Agent-readable operating rules (`AGENTS.md`, `CLAUDE.md.template`)

## Design system

This is a website-first SvelteKit template. The design system is native CSS, token-driven, and dependency-light.

| Guide                                                                                  | Purpose                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| [docs/design-system/README.md](docs/design-system/README.md)                           | Overview, file structure, how to customize         |
| [docs/design-system/tokens-guide.md](docs/design-system/tokens-guide.md)               | Complete token reference                           |
| [docs/design-system/component-css-rules.md](docs/design-system/component-css-rules.md) | CSS authoring rules for components                 |
| [docs/design-system/forms-guide.md](docs/design-system/forms-guide.md)                 | Forms: CSS layer + Superforms behavior             |
| [docs/design-system/llm-css-rules.md](docs/design-system/llm-css-rules.md)             | Concise rules for AI agents (paste into CLAUDE.md) |

**Tailwind is not included.** Styling uses `tokens.css` + scoped Svelte `<style>` blocks.

**Superforms + Valibot are pre-installed** as devDependencies. The contact form pattern ships at `src/routes/contact-example/` (noindex, dormant). Rename the directory to `contact/` to activate it. See [docs/design-system/forms-guide.md](docs/design-system/forms-guide.md) for the activation walkthrough and email-provider swap instructions.

A "Warm Coral" re-skin example lives at [src/lib/styles/brand.example.css](src/lib/styles/brand.example.css) — it shows exactly which token sections to swap when starting a new brand.

## SEO

Every site built from this template inherits a complete SEO system:

| File                                       | Purpose                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| `src/lib/config/site.ts`                   | Site name, domain, OG image, org info — replace all values per project   |
| `src/lib/seo/routes.ts`                    | Register every route; declare `indexable: true/false`                    |
| `src/lib/components/seo/SEO.svelte`        | Add to every `+page.svelte` with `title`, `description`, `canonicalPath` |
| `src/lib/seo/schemas.ts`                   | JSON-LD helpers — use when visible page content supports the schema type |
| `/sitemap.xml`, `/robots.txt`, `/llms.txt` | Auto-generated from config and route registry                            |

```bash
bun run check:seo   # fails on placeholder values; run before deploying
```

Full docs: [docs/seo/README.md](docs/seo/README.md)

## CMS and content

The template ships a complete Git-backed content system:

| Path                      | Purpose                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| `static/admin/index.html` | Sveltia CMS editor UI (loads from CDN)                             |
| `static/admin/config.yml` | CMS schema — update `backend.repo` before deploying                |
| `content/pages/home.yml`  | Homepage content (edit via CMS or directly)                        |
| `content/articles/`       | Markdown articles with YAML frontmatter                            |
| `content/team/`           | Team member YAML files                                             |
| `content/testimonials/`   | Testimonial YAML files                                             |
| `src/lib/content/`        | Typed content loaders (js-yaml for YAML, gray-matter for Markdown) |

Full docs: [docs/cms/README.md](docs/cms/README.md)

## Database

Postgres + Drizzle ships as a default, not an optional add-on. `DATABASE_URL` is required at runtime.

| File / Path                   | Purpose                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `src/lib/server/db/schema.ts` | Starter tables: `contact_submissions`, `automation_events`, `automation_dead_letters` |
| `src/lib/server/db/index.ts`  | DB singleton (lazy connection via postgres.js)                                        |
| `src/lib/server/db/health.ts` | `checkDbHealth()` — injectable probe used by `/readyz`                                |
| `drizzle.config.ts`           | Drizzle Kit config (schema path, migrations dir, dialect)                             |
| `drizzle/`                    | Migration files (generated by `bun run db:generate`)                                  |

```bash
bun run db:generate   # generate migration SQL from schema changes
bun run db:migrate    # apply pending migrations
bun run db:push       # push schema directly (dev only)
bun run db:studio     # open Drizzle Studio
bun run db:check      # check for schema drift
```

Full docs: [docs/database/README.md](docs/database/README.md)

## Automation readiness

n8n is an optional automation layer. When needed:

- **Content automations:** n8n writes files to `content/` via the GitHub API, following the same schema as Sveltia CMS
- **Runtime automations:** SvelteKit server actions write to `automation_events`, then emit outbound webhooks to n8n; dead events land in `automation_dead_letters`

Env vars `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET` are documented in `.env.example`. See [docs/automations/README.md](docs/automations/README.md).

## Using this template

See **[docs/getting-started.md](docs/getting-started.md)** for the full step-by-step guide, including:

- Running `bun run init:site` to replace all placeholders in one shot
- Swapping `tokens.css` for your brand colors, fonts, and shape
- Registering routes, updating CMS config, and activating dormant modules
- Deploying via container and running `bun run validate:launch` before go-live

## Bun-first workflow

This template uses **Bun** for all package management and script execution. A `preinstall` guard (`npx only-allow bun`) and `engines.bun` enforce this. Never use `npm`, `npx`, `pnpm`, or `yarn`. Commit `bun.lock`.

```bash
bun install                  # install dependencies
bun run dev                  # start dev server
bun run build                # production build (prebuild runs image optimizer)
bun run check                # TypeScript + svelte-check
bun run lint                 # ESLint
bun run format               # Prettier
bun run test                 # Vitest unit tests
bun run test:e2e             # Playwright + axe smoke tests
bun run images:optimize      # run image optimizer manually (idempotent)
bun run check:seo            # validate SEO config
bun run check:cms            # validate static/admin/config.yml
bun run check:content        # validate content/ files
bun run check:assets         # verify favicon / og-default / manifest defaults exist
bun run init:site            # interactive site initializer (rewrites 9 files)
bun run db:generate          # generate migration SQL from schema changes
bun run db:migrate           # apply pending migrations
bun run db:push              # push schema directly (dev only)
bun run db:studio            # open Drizzle Studio
bun run validate             # PR-grade: check → seo → cms → content → assets → images → build → unit → e2e
bun run validate:launch      # release-grade: validate + check:launch + check:content-diff
```

The validation lifecycle has two tiers: `validate` runs on every PR/push; `validate:launch` runs before tagging or shipping a release. See [docs/template-maintenance.md](docs/template-maintenance.md) and [ADR-018](docs/planning/adrs/ADR-018-production-runtime-and-deployment-contract.md).

## Secrets management

This template uses **SOPS + age** as the default secrets workflow.

| File                   | Role                                                           |
| ---------------------- | -------------------------------------------------------------- |
| `.env.example`         | Public contract — lists required variable names without values |
| `secrets.example.yaml` | Example shape for `secrets.yaml` with fake values              |
| `.sops.yaml.example`   | Example SOPS encryption config to copy per project             |
| `secrets.yaml`         | Encrypted source of truth — committed only after encryption    |
| `.env`                 | Rendered local/runtime file — **never committed**              |

```bash
bun run secrets:check   # verify no plaintext secrets are tracked
bun run secrets:render  # decrypt secrets.yaml → .env (requires SOPS + age installed)
```

Full guide: [docs/deployment/secrets.md](docs/deployment/secrets.md)  
Decision: [ADR-013](docs/planning/adrs/ADR-013-sops-age-secrets-management.md)

## Generated files are not committed

The following are **never** committed to this repo:

| Path             | Why                                                              |
| ---------------- | ---------------------------------------------------------------- |
| `node_modules/`  | Installed by `bun install`                                       |
| `.svelte-kit/`   | Generated by SvelteKit at dev/sync time                          |
| `build/`         | Production bundle — regenerated on every deploy                  |
| `.env`, `.env.*` | May contain secrets — use `.env.example` for safe defaults       |
| `bun.lockb`      | Legacy binary lockfile — this repo uses `bun.lock` (text format) |

**Exception — image `.webp` files in `static/uploads/`:** Generated `.webp` siblings are committed alongside their source images. The prebuild script is idempotent; committing both means the site works without a prebuild on every checkout. See [ADR-009](docs/planning/adrs/ADR-009-image-pipeline.md) and [docs/design-system/images.md](docs/design-system/images.md).

## Styleguide

Visit `/styleguide` in development to see all design system primitives rendered live.

## Deployment

The template ships a complete container + reverse-proxy deployment path:

| Artifact                        | Purpose                                                                    |
| ------------------------------- | -------------------------------------------------------------------------- |
| `Containerfile`                 | Multi-stage Bun image (builder + lean runtime, non-root, HEALTHCHECK)      |
| `Containerfile.node.example`    | Escape-hatch recipe for adapter-node swap (not CI-tested)                  |
| `deploy/quadlets/web.container` | Systemd user unit via Podman Quadlet                                       |
| `deploy/quadlets/web.network`   | Project-local Podman network                                               |
| `deploy/Caddyfile.example`      | Caddy reverse proxy with TLS, HSTS, compression, `health_uri`              |
| `deploy/env.example`            | Runtime env reference (distinct from SOPS secrets)                         |
| `.github/workflows/ci.yml`      | Validate / image build / launch gating; Trivy CRITICAL blocking; GHCR push |

Step-by-step bootstrap, rolling deploy, and rollback-by-SHA: [docs/deployment/runbook.md](docs/deployment/runbook.md). Production runtime contract: [ADR-018](docs/planning/adrs/ADR-018-production-runtime-and-deployment-contract.md).

## Dormant modules

Active patterns that ship configured but inert. Activate per-project:

| Module             | Activation                                                                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contact form       | Rename `src/routes/contact-example/` → `src/routes/contact/` and copy a provider (e.g. `postmark.example.ts → postmark.ts`). See [docs/design-system/forms-guide.md](docs/design-system/forms-guide.md). |
| Postgres + Drizzle | Add `DATABASE_URL`, create schema, run `drizzle-kit push` (Phase 5)                                                                                                                                      |
| n8n webhooks       | Add `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET`; implement event emitter (Phase 5)                                                                                                                        |
| Postmark email     | Copy `src/lib/server/forms/providers/postmark.example.ts → postmark.ts`; add `POSTMARK_SERVER_TOKEN` (per `.env.example`)                                                                                |
| Better Auth        | Follow the auth module docs (per-project only — not in base template)                                                                                                                                    |

## Observability

The template ships a lean default safety spine. Medium and large sites can extend it without changing the baseline.

| Guide                                                                        | Purpose                                                 |
| ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| [docs/observability/README.md](docs/observability/README.md)                 | Overview — what's included, what's optional, why tiered |
| [docs/observability/tiers.md](docs/observability/tiers.md)                   | Small / medium / large tier model with upgrade paths    |
| [docs/observability/error-handling.md](docs/observability/error-handling.md) | Errors, logging, request IDs, safe messages             |
| [docs/observability/n8n-workflows.md](docs/observability/n8n-workflows.md)   | n8n naming, payload shape, failure policy               |
| [docs/observability/runbook.md](docs/observability/runbook.md)               | Practical operator runbook for common failures          |

Medium/large observability features (Sentry, OpenTelemetry, dashboards) are documented but **not installed by default**. The base template works without them.

## CMS content safety

```bash
bun run check:cms          # validate static/admin/config.yml
bun run check:content      # validate .md content files
bun run check:content-diff # detect destructive content changes in git diff
```

CMS writes are treated as untrusted until validated. The scripts catch blank required fields, bad date formats, `toml-frontmatter`, optional datetime fields, and destructive rewrites before they reach deploy. See [docs/cms/README.md](docs/cms/README.md) for the full content safety documentation.

## Agent operating rules

- [AGENTS.md](AGENTS.md) — rules for AI coding agents (includes observability and CMS safety rules)
- [CLAUDE.md.template](CLAUDE.md.template) — template for per-project `CLAUDE.md`
- [docs/design-system/llm-css-rules.md](docs/design-system/llm-css-rules.md) — paste-ready CSS rules for AI agents

## What is deliberately not in this template

- Tailwind CSS
- shadcn or any pre-built component library
- A dashboard or app-shell layout
- `html, body { overflow: hidden }` — normal document scrolling is the default
- Disabled user zoom — website accessibility requires zoom to work
