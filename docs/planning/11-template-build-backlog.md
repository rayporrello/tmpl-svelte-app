# Template Build Backlog

## v1 readiness summary (as of April 2026)

The template is feature-complete for the **database-backed website baseline**. All of Phases 0–4b, 5 (database core), 6, E, F are done. The template ships Postgres + Drizzle as a first-class default — not an optional add-on.

**Ready to use today:**

- Spin up a new project, run `bun run init:site`, provision a Postgres DB, set `DATABASE_URL`, run `bun run db:migrate`, edit `tokens.css`, register routes in `src/lib/seo/routes.ts`, and ship.
- `bun run validate` and `bun run validate:launch` enforce all template invariants (SEO, CMS, content, assets, build, unit, e2e + axe). The validate pipeline uses a stub `DATABASE_URL` — no live DB required for CI.
- CI (.github/workflows/ci.yml) runs validate, builds the container image, runs Trivy with CRITICAL gating, smoke-tests the live container, and pushes to GHCR.
- Container + reverse proxy: Containerfile, Quadlets, Caddyfile.example, deployment runbook.
- Sveltia CMS at `/admin` is wired; content safety scripts gate writes; Markdown rendering ships with sanitisation.
- Observability spine + security baseline (per-route CSP, Valibot env, request ID + safe error normalization).
- `/healthz` (process check) and `/readyz` (Postgres connectivity probe) are both live.

**Outstanding before tagging v1.0.0** (in priority order):

| #   | Area                                          | Status      | Notes                                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Lighthouse CI gate                            | not started | Wire `treosh/lighthouse-ci-action` into `.github/workflows/ci.yml` with perf/a11y/SEO/best-practices budgets. Replaces the honor-system perf gates in `08-quality-gates.md`.                                                                                                                              |
| 2   | Backup automation                             | not started | Nightly `static/uploads/` snapshot to off-host storage (R2/S3) on a systemd timer with monitor ping (Healthchecks.io / n8n) so silent failures get noticed. Extend to `pg_dump` — Postgres is now active. Dedicated thread.                                                                               |
| 3   | Automation event emitter                      | not started | Typed automation event emitter (`src/lib/automation/events.ts`) + HMAC signing (`src/lib/automation/signing.ts`). Wire `contact.submitted` from contact form server action into `automation_events` table. Document first n8n workflow (contact form → email notification). See ADR-015 for the contract. |
| 4   | Decisions on "beyond website baseline" topics | **done**    | Module registry at `docs/modules/README.md`. Pagefind, cookie consent, R2, Better Auth, PWA documented. ADR-020 (PWA no-default) accepted. Consent banner UI added dormant. See Batch H in decision ledger.                                                                                               |
| 5   | Final docs-vs-implementation audit            | continuous  | Re-run before tagging v1.0.0 to confirm planning docs match reality.                                                                                                                                                                                                                                      |

Per-project activation (Sveltia OAuth, brand swap, route registration) is **not** v1 work — those are deliberately left for the consumer of the template.

---

## Phase 0 — Planning consolidation

- [x] Create build decision ledger
- [x] Mark each decision ACCEPTED / CHALLENGE / DEFER / REJECTED
- [x] Update ADRs to match accepted decisions (ADR-001 through ADR-019)
- [x] Create permanent docs structure (docs/design-system/, docs/seo/, docs/cms/, docs/observability/, docs/automations/, docs/deployment/, docs/content/, docs/planning/adrs/)
- [x] Move durable docs from planning into permanent locations (deployment/runbook + secrets, cms guides, observability tiers + runbook, content/markdown trust tiers, design-system accessibility)

## Phase 1 — Base project scaffold

- [x] Create SvelteKit project foundation (package.json, svelte.config.js, vite.config.ts, tsconfig.json)
- [x] Configure Bun scripts (dev, build, preview, check, check:seo, validate)
- [x] Configure adapter (svelte-adapter-bun)
- [x] Add TypeScript strictness
- [x] Add home page route (+page.svelte + +page.server.ts loading content/pages/home.yml)
- [x] Add error page (+error.svelte)

## Phase 2 — CSS/design system

- [x] Add reset.css
- [x] Add tokens.css (with brand primitives, semantic surfaces, type scale, spacing, shape, layout, animation, shadows)
- [x] Add base.css
- [x] Add utilities.css
- [x] Add animations.css
- [x] Add forms.css (visual-only; Superforms is the standard behavior layer for any form with submission)
- [x] Add app.css import order (website-first; no overflow: hidden; no app-shell)
- [x] Add z-index token scale (--z-base through --z-tooltip)
- [x] Add interaction state tokens (--state-hover-bg, --state-focus-ring, --state-disabled-\*)
- [x] Add form semantic alias tokens (--field-bg, --field-border, --field-border-invalid, etc.)
- [x] Add CSS authoring rules to AGENTS.md
- [x] Add styleguide route (/styleguide) demonstrating all design system primitives
- [x] Add example brand token override file (src/lib/styles/brand.example.css — "Warm Coral" re-skin showing which sections to swap) — E

## Phase 3 — Content/CMS

- [x] Add content directory (`content/pages/`, `content/articles/`, `content/team/`, `content/testimonials/`)
- [x] Add Sveltia admin files (`static/admin/index.html`, `static/admin/config.yml`)
- [x] Add content schema (config.yml collections: pages, articles, team, testimonials)
- [x] Add content loaders (`src/lib/content/types.ts`, `pages.ts`, `articles.ts`, `index.ts`)
- [x] Add starter content files (home.yml, sample-post.md, sample-person.yml, sample-testimonial.yml)
- [x] Add home page route (`src/routes/+page.server.ts`, `src/routes/+page.svelte`)
- [x] Add CMS docs (`docs/cms/README.md`, `sveltia-content-contract.md`, `collection-patterns.md`)
- [x] Add automation docs (`docs/automations/` — 5 files covering n8n patterns and contracts)
- [x] Add ADR-014 (Sveltia content system) and ADR-015 (n8n automation bridge)
- [x] Wire /admin as noindex in `src/lib/seo/routes.ts`
- [ ] Configure Sveltia GitHub OAuth per project (requires `backend.repo` in config.yml — update per project)
- [x] Add Markdown renderer for rich-text `body` fields (src/lib/content/markdown.ts — marked + sanitize-html, trust tiers) — C

## Phase 4 — SEO/images/accessibility

- [x] Add central site config (`src/lib/config/site.ts`)
- [x] Add SEO types and metadata helpers (`src/lib/seo/types.ts`, `src/lib/seo/metadata.ts`)
- [x] Add SEO component (`src/lib/components/seo/SEO.svelte`) with title, description, canonical, og:_, twitter:_, JSON-LD
- [x] Add schema.org helpers (`src/lib/seo/schemas.ts`): Organization, WebSite, Article, Breadcrumb, Person, LocalBusiness, FAQ
- [x] Add static route registry (`src/lib/seo/routes.ts`) and sitemap generator (`src/lib/seo/sitemap.ts`)
- [x] Add sitemap route (`src/routes/sitemap.xml/+server.ts`)
- [x] Add robots.txt route (`src/routes/robots.txt/+server.ts`)
- [x] Add llms.txt route (`src/routes/llms.txt/+server.ts`)
- [x] Wire SEO component into root layout and styleguide (noindex)
- [x] Add SEO validation script (`scripts/check-seo.ts`, `bun run check:seo`)
- [x] Add SEO docs (`docs/seo/` — README, page-contract, schema-guide, launch-checklist)
- [x] Add SEO ADR (ADR-011)
- [x] Add image optimization script (`scripts/optimize-images.js`, Sharp prebuild, ADR-009)
- [x] Add responsive image component (`CmsImage.svelte` for CMS uploads; `<enhanced:img>` for brand assets)
- [x] Add semantic HTML contract (Section.svelte, site shell in +layout.svelte, semantic-html-guide.md, llm-html-rules.md, ADR-008)

## Phase 4b — Observability and CMS safety spine

- [x] Add observability/error-handling spine (`src/routes/+error.svelte`, `src/routes/healthz/+server.ts`, `src/hooks.server.ts`, `src/lib/server/logger.ts`, `src/lib/server/request-id.ts`, `src/lib/server/safe-error.ts`, `src/lib/observability/types.ts`, `src/app.d.ts`)
- [x] Add CMS content-safety validation scripts (`scripts/check-cms-config.ts`, `scripts/validate-content.ts`, `scripts/check-content-diff.ts`)
- [x] Add `bun run check:cms`, `bun run check:content`, `bun run check:content-diff` to package.json
- [x] Add observability docs (`docs/observability/` — README, tiers, error-handling, n8n-workflows, runbook)
- [x] Add CMS safety docs (`docs/cms/sveltia-guide.md`, `docs/cms/content-safety.md`)
- [x] Add ADR-016 (observability and error handling) and ADR-017 (CMS content safety)
- [x] Update AGENTS.md with observability and CMS safety rules
- [x] Update CLAUDE.md.template with observability and CMS safety sections
- [x] Update quality gates (08-quality-gates.md) with observability and CMS/content safety gates
- [x] Update maintenance loop (09-maintenance-loop.md) with recurring observability and CMS checks
- [x] Add `/readyz` with Postgres connectivity check — implemented in Phase 5
- [ ] Optional Sentry integration — Tier 2+, per-project only; do not add to base template
- [ ] Optional OpenTelemetry adoption path — Tier 3+; seam is in place via `event.locals.requestId`
- [x] Dead-letter / failed-event table for n8n webhook events — `automation_dead_letters` table implemented in Phase 5

## Phase 5 — Runtime data/forms

- [x] Add Postgres/Drizzle foundation (`drizzle-orm`, `postgres`, `drizzle-kit`; `drizzle.config.ts`; `src/lib/server/db/` — schema, index, health; `drizzle/` migration dir; `db:*` scripts in package.json)
- [x] Add starter schema (`contact_submissions`, `automation_events`, `automation_dead_letters` in `src/lib/server/db/schema.ts`)
- [x] Make `DATABASE_URL` required in env.ts; add to `REQUIRED_PRIVATE_ENV_VARS`; update CI + Playwright with stubs
- [x] Add `/readyz` with Postgres connectivity probe (`src/routes/readyz/+server.ts`; returns 503 if DB unreachable)
- [x] Add db-health unit tests (`tests/unit/db-health.test.ts`; injection-based, no live DB required)
- [x] Update `.env.example`, `secrets.example.yaml`, CI stubs for `DATABASE_URL`
- [x] Add `docs/database/README.md` (setup guide, scripts reference, health endpoints, production checklist)
- [x] Add env validation (Valibot — src/lib/server/env.ts; moved to Batch B / Phase 6 timeline)
- [x] Add Superforms (`bun add --dev sveltekit-superforms`) — D; valibot already present from B
- [x] Add contact form pattern (forms.css + Superforms + console/Postmark provider seam) — D
- [x] Add EmailProvider seam (src/lib/server/forms/email-provider.ts, providers/console.ts, providers/postmark.example.ts) — D
- [x] Add in-memory rate limiter (src/lib/server/forms/rate-limit.ts — token bucket, RATE_LIMIT_ENABLED flag) — D
- [x] Add contact-example route (src/routes/contact-example/ — dormant by default, rename to activate) — D
- [x] Add contact Valibot schema (src/lib/forms/contact.schema.ts) — D
- [x] Wire contact-example as noindex in src/lib/seo/routes.ts — D
- [x] Update CSP form-action and connect-src extension comments (src/lib/server/csp.ts) — D
- [x] Update forms-guide.md with activation walkthrough and provider swap instructions — D
- [ ] Implement typed automation event emitter (`src/lib/automation/events.ts` — non-blocking webhook)
- [ ] Implement HMAC signing (`src/lib/automation/signing.ts`)
- [ ] Add `lead.created` event emission from contact form server action
- [ ] Add `newsletter.subscribed` event emission from newsletter form server action
- [ ] Document first n8n workflow (contact form → email notification)
- [ ] Add backup docs

## Phase 6 — Deployment

- [x] Add secrets workflow (SOPS + age — ADR-013, docs/deployment/secrets.md, .sops.yaml.example, secrets.example.yaml, .env.example, scripts/render-secrets.sh, scripts/check-secrets.sh, bun run secrets:render / secrets:check)
- [x] Add Bun package guardrails (`engines.bun`, `packageManager`, `preinstall: npx only-allow bun`) — A1
- [x] Add validation lifecycle split (`validate` PR-grade, `validate:launch` release-grade, `check:assets`, `check:launch`) — A1
- [x] Add default static assets (favicon.svg, favicon-32.png, apple-touch-icon.png, og-default.png, site.webmanifest) — A1
- [x] Add `<link rel="icon">`, `<link rel="apple-touch-icon">`, `<link rel="manifest">` in app.html — A1
- [x] Add minimal app security headers (X-Content-Type-Options, Referrer-Policy, X-Frame-Options, Permissions-Policy) inline in hooks.server.ts — A1
- [x] Add ADR-018 (production runtime and deployment contract) — A1
- [x] Add Containerfile (multi-stage oven/bun:1-alpine, non-root, HEALTHCHECK, node_modules copy for runtime deps) — A2
- [x] Add Containerfile.node.example (escape-hatch recipe, not CI-tested) — A2
- [x] Add Quadlet templates (deploy/quadlets/web.container, web.network) — A2
- [x] Add Caddy example (deploy/Caddyfile.example — TLS, HSTS, compression, health_uri) — A2
- [x] Add deploy/env.example (runtime env reference, distinct from SOPS secrets) — A2
- [x] Add deployment runbook (docs/deployment/runbook.md — bootstrap, deploy, rollback, smoke) — A2
- [x] Update docs/deployment/README.md (drop "planned but not yet implemented" placeholder) — A2
- [x] Add CI workflow (.github/workflows/ci.yml — validate/image/launch; Trivy CRITICAL blocking; smoke; GHCR push) — A3
- [x] Add Dependabot config (.github/dependabot.yml — ADR-012 protected-package ignore list) — A3
- [x] Add Valibot env schema (src/lib/server/env.ts — publicEnv/privateEnv, initEnv(), REQUIRED\_\*\_ENV_VARS) — B
- [x] Add env import paths (src/lib/env/public.ts, src/lib/env/private.ts — separate import path contract) — B
- [x] Wire initEnv() into hooks.server.ts handle (validates on first request; CI provides ORIGIN stub) — B
- [x] Update check:launch to read required env var list from env.ts schemas (removes static allowlist) — B
- [x] Add CSP baseline (src/lib/server/csp.ts — per-route, /admin-aware, extension points documented) — B
- [x] Add ADR-019 (security headers and CSP baseline — app vs edge split, Sveltia CDN, extension points) — B
- [x] Add contact field to site.ts (SiteContact.email — used by error page support link) — B
- [x] Update +error.svelte (requestId display + copy, dev-only stack via import.meta.env.DEV, contact link) — B
- [x] Update handleError to surface requestId; update app.d.ts App.Error interface — B
- [x] Add init:site script (scripts/init-site.ts — interactive, idempotent, rewrites 9 files) — B
- [x] Add Vitest (vitest.config.ts, $lib alias, 3 unit test files: env, seo-metadata, articles) — B
- [x] Wire bun run test into validate; CI validate job provides ORIGIN/PUBLIC_SITE_URL stubs — B
- [x] Update AGENTS.md (security headers policy, env variable policy, CSP extension guide) — B
- [x] Add sanitized Markdown renderer (src/lib/content/markdown.ts — marked + sanitize-html, three trust tiers, heading IDs, external link rel, language classes; fallback from @aloskutov/dompurify-node which is 404 on npm) — C
- [x] Add article route (src/routes/articles/[slug]/+page.server.ts + +page.svelte — loadArticle + renderMarkdown, full SEO with Article schema) — C
- [x] Add optional content loaders (src/lib/content/team.ts, testimonials.ts — mirrors articles.ts shape; exported from index.ts) — C
- [x] Add Playwright smoke tests (@playwright/test + @axe-core/playwright; playwright.config.ts; tests/e2e/smoke.spec.ts — 10 tests; all pass) — C
- [x] Wire bun run test:e2e into validate; CI validate job installs Playwright chromium — C
- [x] Add docs/content/markdown.md (trust model, allow-lists, renderer behaviors) — C
- [x] Add docs/design-system/accessibility.md (skip link, focus-visible, reduced-motion, semantic HTML, color contrast) — C
- [x] Fix --text-secondary and --text-muted light-mode tokens to use solid oklch values (WCAG AA 4.5:1 on brand-light background; was using transparency mix that produced 2.61:1) — C

## Phase 7 — Template documentation

- [x] Finalize README.md
- [x] Finalize AGENTS.md (includes image and typography agent rules)
- [x] Finalize CLAUDE.md.template (includes image and typography quick rules)
- [x] Add CSS / design system docs (docs/design-system/ — component-css-rules.md, forms-guide.md, images.md, llm-css-rules.md, llm-html-rules.md, semantic-html-guide.md, tokens-guide.md, typography.md; planning file 05 was deleted as superseded)
- [x] Add template repo spec (docs/planning/07-template-repo-spec.md)
- [x] Add quality gates doc (docs/planning/08-quality-gates.md)
- [x] Add image pipeline docs (docs/design-system/images.md, ADR-009)
- [x] Add typography docs (docs/design-system/typography.md, ADR-010)
- [x] Add media editor guide (docs/design-system/media-editor-guide.md)
- [x] Add SEO docs (docs/seo/ — README.md, page-contract.md, schema-guide.md, launch-checklist.md, ADR-011)
- [x] Add template maintenance / toolchain guide (docs/template-maintenance.md, ADR-012)
- [ ] Add architecture docs (content system overview) — Phase 5+ deferral
- [ ] Add operations docs (secrets, deployment, backups) — Phase 5+ deferral
- [x] Add "new site from template" setup guide (docs/getting-started.md — 11-step walkthrough, init:site, brand swap, deploy) — E

## Phase 8 — Validation

- [x] Run build (wired into `bun run validate`; CI runs on every push)
- [x] Run typecheck (`bun run check` — wired into `validate`)
- [x] Run lint (`bun run lint` — ESLint flat config; lefthook runs on staged files pre-commit)
- [x] Run formatting (`bun run format` — Prettier; lefthook auto-formats on commit)
- [x] Run accessibility checks (`@axe-core/playwright` in tests/e2e/smoke.spec.ts; gates on zero violations)
- [ ] Run Lighthouse/perf check (manual; not yet wired into CI — run before launch via `validate:launch`)
- [x] Verify container build (CI image job builds Containerfile and runs Trivy CRITICAL scan)
- [ ] Verify docs match implementation (re-audit before tagging v1)
- [x] Verify styleguide route renders all documented classes without errors (e2e smoke + axe pass)

## Phase E — Ergonomics / polish (Batch E)

- [x] Add lefthook (lefthook.yml — pre-commit only: prettier + eslint --fix on staged files; stage_fixed: true) — E
- [x] Add prepare script (`lefthook install`) to package.json — E
- [x] Add prettier + prettier-plugin-svelte to devDependencies; add .prettierrc — E
- [x] Add eslint + eslint-plugin-svelte + typescript-eslint + @eslint/js + globals to devDependencies; add eslint.config.js — E
- [x] Add docs/getting-started.md (11-step guide: init:site, brand, routes, CMS, deploy) — E
- [x] Update README.md "Using this template" to point at docs/getting-started.md — E
- [x] Add docs/template-update-strategy.md (clone-and-customize model; future extraction path to @<owner>/web-template-utils) — E
- [x] Add src/lib/styles/brand.example.css ("Warm Coral" re-skin; swap checklist; full annotation) — E
- [x] Update docs/design-system/tokens-guide.md with brand override guide paragraph — E
- [x] Enrich /styleguide: add brand primitives swatches, semantic surfaces label, shadows section, token overview intro — E
- [x] Fix ESLint issues surfaced by first lint run: prefer-const, no-unused-vars, preserve-caught-error, each-block keys, no-at-html-tags comments — E

## Phase F — UI groundwork (Batch F)

- [x] Lift .btn / .btn-primary / .btn-secondary out of +page.svelte scope into utilities.css @layer utilities — F
- [x] Add .btn-ghost, .btn-sm, .btn-lg, .btn:hover:not(:disabled), .btn:disabled to utilities.css — F
- [x] Remove redundant scoped .btn styles from src/routes/+page.svelte — F
- [x] Add Buttons section to /styleguide with all variants and disabled state using real <a> and <button> — F
- [x] Add src/routes/articles/+page.server.ts (loadArticles, published-only, sorted newest-first) — F
- [x] Add src/routes/articles/+page.svelte (SEO, empty state, article cards with h2/p/time) — F
- [x] Register /articles in src/lib/seo/routes.ts (indexable: true, priority: 0.7) — F
- [x] Add /articles axe zero-violations test to tests/e2e/smoke.spec.ts — F
- [x] Replace nav placeholder in +layout.svelte with real <ul role="list"> of nav links (/ and /articles) — F
- [x] Add .nav-link and .nav-link[aria-current='page'] scoped styles to +layout.svelte — F
- [x] Add footer nav with same two links + /styleguide in DEV-only block — F
- [x] Fix active nav link contrast: use var(--text-primary) + brand-accent text-decoration-color instead of brand-accent fg (brand-accent on brand-light = 1.45:1, fails WCAG AA) — F

## Batch H — Optional module docs and guardrails

- [x] Create `docs/modules/README.md` — central module registry with status, activation summary, env vars, and doc links
- [x] Create `docs/modules/pagefind.md` — Pagefind activation: install, pre-render, search:index script, search route, data attributes, validate independence
- [x] Create `docs/modules/cookie-consent.md` — consent banner activation, Google Consent Mode v2, categories, persistence, third-party CMPs
- [x] Create `docs/modules/r2-images.md` — R2 positioning vs. default server uploads, env vars, S3 compat, custom domain, image optimization with R2
- [x] Create `docs/modules/better-auth.md` — Better Auth recipe: when to use, files it adds, install steps, session wiring, route protection
- [x] Create `docs/planning/adrs/ADR-020-pwa-no-by-default.md` — PWA no-default: cache complexity, stale content risk, update UX burden; manifest + icons kept
- [x] Create `src/lib/privacy/ConsentBanner.svelte` — dormant first-visit consent banner; pushes denied defaults on mount; reads/writes localStorage; not imported by default
- [x] Create `src/lib/privacy/ManageConsent.svelte` — dormant consent preferences panel; reads/writes localStorage; not imported by default
- [x] Update `README.md` — expand "Dormant modules" → "Optional modules" with two-tier table (active seams vs. not-installed)
- [x] Update `docs/getting-started.md` — Step 11: add module registry link, add cookie consent and Pagefind rows
- [x] Update `docs/planning/03-stack-decisions.md` — add Search, Cookie consent, Auth, PWA sections
- [x] Update `docs/planning/10-build-decision-ledger.md` — add Batch H row
- [x] Update `docs/planning/11-template-build-backlog.md` — mark item #4 done, add this phase

## Deferred / Phase 5+

- Formsnap — not planned; Superforms is the standard form library, add it directly
- Tailwind — explicitly not part of this template (see ADR-005)
- shadcn — explicitly not part of this template
- Auth module (Better Auth) — dormant; activate per-project only
- Dashboard / app-shell layout — out of scope for website template baseline
- n8n Error Workflow setup — Tier 2; document per project once n8n is active
- Sentry integration — Tier 2; per-project only; do not add to base template
- OpenTelemetry — Tier 3; seam in place (`event.locals.requestId`); full implementation deferred
- Architecture docs (content system overview) — Phase 5+ deferral
- Operations docs (secrets, deployment, backups) — Phase 5+ deferral
- Typed automation event emitter (`src/lib/automation/events.ts`) — next step after Phase 5 DB; wire into `automation_events` table
- Template update strategy: @<owner>/web-template-utils extraction — deferred until 3+ projects use the template (see docs/template-update-strategy.md)
