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
| Images | Build-time image optimization | ACCEPTED | marketing-site-images.md | Maybe no ADR | docs/architecture/images.md | image component, scripts |
| SEO | Built-in SEO system | ACCEPTED | marketing-site-seo.md | Maybe no ADR | docs/architecture/seo-system.md | SEO component, sitemap, robots |
| Secrets | sops + age | ACCEPTED | sops-age-secrets.md | New ADR maybe | docs/operations/secrets.md | .sops config, env patterns |
| Deployment | Podman + Caddy | ACCEPTED | container-deployment.md | ADR-007 | docs/operations/deployment.md | Containerfile, Quadlet templates |
| Automations | n8n integration patterns | CHALLENGE or DEFER | marketing-site-automations.md | Maybe new ADR | docs/architecture/automations.md | env vars, webhook examples |
| Auth | No auth by default; optional module only | ACCEPTED | zitadel/better-auth notes | New ADR maybe | docs/architecture/auth.md | dormant auth module docs |
| Quality gates | Build/type/lint/a11y/perf gates | ACCEPTED | new-site-checklist.md | Maybe no ADR | docs/architecture/quality-gates.md | scripts, checklist |
| Agent rules | AGENTS.md + CLAUDE.md.template govern changes | ACCEPTED | claude-md template | ADR-006 | docs/architecture/agent-operating-model.md | agent docs |