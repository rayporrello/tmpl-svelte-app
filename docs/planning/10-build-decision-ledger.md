# Build Decision Ledger

This document converts prior planning notes into accepted template decisions, unresolved decisions, ADR updates, and implementation tasks.

## Status values

- ACCEPTED — ready to implement
- CHALLENGE — prior decision exists but must be re-evaluated before implementation
- DEFER — intentionally postponed
- REJECTED — explicitly not part of the template
- TODO — not decided yet

## Decision ledger

| Area | Decision | Status | Source notes | ADR | Architecture doc | Implementation output |
|---|---|---:|---|---|---|---|
| Template model | One generic template with optional dormant modules | ACCEPTED | marketing-site-scaffolding.md | ADR-001, ADR-002 | docs/architecture/template-model.md | Base repo structure, module flags/docs |
| Framework | SvelteKit-oriented template | ACCEPTED | marketing-site-playbook.md | ADR-003 or new ADR | docs/architecture/application-runtime.md | SvelteKit scaffold |
| Runtime | Bun-oriented dev/build/runtime | ACCEPTED or CHALLENGE | marketing-site-playbook.md | New or existing | docs/architecture/application-runtime.md | package scripts, adapter, Containerfile |
| Runtime data | Postgres for runtime data, no SQLite default | ACCEPTED | user correction + prior notes | ADR-004 | docs/architecture/runtime-data.md | Drizzle/Postgres files |
| CMS/content | Sveltia CMS + file-based content | ACCEPTED or CHALLENGE | sveltia-cms-content-patterns.md | ADR-003 | docs/architecture/content-system.md | static/admin, content loaders |
| CSS | Token-first CSS architecture, no Tailwind | ACCEPTED | css-architecture.md | ADR-005 | docs/architecture/css-and-design-system.md | CSS files, component rules |
| Images | Two-tier pipeline: `<enhanced:img>` for `src/lib/assets/`, `<CmsImage>` + Sharp prebuild for `static/uploads/` | ACCEPTED | marketing-site-images.md | ADR-009 | docs/design-system/images.md | `CmsImage.svelte`, `scripts/optimize-images.js`, `vite.config.ts` |
| Typography | Fontsource variable fonts for open-source; self-hosted `woff2` in `static/fonts/` for paid; tokens in `tokens.css`; no preload for Fontsource | ACCEPTED | — | ADR-010 | docs/design-system/typography.md | `tokens.css`, `app.css`, `static/fonts/` |
| SEO | Built-in SEO system | ACCEPTED | marketing-site-seo.md | ADR-011 | docs/seo/ | SEO component, sitemap, robots, llms.txt, schema helpers, check-seo.ts |
| Secrets | sops + age | ACCEPTED | sops-age-secrets.md | New ADR maybe | docs/operations/secrets.md | .sops config, env patterns |
| Deployment | Podman + Caddy | ACCEPTED | container-deployment.md | ADR-007 | docs/operations/deployment.md | Containerfile, Quadlet templates |
| Automations | n8n integration patterns | CHALLENGE or DEFER | marketing-site-automations.md | Maybe new ADR | docs/architecture/automations.md | env vars, webhook examples |
| Auth | No auth by default; optional module only | ACCEPTED | zitadel/better-auth notes | New ADR maybe | docs/architecture/auth.md | dormant auth module docs |
| Quality gates | Build/type/lint/a11y/perf gates | ACCEPTED | new-site-checklist.md | Maybe no ADR | docs/architecture/quality-gates.md | scripts, checklist |
| Agent rules | AGENTS.md + CLAUDE.md.template govern changes | ACCEPTED | claude-md template | ADR-006 | docs/architecture/agent-operating-model.md | agent docs |
| Semantic HTML | Semantic HTML contract with Section.svelte and site shell | ACCEPTED | user direction | ADR-008 | docs/design-system/semantic-html-guide.md | Section.svelte, +layout.svelte, llm-html-rules.md, ADR-008 |
| Bun-first toolchain | Bun exclusively for package management and scripts; bun.lock committed; build artifacts (.svelte-kit/, build/, node_modules/) gitignored | ACCEPTED | user direction | ADR-012 | docs/template-maintenance.md | .gitignore, bun.lock, package.json scripts |
| Production runtime contract | svelte-adapter-bun is the production SvelteKit adapter; PORT/HOST/ORIGIN env contract confirmed from adapter README; BODY_SIZE_LIMIT not supported in v0.5.2; Template Invariant established (7 steps from install to rollback) | ACCEPTED | plan revision 3 | ADR-018 | docs/deployment/runbook.md (A2) | Containerfile (A2), deploy/quadlets/ (A2) |
| Validation lifecycle split | `validate` for PR/push (type, SEO, CMS, content, assets, build); `validate:launch` for release/tag (validate + check:launch + check:content-diff); severity matches lifecycle stage | ACCEPTED | plan revision 3 | ADR-018 | — | package.json scripts, scripts/check-assets.ts, scripts/check-launch.ts |
| Minimal app security headers | X-Content-Type-Options, Referrer-Policy, X-Frame-Options, Permissions-Policy set inline in existing handle after resolve(); no sequence() in A1; CSP deferred to Batch B with ADR-019 | ACCEPTED | plan revision 3 | ADR-018, ADR-019 (B) | — | src/hooks.server.ts |
| CSP baseline | App-owned CSP via src/lib/server/csp.ts; per-route (/admin is more permissive for Sveltia CDN); no sequence() introduced; inline in existing handle; extension points documented in code + ADR-019; style-src unsafe-inline needed for SvelteKit SSR | ACCEPTED | plan revision 3, Batch B | ADR-019 | — | src/lib/server/csp.ts, src/hooks.server.ts |
| Env schema validation | Valibot schemas for public/private env vars; separate import paths ($lib/env/public, $lib/env/private); initEnv() called in handle on first request (lazy, memoized); REQUIRED_*_ENV_VARS arrays imported by check:launch without triggering validation; CI validate job provides ORIGIN stub | ACCEPTED | plan revision 3, Batch B | ADR-018 | — | src/lib/server/env.ts, src/lib/env/public.ts, src/lib/env/private.ts |
| init:site script | Interactive idempotent initializer; no new deps (Bun readline); rewrites 9 files; detects current values as defaults for re-run convergence | ACCEPTED | plan revision 3, Batch B | — | — | scripts/init-site.ts |
| Unit testing with Vitest | Vitest chosen over bun:test (SvelteKit $lib path aliases require config either way; Vitest has better SvelteKit ecosystem support); 3 test files covering env validation, SEO metadata helpers, article loading; wired into validate | ACCEPTED | plan revision 3, Batch B (risk §3 resolved) | — | — | vitest.config.ts, tests/unit/ |