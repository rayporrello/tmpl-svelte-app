# Template Build Backlog

## Phase 0 — Planning consolidation

- [x] Create build decision ledger
- [ ] Mark each decision ACCEPTED / CHALLENGE / DEFER / REJECTED
- [ ] Update ADRs to match accepted decisions
- [ ] Create permanent docs structure
- [ ] Move durable docs from planning into architecture/operations/reference drafts

## Phase 1 — Base project scaffold

- [ ] Create SvelteKit project foundation (package.json, svelte.config.js, vite.config.js)
- [ ] Configure Bun scripts (dev, build, preview, check)
- [ ] Configure adapter (svelte-adapter-bun)
- [ ] Add TypeScript strictness
- [ ] Add base routes (+layout.svelte exists; add +page.svelte home route)
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

- [ ] Add content directory
- [ ] Add Sveltia admin files
- [ ] Add content schema examples
- [ ] Add content loader
- [ ] Add sample pages/articles
- [ ] Add content validation

## Phase 4 — SEO/images/accessibility

- [ ] Add SEO component (title, description, og:*, canonical, schema.org)
- [ ] Add schema.org helpers
- [ ] Add sitemap route
- [ ] Add robots route
- [ ] Add image optimization script
- [ ] Add responsive image component
- [ ] Add semantic HTML rules

## Phase 5 — Runtime data/forms

- [ ] Add Postgres/Drizzle foundation (dormant by default)
- [ ] Add env validation (valibot or zod at startup)
- [ ] Add Superforms (`bun add sveltekit-superforms valibot`) as part of first form scaffold
- [ ] Add contact form pattern (forms.css + Superforms + Postmark)
- [ ] Add Postmark pattern
- [ ] Add optional n8n webhook pattern
- [ ] Add backup docs

## Phase 6 — Deployment

- [ ] Add Containerfile
- [ ] Add Quadlet templates
- [ ] Add Caddy examples
- [ ] Add secrets workflow
- [ ] Add deployment runbook

## Phase 7 — Template documentation

- [x] Finalize README.md
- [x] Finalize AGENTS.md
- [x] Finalize CLAUDE.md.template
- [x] Add CSS / design system doc (docs/planning/05-css-and-design-system.md)
- [x] Add template repo spec (docs/planning/07-template-repo-spec.md)
- [x] Add quality gates doc (docs/planning/08-quality-gates.md)
- [ ] Add architecture docs (content system, SEO, images)
- [ ] Add operations docs (secrets, deployment, backups)
- [ ] Add reference docs (semantic HTML patterns, token reference)
- [ ] Add "new site from template" guide

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
