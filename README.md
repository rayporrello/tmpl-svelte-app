# tmpl-svelte-app

Database-backed SvelteKit website template for serious lead-generation sites — with Postgres + Drizzle, Superforms, transactional email, durable n8n/webhook automation, SEO, CMS, deployment, and examples built in.

## What's included

- SvelteKit / Svelte 5 skeleton with Bun tooling
- Token-driven CSS design system (native CSS, no Tailwind, no component library)
- Global button utilities (`.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-sm`, `.btn-lg`)
- `forms.css` visual form primitives + Superforms + Valibot pre-installed; contact form live at `/contact`
- **Postgres + Drizzle** — default data layer; starter schema (`contact_submissions`, `automation_events`, `automation_dead_letters`); Drizzle Kit migration workflow
- **Privacy retention** — dry-run-first `privacy:prune` command for contact submissions and automation records
- **Health endpoints** — `/healthz` (process check) and `/readyz` (Postgres connectivity probe, returns 503 if DB unreachable)
- **Built-in SEO system** — central site config, SEO component, schema helpers, sitemap, robots.txt, llms.txt, validation
- **Articles system** — `/articles` index + `/articles/[slug]` with sanitized Markdown rendering (three trust tiers)
- Semantic HTML contract with `Section.svelte`, skip link, accessible site shell, real header/footer nav
- **Git-backed content system** — `content/` directory, Sveltia CMS admin, typed content loaders for pages/articles/team/testimonials
- **Observability spine** — friendly error page (with request ID + support link), `/healthz`, `/readyz`, structured logging, safe error handling
- **Security baseline** — Valibot env schemas, per-route CSP (`/admin`-aware for Sveltia CDN), minimal HTTP security headers
- **CMS content safety** — validation scripts that catch blank fields, bad dates, and destructive diffs before deploy
- **Automation-ready** — transactional outbox in `automation_events`, `automation:worker` delivery/retry/dead-letter flow, n8n/webhook providers
- **Production runtime contract** — Containerfile (multi-stage, non-root, HEALTHCHECK), Podman Quadlet templates, Caddyfile example
- **CI** — GitHub Actions workflow with validate / image / launch jobs, Trivy CRITICAL gating, smoke tests, GHCR push
- **Tests** — Vitest unit tests in `validate:core`; Playwright e2e smoke (with axe accessibility and visual smoke checks) in `validate:ci`
- **Ergonomics** — root `site.project.json` manifest, generated-file drift checks, Lefthook pre-commit, interactive/stdin-compatible `init:site`
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

**Superforms + Valibot are pre-installed** as devDependencies. The contact form ships live at `src/routes/contact/`: it saves to Postgres, logs email through the console provider by default, and switches to Postmark when `POSTMARK_SERVER_TOKEN` is set. See [docs/design-system/forms-guide.md](docs/design-system/forms-guide.md) for the behavior and provider details.

A "Warm Coral" re-skin example lives at [src/lib/styles/brand.example.css](src/lib/styles/brand.example.css) — it shows exactly which token sections to swap when starting a new brand.

## SEO

Every site built from this template inherits a complete SEO system:

| File                                       | Purpose                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| `site.project.json`                        | Project contract for name, domain, repo, deploy, CMS, and launch assets  |
| `src/lib/config/site.ts`                   | Generated SEO runtime config derived from the project manifest           |
| `src/lib/seo/routes.ts`                    | Register public page routes; declare `indexable: true/false`             |
| `src/lib/seo/route-policy.ts`              | Classify every SvelteKit route as indexable/noindex/private/api/feed/etc |
| `src/lib/components/seo/SEO.svelte`        | Add to every `+page.svelte` with `title`, `description`, `canonicalPath` |
| `src/lib/seo/schemas.ts`                   | JSON-LD helpers — use when visible page content supports the schema type |
| `/sitemap.xml`, `/robots.txt`, `/llms.txt` | Auto-generated from config and route registry                            |

```bash
bun run project:check # manifest + generated-file drift
bun run routes:check  # route policy coverage
bun run check:seo     # structural SEO checks; launch placeholders are enforced by check:launch
```

**Share / OG images** follow a fall-through chain:

- Articles: `og_image` frontmatter → `image` (feature image) frontmatter → `site.defaultOgImage`
- Pages: `image` prop on `<SEO>` → `site.defaultOgImage`

The article feature image becomes the share image automatically — no extra wiring per post. See [docs/seo/README.md → Share / OG image hierarchy](docs/seo/README.md#share--og-image-hierarchy).

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
bun run privacy:prune # dry-run expired PII/runtime record pruning
```

Full docs: [docs/database/README.md](docs/database/README.md) · [docs/privacy/data-retention.md](docs/privacy/data-retention.md)

## Automation readiness

n8n is an optional automation layer. When needed:

- **Content automations:** n8n writes files to `content/` via the GitHub API, following the same schema as Sveltia CMS
- **Runtime automations:** SvelteKit server actions insert outbox rows in `automation_events`; `bun run automation:worker` delivers, retries with backoff, and dead-letters exhausted failures

Env vars `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET` are documented in `.env.example`. See [docs/automations/README.md](docs/automations/README.md).

## Using this template

```bash
git clone git@github.com:<you>/<your-project>.git
cd <your-project>
./bootstrap
bun run dev
```

`./bootstrap` provisions a local Postgres container, generates a working `.env`
with sane local defaults, runs database migrations, and prints the next things
to customize. It is idempotent and safe to re-run.

For local CMS editing in a Chromium browser, follow the Work-with-Local-Repository
flow at [docs/cms/README.md](docs/cms/README.md#local-development--work-with-local-repository).

Before deploying:

```bash
bun run launch:check   # release-grade gate; alias of validate:launch
```

See [docs/getting-started.md](docs/getting-started.md) for the full guide,
including the manual setup path if you want to understand or override what
bootstrap does.

`site.project.json` is the durable project contract. `init:site` can still ask
the original ten prompts for compatibility; it writes the manifest, then
generates owned files from it. For manifest-only flows:

```bash
bun run init:site -- --check
bun run init:site -- --write
```

For deterministic non-interactive setup, feed answers through stdin:

```ts
const answers = `my-cool-site
Acme Studio
https://acme-studio.dev
Portrait and brand photography for independent makers.
acme-org
my-cool-site
hello@acme-studio.dev
my-cool-site
acme-studio.dev
Acme
`;

const proc = Bun.spawn(['bun', 'run', 'init:site'], {
	stdin: 'pipe',
	stdout: 'inherit',
	stderr: 'inherit',
});

proc.stdin.write(answers);
proc.stdin.end();
process.exit(await proc.exited);
```

After init, `bun run validate:launch` still fails until `static/og-default.png`
is replaced with a real 1200×630 OG image. That is intentional: the default OG
image is a manual launch asset.

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
bun run test:e2e:built       # Playwright against existing build/ output (used by validate:ci)
bun run images:optimize      # run image optimizer manually (idempotent)
bun run check:seo            # validate SEO config
bun run check:cms            # validate static/admin/config.yml
bun run check:content        # validate content/ files
bun run project:check        # validate site.project.json + generated-file drift
bun run routes:check         # validate route policy coverage
bun run check:assets         # verify favicon / og-default / manifest defaults exist
bun run init:site            # interactive/stdin compatibility initializer
bun run automation:worker    # process pending automation outbox events
bun run db:generate          # generate migration SQL from schema changes
bun run db:migrate           # apply pending migrations
bun run db:push              # push schema directly (dev only)
bun run db:studio            # open Drizzle Studio
bun run validate:core        # local-safe gate: checks → build → unit tests; no local listener
bun run validate             # alias of validate:core
bun run validate:ci          # CI gate: validate:core + built Playwright/visual smoke
bun run validate:launch      # release-grade: validate:core + init-site/launch/content-diff checks
```

The validation lifecycle has three useful entry points: `validate:core`/`validate` for daily local work, `validate:ci` for CI with built e2e and visual smoke, and `validate:launch` before tagging or shipping a release. See [docs/template-maintenance.md](docs/template-maintenance.md) and [ADR-018](docs/planning/adrs/ADR-018-production-runtime-and-deployment-contract.md).

## E2E environment variables

`bun run test:e2e` starts the built Bun server on `127.0.0.1:45139` by default, then runs Playwright against `/healthz` before executing tests. The defaults are safe on a fresh clone with no local `.env`.

| Variable                  | Purpose                                                                 |
| ------------------------- | ----------------------------------------------------------------------- |
| `PLAYWRIGHT_PORT`         | Override the managed test server port. Defaults to `45139`.             |
| `PLAYWRIGHT_BASE_URL`     | Run against an already-running or deployed site; skips local webServer. |
| `PLAYWRIGHT_REUSE_SERVER` | Set to `1` to reuse an existing local server on the configured URL.     |
| `PLAYWRIGHT_DATABASE_URL` | Optional DB URL for E2E. Defaults to an inert stub value.               |
| `PLAYWRIGHT_SKIP_BUILD`   | Set to `1` only when `build/` already exists; used by `validate:ci`.    |

`/readyz` is intentionally not part of default E2E because it verifies live Postgres connectivity. The DB health probe is covered by unit tests; add a separate integration job before testing `/readyz` end to end.

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

## Examples

`src/routes/examples/` holds copyable page archetypes — homepage, about, services + detail, pricing, blog landing, contact pattern, FAQ, testimonials, CTA, and a legal/privacy skeleton. Visit `/examples` in dev. Every example is `noindex, nofollow`; copy what you need into a real route and remove the override.

Full guide (including the copy-into-real-route checklist): [docs/examples/README.md](docs/examples/README.md)

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

## Optional modules

The full optional module registry lives at **[docs/modules/README.md](docs/modules/README.md)**. Every module is dormant by default — no runtime cost unless activated.

### Active seams (configured but inert until env vars are set)

| Module          | Activation                                                                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contact form    | Already live at `/contact`; saves to `contact_submissions` and logs email to stdout by default. See [docs/design-system/forms-guide.md](docs/design-system/forms-guide.md).             |
| Postmark email  | Set `POSTMARK_SERVER_TOKEN`, `CONTACT_TO_EMAIL`, and `CONTACT_FROM_EMAIL`; `resolveEmailProvider()` switches automatically.                                                             |
| n8n webhooks    | Set `N8N_WEBHOOK_URL` + `N8N_WEBHOOK_SECRET`. See [docs/automations/README.md](docs/automations/README.md).                                                                             |
| Privacy pruning | Run `bun run privacy:prune` for dry-run counts and `bun run privacy:prune -- --apply` from scheduled maintenance. See [docs/privacy/data-retention.md](docs/privacy/data-retention.md). |
| Analytics + GTM | Set `PUBLIC_ANALYTICS_ENABLED=true`, `PUBLIC_GTM_ID=GTM-XXXXXXX`. See [docs/analytics/README.md](docs/analytics/README.md).                                                             |
| Cookie consent  | Import `ConsentBanner.svelte` from `src/lib/privacy/` into root layout. Consent seam already installed. See [docs/modules/cookie-consent.md](docs/modules/cookie-consent.md).           |

### Not installed — add per project

| Module               | When to use                                            | Docs                                                       |
| -------------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| Better Auth          | User accounts, member areas, gated pages, admin portal | [docs/modules/better-auth.md](docs/modules/better-auth.md) |
| Search (Pagefind)    | 10+ pages/articles; users need to find content         | [docs/modules/pagefind.md](docs/modules/pagefind.md)       |
| R2 image storage     | Large media library, CDN delivery, or multi-instance   | [docs/modules/r2-images.md](docs/modules/r2-images.md)     |
| PWA / service worker | App-like offline experience explicitly required        | [ADR-020](docs/planning/adrs/ADR-020-pwa-no-by-default.md) |

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
- [CLAUDE.example.md](CLAUDE.example.md) — filled-in reference copy showing what a finished `CLAUDE.md` looks like
- [docs/design-system/llm-css-rules.md](docs/design-system/llm-css-rules.md) — paste-ready CSS rules for AI agents

## What is deliberately not in this template

- Tailwind CSS
- shadcn or any pre-built component library
- A dashboard or app-shell layout
- `html, body { overflow: hidden }` — normal document scrolling is the default
- Disabled user zoom — website accessibility requires zoom to work
