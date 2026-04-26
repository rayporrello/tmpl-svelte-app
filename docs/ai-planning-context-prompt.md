You are helping me finish my reusable “golden template” website repo, not just plan it.

Repo name/context:
I have started a new repo called tmpl-svelte-app. This repo is intended to become my reusable, high-quality base website template for future projects. Most major decisions are already roughly 90% made. The goal of each thread is to move from topic-specific thinking into concrete repo changes, implementation tasks, documentation updates, and Claude Code prompts that get the template built.

Current repo structure:

tmpl-svelte-app/
├── AGENTS.md
├── CLAUDE.md.template
├── README.md
├── .gitignore
├── bun.lock
├── package.json
├── svelte.config.js
├── tsconfig.json
├── vite.config.ts
├── docs/
│   ├── ai-planning-context-prompt.md
│   ├── template-maintenance.md
│   ├── design-system/
│   │   ├── README.md
│   │   ├── component-css-rules.md
│   │   ├── forms-guide.md
│   │   ├── images.md
│   │   ├── llm-css-rules.md
│   │   ├── llm-html-rules.md
│   │   ├── media-editor-guide.md
│   │   ├── semantic-html-guide.md
│   │   ├── tokens-guide.md
│   │   └── typography.md
│   ├── planning/
│   │   ├── README.md
│   │   ├── 00-vision.md
│   │   ├── 01-principles.md
│   │   ├── 02-scope-and-non-goals.md
│   │   ├── 03-stack-decisions.md
│   │   ├── 04-content-model.md
│   │   ├── 06-agent-operating-model.md
│   │   ├── 07-template-repo-spec.md
│   │   ├── 08-quality-gates.md
│   │   ├── 09-maintenance-loop.md
│   │   ├── 10-build-decision-ledger.md
│   │   ├── 11-template-build-backlog.md
│   │   └── adrs/
│   │       ├── ADR-001-one-generic-template.md
│   │       ├── ADR-002-core-plus-dormant-modules.md
│   │       ├── ADR-003-sveltia-for-content.md
│   │       ├── ADR-004-postgres-for-runtime-data.md
│   │       ├── ADR-005-css-token-architecture.md
│   │       ├── ADR-006-agent-operating-model.md
│   │       ├── ADR-007-podman-caddy-infrastructure.md
│   │       ├── ADR-008-semantic-html-contract.md
│   │       ├── ADR-009-image-pipeline.md
│   │       ├── ADR-010-typography-and-font-loading.md
│   │       ├── ADR-011-built-in-seo-system.md
│   │       └── ADR-012-bun-first-dependency-and-build-artifact-policy.md
│   └── seo/
│       ├── README.md
│       ├── launch-checklist.md
│       ├── page-contract.md
│       └── schema-guide.md
├── scripts/
│   ├── check-seo.ts
│   └── optimize-images.js
├── src/
│   ├── app.css
│   ├── app.html
│   ├── lib/
│   │   ├── components/
│   │   │   ├── CmsImage.svelte
│   │   │   ├── Section.svelte
│   │   │   └── seo/
│   │   │       └── SEO.svelte
│   │   ├── config/
│   │   │   └── site.ts
│   │   ├── seo/
│   │   │   ├── metadata.ts
│   │   │   ├── routes.ts
│   │   │   ├── schemas.ts
│   │   │   ├── sitemap.ts
│   │   │   └── types.ts
│   │   └── styles/
│   │       ├── animations.css
│   │       ├── base.css
│   │       ├── forms.css
│   │       ├── reset.css
│   │       ├── tokens.css
│   │       └── utilities.css
│   └── routes/
│       ├── +layout.svelte
│       ├── llms.txt/
│       │   └── +server.ts
│       ├── robots.txt/
│       │   └── +server.ts
│       ├── sitemap.xml/
│       │   └── +server.ts
│       └── styleguide/
│           ├── +page.server.ts
│           └── +page.svelte
└── static/
    ├── fonts/.gitkeep
    └── uploads/.gitkeep


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
- Sveltia CMS or file-based content management.
- Postgres for runtime data.
- CSS token architecture and hand-authored design system, not Tailwind. See ADR-005.
- Built-in SEO system: SEO component, site config (site.ts), canonical/OG/JSON-LD helpers, sitemap.xml, robots.txt, llms.txt, schema.org helpers. See ADR-011 and docs/seo/.
- Image pipeline: two-tier. Brand/dev images in src/lib/assets/ use <enhanced:img> (Vite). CMS uploads in static/uploads/ use <CmsImage> (Sharp prebuild). See ADR-009.
- Typography: Fontsource variable fonts installed via Bun; imported in app.css; tokens in tokens.css. No Google Fonts CDN. No preload for Fontsource. See ADR-010.
- Semantic HTML contract: Section.svelte wraps section + .container. +layout.svelte owns the site shell (skip link, header, main, footer). See ADR-008.
- Strong accessibility and semantic HTML baseline. Full quality gates in docs/planning/08-quality-gates.md.
- Podman + Caddy deployment path. See ADR-007.
- sops + age secrets workflow.
- Core template plus optional/dormant modules, rather than many separate templates. See ADR-002.
- Agent-friendly operating model via AGENTS.md and CLAUDE.md.template. See ADR-006.
- Documentation is part of the template contract, not an afterthought.

Completed build phases (as of April 2026):
- Phase 1 (project scaffold): SvelteKit + Bun + svelte-adapter-bun + TypeScript + vite.config.ts. Builds successfully. Still missing: home page route (+page.svelte), error page (+error.svelte).
- Phase 2 (CSS/design system): Complete. tokens.css, reset.css, base.css, animations.css, utilities.css, forms.css. Styleguide route active at /styleguide.
- Phase 4 (SEO / images / accessibility / semantic HTML): Complete. SEO component, site config, schema helpers, sitemap/robots/llms routes, image pipeline (Sharp + enhanced:img + CmsImage), Section.svelte, quality gates, scripts/check-seo.ts, scripts/optimize-images.js.

Not yet started:
- Phase 3 (CMS/content): Sveltia CMS, content directory, content loaders, sample content.
- Phase 5 (forms/runtime data): Postgres, Drizzle, Superforms, contact form pattern, Postmark.
- Phase 6 (deployment): Containerfile, Quadlet templates, Caddy config, secrets workflow, runbook.

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
Unless I explicitly ask for more theory, bias toward “what do we build or change next?”