# Template Build Backlog

## Phase 0 — Planning consolidation

- [x] Create build decision ledger
- [x] Mark each decision ACCEPTED / CHALLENGE / DEFER / REJECTED
- [x] Update ADRs to match accepted decisions (ADR-001 through ADR-012)
- [x] Create permanent docs structure (docs/design-system/, docs/seo/, docs/planning/adrs/)
- [ ] Move durable docs from planning into architecture/operations/reference drafts (operations and deployment docs not yet written)

## Phase 1 — Base project scaffold

- [x] Create SvelteKit project foundation (package.json, svelte.config.js, vite.config.ts, tsconfig.json)
- [x] Configure Bun scripts (dev, build, preview, check, check:seo, validate)
- [x] Configure adapter (svelte-adapter-bun)
- [x] Add TypeScript strictness
- [ ] Add home page route (+page.svelte)
- [ ] Add error page (+error.svelte)

## Phase 2 — CSS/design system

- [x] Add reset.css
- [x] Add tokens.css (with brand primitives, semantic surfaces, type scale, spacing, shape, layout, animation, shadows)
- [x] Add base.css
- [x] Add utilities.css
- [x] Add animations.css
- [x] Add forms.css (visual-only; Superforms is the standard behavior layer for any form with submission)
- [x] Add app.css import order (website-first; no overflow: hidden; no app-shell)
- [x] Add z-index token scale (--z-base through --z-tooltip)
- [x] Add interaction state tokens (--state-hover-bg, --state-focus-ring, --state-disabled-*)
- [x] Add form semantic alias tokens (--field-bg, --field-border, --field-border-invalid, etc.)
- [x] Add CSS authoring rules to AGENTS.md
- [x] Add styleguide route (/styleguide) demonstrating all design system primitives
- [ ] Add example brand token override file (showing how to swap tokens.css for a new brand)

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
- [ ] Add Markdown renderer for rich-text `body` fields when first article route is built

## Phase 4 — SEO/images/accessibility

- [x] Add central site config (`src/lib/config/site.ts`)
- [x] Add SEO types and metadata helpers (`src/lib/seo/types.ts`, `src/lib/seo/metadata.ts`)
- [x] Add SEO component (`src/lib/components/seo/SEO.svelte`) with title, description, canonical, og:*, twitter:*, JSON-LD
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

## Phase 5 — Runtime data/forms

- [ ] Add Postgres/Drizzle foundation (dormant by default)
- [ ] Add env validation (valibot or zod at startup)
- [ ] Add Superforms (`bun add sveltekit-superforms valibot`) as part of first form scaffold
- [ ] Add contact form pattern (forms.css + Superforms + Postmark)
- [ ] Add Postmark pattern
- [ ] Implement typed automation event emitter (`src/lib/automation/events.ts` — non-blocking webhook)
- [ ] Implement HMAC signing (`src/lib/automation/signing.ts`)
- [ ] Add `lead.created` event emission from contact form server action
- [ ] Add `newsletter.subscribed` event emission from newsletter form server action
- [ ] Document first n8n workflow (contact form → email notification)
- [ ] Add backup docs

## Phase 6 — Deployment

- [x] Add secrets workflow (SOPS + age — ADR-013, docs/deployment/secrets.md, .sops.yaml.example, secrets.example.yaml, .env.example, scripts/render-secrets.sh, scripts/check-secrets.sh, bun run secrets:render / secrets:check)
- [ ] Add Containerfile
- [ ] Add Quadlet templates
- [ ] Add Caddy examples
- [ ] Add deployment runbook

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
- [ ] Add architecture docs (content system overview)
- [ ] Add operations docs (secrets, deployment, backups)
- [ ] Add "new site from template" setup guide

## Phase 8 — Validation

- [ ] Run build
- [ ] Run typecheck
- [ ] Run lint
- [ ] Run formatting
- [ ] Run accessibility checks
- [ ] Run Lighthouse/perf check
- [ ] Verify container build
- [ ] Verify docs match implementation
- [ ] Verify styleguide route renders all documented classes without errors

## Deferred / backlog

- Formsnap — not planned; Superforms is the standard form library, add it directly
- Tailwind — explicitly not part of this template (see ADR-005)
- shadcn — explicitly not part of this template
- Auth module (Better Auth) — dormant; activate per-project only
- Dashboard / app-shell layout — out of scope for website template baseline
