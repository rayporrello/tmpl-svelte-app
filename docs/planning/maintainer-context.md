<!--
MAINTAINER NOTE — added 2026-04-27

This file is a one-shot LLM briefing for template-maintainer threads. It is a snapshot, not a contract — sections will drift as the template evolves. Trust the live repo over any specific claim here.

Known drift as of this note:
- The file-structure tree below still lists `06-agent-operating-model.md`, `ADR-003-sveltia-for-content.md`, and `ADR-006-agent-operating-model.md`. Those files have been deleted or moved. The agent-operating-model rationale lives in `AGENTS.md`; the Sveltia decision lives in `ADR-014`; the runtime event contract lives in `docs/automations/runtime-event-contract.md`.
- The numbered planning sequence has gaps (no `05`, no `06`) — that's intentional, see `docs/planning/README.md`.
- For the current v1.0.0 readiness state, read `docs/planning/11-template-build-backlog.md` (top section) and `docs/planning/12-post-v1-roadmap.md`.

If any other section here conflicts with the live repo, the live repo wins. Update the conflicting section in a focused commit rather than letting drift accumulate.
-->

You are helping me finish my reusable "golden template" website repo, not just plan it.

Repo name/context:
I have started a new repo called tmpl-svelte-app. This repo is intended to become my reusable, high-quality base website template for future projects. Most major decisions are already roughly 90% made. The goal of each thread is to move from topic-specific thinking into concrete repo changes, implementation tasks, documentation updates, and Claude Code prompts that get the template built.

Current repo structure:

tmpl-svelte-app/
├── .env.example
├── .gitignore
├── .prettierrc
├── .sops.yaml.example
├── AGENTS.md
├── CLAUDE.md.template
├── Containerfile
├── Containerfile.node.example
├── README.md
├── bun.lock
├── eslint.config.js
├── lefthook.yml
├── package.json
├── playwright.config.ts
├── secrets.example.yaml
├── svelte.config.js
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── .github/
│ ├── dependabot.yml
│ └── workflows/
│ └── ci.yml
├── content/
│ ├── articles/
│ │ └── sample-post.md
│ ├── pages/
│ │ └── home.yml
│ ├── team/
│ │ └── sample-person.yml
│ └── testimonials/
│ └── sample-testimonial.yml
├── deploy/
│ ├── Caddyfile.example
│ ├── env.example
│ └── quadlets/
│ ├── web.container
│ └── web.network
├── docs/
│ ├── ai-planning-context-prompt.md
│ ├── getting-started.md
│ ├── template-maintenance.md
│ ├── template-update-strategy.md
│ ├── automations/
│ │ ├── README.md
│ │ ├── content-automation-contract.md
│ │ ├── n8n-patterns.md
│ │ ├── runtime-event-contract.md
│ │ └── security-and-secrets.md
│ ├── cms/
│ │ ├── README.md
│ │ ├── collection-patterns.md
│ │ ├── content-safety.md
│ │ ├── sveltia-ai-reference.md
│ │ ├── sveltia-content-contract.md
│ │ └── sveltia-guide.md
│ ├── content/
│ │ └── markdown.md
│ ├── deployment/
│ │ ├── README.md
│ │ ├── runbook.md
│ │ └── secrets.md
│ ├── design-system/
│ │ ├── README.md
│ │ ├── accessibility.md
│ │ ├── component-css-rules.md
│ │ ├── forms-guide.md
│ │ ├── images.md
│ │ ├── llm-css-rules.md
│ │ ├── llm-html-rules.md
│ │ ├── media-editor-guide.md
│ │ ├── semantic-html-guide.md
│ │ ├── tokens-guide.md
│ │ └── typography.md
│ ├── observability/
│ │ ├── README.md
│ │ ├── error-handling.md
│ │ ├── n8n-workflows.md
│ │ ├── runbook.md
│ │ └── tiers.md
│ ├── planning/
│ │ ├── README.md
│ │ ├── 00-vision.md
│ │ ├── 01-principles.md
│ │ ├── 02-scope-and-non-goals.md
│ │ ├── 03-stack-decisions.md
│ │ ├── 04-content-model.md
│ │ ├── 06-agent-operating-model.md
│ │ ├── 07-template-repo-spec.md
│ │ ├── 08-quality-gates.md
│ │ ├── 09-maintenance-loop.md
│ │ ├── 10-build-decision-ledger.md
│ │ ├── 11-template-build-backlog.md
│ │ └── adrs/
│ │ ├── ADR-001-one-generic-template.md
│ │ ├── ADR-002-core-plus-dormant-modules.md
│ │ ├── ADR-003-sveltia-for-content.md
│ │ ├── ADR-004-postgres-for-runtime-data.md
│ │ ├── ADR-005-css-token-architecture.md
│ │ ├── ADR-006-agent-operating-model.md
│ │ ├── ADR-007-podman-caddy-infrastructure.md
│ │ ├── ADR-008-semantic-html-contract.md
│ │ ├── ADR-009-image-pipeline.md
│ │ ├── ADR-010-typography-and-font-loading.md
│ │ ├── ADR-011-built-in-seo-system.md
│ │ ├── ADR-012-bun-first-dependency-and-build-artifact-policy.md
│ │ ├── ADR-013-sops-age-secrets-management.md
│ │ ├── ADR-014-sveltia-content-system.md
│ │ ├── ADR-015-n8n-automation-bridge.md
│ │ ├── ADR-016-observability-and-error-handling.md
│ │ ├── ADR-017-sveltia-cms-content-safety.md
│ │ ├── ADR-018-production-runtime-and-deployment-contract.md
│ │ └── ADR-019-security-headers-and-csp-baseline.md
│ └── seo/
│ ├── README.md
│ ├── launch-checklist.md
│ ├── page-contract.md
│ └── schema-guide.md
├── scripts/
│ ├── check-assets.ts
│ ├── check-cms-config.ts
│ ├── check-content-diff.ts
│ ├── check-launch.ts
│ ├── check-secrets.sh
│ ├── check-seo.ts
│ ├── generate-placeholder-assets.ts
│ ├── init-site.ts
│ ├── optimize-images.js
│ ├── render-secrets.sh
│ └── validate-content.ts
├── src/
│ ├── app.css
│ ├── app.d.ts
│ ├── app.html
│ ├── hooks.server.ts
│ ├── lib/
│ │ ├── components/
│ │ │ ├── CmsImage.svelte
│ │ │ ├── Section.svelte
│ │ │ └── seo/
│ │ │ └── SEO.svelte
│ │ ├── config/
│ │ │ └── site.ts
│ │ ├── content/
│ │ │ ├── articles.ts
│ │ │ ├── index.ts
│ │ │ ├── markdown.ts
│ │ │ ├── pages.ts
│ │ │ ├── team.ts
│ │ │ ├── testimonials.ts
│ │ │ └── types.ts
│ │ ├── env/
│ │ │ ├── private.ts
│ │ │ └── public.ts
│ │ ├── forms/
│ │ │ └── contact.schema.ts
│ │ ├── observability/
│ │ │ └── types.ts
│ │ ├── seo/
│ │ │ ├── metadata.ts
│ │ │ ├── routes.ts
│ │ │ ├── schemas.ts
│ │ │ ├── sitemap.ts
│ │ │ └── types.ts
│ │ ├── server/
│ │ │ ├── csp.ts
│ │ │ ├── env.ts
│ │ │ ├── logger.ts
│ │ │ ├── request-id.ts
│ │ │ ├── safe-error.ts
│ │ │ └── forms/
│ │ │ ├── email-provider.ts
│ │ │ ├── rate-limit.ts
│ │ │ └── providers/
│ │ │ ├── console.ts
│ │ │ └── postmark.ts
│ │ └── styles/
│ │ ├── animations.css
│ │ ├── base.css
│ │ ├── brand.example.css
│ │ ├── forms.css
│ │ ├── reset.css
│ │ ├── tokens.css
│ │ └── utilities.css
│ └── routes/
│ ├── +error.svelte
│ ├── +layout.svelte
│ ├── +page.server.ts
│ ├── +page.svelte
│ ├── articles/
│ │ ├── +page.server.ts
│ │ ├── +page.svelte
│ │ └── [slug]/
│ │ ├── +page.server.ts
│ │ └── +page.svelte
│ ├── contact/ ← live contact form
│ │ ├── +page.server.ts
│ │ └── +page.svelte
│ ├── healthz/
│ │ └── +server.ts
│ ├── llms.txt/
│ │ └── +server.ts
│ ├── robots.txt/
│ │ └── +server.ts
│ ├── sitemap.xml/
│ │ └── +server.ts
│ └── styleguide/
│ ├── +page.server.ts
│ └── +page.svelte
├── static/
│ ├── admin/
│ │ ├── config.yml
│ │ └── index.html
│ ├── apple-touch-icon.png
│ ├── favicon-32.png
│ ├── favicon.svg
│ ├── og-default.png
│ ├── site.webmanifest
│ ├── fonts/.gitkeep
│ └── uploads/.gitkeep
└── tests/
├── e2e/
│ └── smoke.spec.ts
└── unit/
├── articles.test.ts
├── env.test.ts
└── seo-metadata.test.ts

Prior source notes:
I have older and newer notes covering the website stack, scaffolding, SEO, images, typography, CSS architecture, semantic HTML, secrets, deployment, Sveltia CMS, automations, checklists, and agent rules. Treat these as source material to distill into the final template. Do not treat old notes as binding if they conflict with current direction.

Important correction:
Some older notes include SQLite/lite-path assumptions. Do not default to SQLite. The current direction is Postgres for runtime data unless a thread explicitly reopens that decision.

Decision posture:

- Optimize for performance, robustness, maintainability, simplicity, and long-term leverage.
- Do not recommend technologies merely because they are common, popular, hiring-friendly, or industry-default.
- Do not push React, Node.js, Prisma, Next.js, Tailwind, or other defaults unless there is a truly compelling reason and it beats the performance/simplicity bar.
- Prefer lean, explicit, durable systems over framework churn.
- Prefer fewer dependencies, but not at the cost of correctness, security, accessibility, or maintainability.
- Prefer build-time/static output where possible, server runtime only where justified.
- Prefer clear conventions that agents can follow reliably.
- Prefer decisions that make the template excellent for solo/founder-led projects, fast landing pages, content sites, product sites, and more advanced sites with forms, CMS, automations, or runtime data.
- Do not overfit to one site idea. This is a reusable base template.

Current high-level direction:

- SvelteKit/Svelte-oriented template.
- Bun-first: Bun is the exclusive package manager and script runner. Never npm/npx. bun.lock committed. Build artifacts (.svelte-kit/, build/, node_modules/) gitignored. See ADR-012.
- Sveltia CMS with Git-backed content: `content/` directory holds all editorial content (YAML pages/team/testimonials, Markdown articles). Sveltia admin UI at `static/admin/`. Typed content loaders in `src/lib/content/`. See ADR-014 and docs/cms/.
- n8n as optional external automation layer: content automations write to `content/` via GitHub API; runtime automations (Phase 5) receive typed webhook events from SvelteKit actions. The site works without n8n. See ADR-015 and docs/automations/.
- SOPS + age secrets management: `.env.example` documents required vars, `secrets.yaml` is encrypted and committed, `.env` is rendered locally and never committed. See ADR-013 and docs/deployment/secrets.md.
- Postgres for runtime data.
- CSS token architecture and hand-authored design system, not Tailwind. See ADR-005.
- Built-in SEO system: SEO component, site config (site.ts), canonical/OG/JSON-LD helpers, sitemap.xml, robots.txt, llms.txt, schema.org helpers. See ADR-011 and docs/seo/.
- Image pipeline: two-tier. Brand/dev images in src/lib/assets/ use <enhanced:img> (Vite). CMS uploads in static/uploads/ use <CmsImage> (Sharp prebuild). See ADR-009.
- Typography: Fontsource variable fonts installed via Bun; imported in app.css; tokens in tokens.css. No Google Fonts CDN. No preload for Fontsource. See ADR-010.
- Semantic HTML contract: Section.svelte wraps section + .container. +layout.svelte owns the site shell (skip link, header, main, footer). See ADR-008.
- Strong accessibility and semantic HTML baseline. Full quality gates in docs/planning/08-quality-gates.md.
- Podman + Caddy deployment path. See ADR-007.
- Core template plus optional/dormant modules, rather than many separate templates. See ADR-002.
- Agent-friendly operating model via AGENTS.md and CLAUDE.md.template. See ADR-006.
- Documentation is part of the template contract, not an afterthought.

Completed build phases (as of April 2026):

- Phase 1 (project scaffold): COMPLETE. SvelteKit + Bun + svelte-adapter-bun + TypeScript + vite.config.ts. +error.svelte present (Batch B).
- Phase 2 (CSS/design system): COMPLETE. tokens.css, reset.css, base.css, animations.css, utilities.css, forms.css; brand.example.css ("Warm Coral") re-skin example. Styleguide at /styleguide includes brand swatches, shadow demos, Buttons section.
- Phase 3 (CMS/content): COMPLETE. content/ directory, Sveltia CMS admin files (static/admin/), typed content loaders (pages, articles, team, testimonials), Markdown renderer with three trust tiers (src/lib/content/markdown.ts — marked + sanitize-html), CMS content-safety scripts (check:cms, check:content, check:content-diff), CMS docs (sveltia-guide.md, content-safety.md), ADR-014, ADR-015, ADR-017. Remaining per-project task only: configure GitHub OAuth in static/admin/config.yml backend.repo via init:site or manually.
- Phase 4 (SEO / images / accessibility / semantic HTML): COMPLETE. SEO component, site config, schema helpers, sitemap/robots/llms routes, image pipeline (Sharp + enhanced:img + CmsImage), Section.svelte, quality gates, scripts/check-seo.ts, scripts/check-assets.ts, scripts/optimize-images.js, accessibility doc with WCAG AA contrast fixes (Batch C).
- Phase 4b (observability + CMS safety spine): COMPLETE. +error.svelte (with requestId display and contact link), /healthz, hooks.server.ts (request ID, safe error normalization, security headers, CSP, env init), logger, request-id, safe-error, observability types, ADR-016, ADR-017, observability docs (tiers, error-handling, n8n-workflows, runbook).
- Phase 5 (forms/runtime data): COMPLETE for v1. Postgres + Drizzle are the default runtime data layer; `/contact` is live with Superforms + Valibot, honeypot handling, DB persistence, EmailProvider seam (console default + Postmark), in-memory token-bucket rate limiter, signed automation providers, `lead.created` event emission, `/readyz` Postgres readiness probe, and `automation_dead_letters`.
- Phase 6 (deployment): COMPLETE for the website-only baseline. SOPS + age workflow (ADR-013, secrets.md, scripts/render-secrets.sh + check-secrets.sh). Production runtime (Batch A1): engines.bun, packageManager, preinstall guard, validation lifecycle split (validate vs validate:launch), default static assets (favicon, og-default, manifest), minimal app security headers, ADR-018. Containers + deploy (Batch A2): Containerfile (multi-stage Bun, non-root, HEALTHCHECK), Containerfile.node.example escape hatch, deploy/quadlets/{web.container,web.network}, deploy/Caddyfile.example, deploy/env.example, docs/deployment/runbook.md. CI (Batch A3): .github/workflows/ci.yml (validate/image/launch jobs, Trivy CRITICAL blocking, smoke tests, GHCR push), .github/dependabot.yml. Security baseline (Batch B): Valibot env schemas (src/lib/server/env.ts + src/lib/env/{public,private}.ts), CSP baseline (src/lib/server/csp.ts) with /admin allowance for Sveltia CDN, ADR-019. init:site interactive initializer (Batch B). Vitest + Playwright wired into validate (Batches B and C).
- Phase E (ergonomics): COMPLETE. Lefthook (pre-commit prettier + eslint --fix), ESLint flat config, Prettier config, getting-started.md (11-step walkthrough), template-update-strategy.md (clone-and-customize model + future @<owner>/web-template-utils extraction path).
- Phase F (UI groundwork): COMPLETE. .btn / .btn-primary / .btn-secondary / .btn-ghost / .btn-sm / .btn-lg utility classes in utilities.css; /articles index route (server load + cards + axe-clean); real header/footer nav with WCAG AA-passing active state.

Remaining template work:

- No v1 launch blockers remain in the database-backed website baseline.
- Post-v1 topics live in `docs/planning/12-post-v1-roadmap.md` and should get a focused ADR before implementation.
- Phase 8 final validation pass: container build, Lighthouse/perf check, full doc-vs-implementation audit before tagging a v1 release.

How I want you to work:

1. Assume the purpose of this thread is to move the template closer to being done.
2. Do not turn this into an open-ended planning exercise.
3. Start from the current direction unless there is a serious reason to challenge it.
4. Challenge only decisions that are high-risk, outdated, contradictory, or likely to create long-term drag.
5. Separate what is:
   - ready to implement now,
   - configurable per future site,
   - deferred until a real client/project needs it,
   - rejected as overengineering.
6. Translate decisions into actual repo outputs:
   - files to create,
   - files to update,
   - docs to update,
   - ADRs to add or revise,
   - implementation tasks,
   - validation checks.
7. Keep planning minimal and execution-oriented.
8. Prefer exact file paths and concrete checklists.
9. Make the output easy to hand directly to Claude Code.
10. If something should become permanent template documentation, say where it belongs.
11. If something belongs only in planning history, say so.
12. Avoid vague best practices. Produce buildable instructions.

For this thread, the topic is:

[INSERT TOPIC HERE]

The specific question or decision I want to work through is:

[INSERT QUESTION HERE]

Please respond with this structure:

1. Target end state for this topic
   - What should exist in the finished template when this topic is done.

2. Final or near-final decisions
   - What we should lock now.
   - What remains configurable per future site.
   - What should be deferred or rejected.

3. Required repo changes
   - Files to create.
   - Files to update.
   - Files to move or rename.
   - ADRs to add or update.
   - Permanent docs to add or update.

4. Implementation checklist
   - Ordered tasks that turn the decision into actual repo state.

5. Validation checklist
   - How we know this topic is correctly implemented.

6. Claude Code prompt
   - A direct prompt that can be pasted into Claude Code to make the repo changes.
   - The prompt should be scoped to this topic.
   - The prompt should tell Claude Code not to wander into unrelated topics.
   - The prompt should require a summary of changed files and any unresolved blockers.

Default behavior:
Unless I explicitly ask for more theory, bias toward "what do we build or change next?"
