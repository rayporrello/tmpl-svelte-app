# Documentation Map And Audit

Last audited: 2026-05-03

This file maps the implemented systems in this repository to the docs that
should be kept current. It also records which planning files are durable
decisions and which are now implementation history.

## Authority Order

1. `src/`, `scripts/`, root config, and CI files
2. `AGENTS.md` and `CLAUDE.md.template`
3. Permanent docs under `docs/`
4. Accepted ADRs under `docs/planning/adrs/`
5. Other planning files

If planning notes conflict with implementation, implementation wins. Update or
delete the planning note.

## Decision Files To Keep

Keep accepted ADRs unless a later ADR supersedes them:

- `ADR-001`, `ADR-002`, `ADR-004`, `ADR-005`
- `ADR-007` through `ADR-023`

There is no `ADR-003` or `ADR-006`; those slots were skipped/superseded.

## System Coverage

| System                               | Implementation source                                                                                                                                                                                                                                                                                                              | Primary docs                                                                                                                                          | Validation / tests                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Local bootstrap and project manifest | `bootstrap`, `scripts/bootstrap.ts`, `scripts/init-site.ts`, `scripts/doctor.ts`, `scripts/lib/`, `site.project.json`, `.template/project.json`                                                                                                                                                                                    | `docs/getting-started.md`, `docs/template-maintenance.md`, `ADR-021`                                                                                  | `bun run check:bootstrap`, `bun run check:init-site`, unit tests                                        |
| SvelteKit shell and routes           | `src/routes/`, `src/hooks.server.ts`, `src/app.html`, `src/app.css`                                                                                                                                                                                                                                                                | `README.md`, `docs/getting-started.md`, `docs/seo/page-contract.md`                                                                                   | `bun run check`, `bun run routes:check`, Playwright                                                     |
| Design system and semantic HTML      | `src/lib/styles/`, `src/lib/components/Section.svelte`, `src/routes/styleguide/`, `scripts/check-accessibility.ts`                                                                                                                                                                                                                 | `docs/design-system/`, `docs/accessibility/checklist.md`, `ADR-005`, `ADR-008`, `ADR-009`, `ADR-010`                                                  | `bun run check:design-system`, `bun run check:accessibility`, axe, visual smoke                         |
| Git-backed content and Sveltia CMS   | `content/`, `static/admin/`, `src/lib/content/`                                                                                                                                                                                                                                                                                    | `docs/cms/`, `docs/content/`, `ADR-014`, `ADR-017`                                                                                                    | `bun run check:cms`, `bun run check:content`, `bun run check:content-diff`                              |
| SEO, discovery, and feeds            | `src/lib/seo/`, `src/lib/components/seo/`, `src/routes/{sitemap.xml,robots.txt,llms.txt,rss.xml}/`                                                                                                                                                                                                                                 | `docs/seo/`, `docs/seo/page-brief.template.md`, `ADR-011`                                                                                             | `bun run check:seo`, `bun run routes:check`, feed/unit/e2e tests                                        |
| Postgres and Drizzle                 | `src/lib/server/db/`, `drizzle/`, `drizzle.config.ts`, `deploy/Containerfile.postgres`, `deploy/quadlets/postgres.*`, `src/routes/readyz/+server.ts`                                                                                                                                                                               | `docs/database/README.md`, `docs/deployment/`, `ADR-004`, `ADR-022`, `ADR-023`                                                                        | `bun run check:db`, deploy preflight, unit tests, bootstrap smoke                                       |
| Business forms and scaffolds         | `src/routes/contact/`, `src/lib/forms/`, `src/lib/server/forms/`, `scripts/scaffold-form.ts`, `scripts/lib/scaffold.ts`, `scripts/form-ops.ts`                                                                                                                                                                                     | `docs/forms/README.md`, `docs/design-system/forms-guide.md`                                                                                           | `bun run forms:check`, scaffold/form-ops/schema/unit/e2e tests                                          |
| Runtime automation outbox            | `src/lib/server/automation/`, `scripts/automation-worker.ts`, `scripts/form-ops.ts`, `deploy/quadlets/worker.container`, `automation_events`, `automation_dead_letters`                                                                                                                                                            | `docs/automations/`, `docs/automations/n8n-workflow-contract.md`, `docs/forms/README.md`, `docs/deployment/`, `ADR-015`                               | automation unit tests, `bun run forms:check`, deploy preflight                                          |
| Analytics and consent                | `src/lib/analytics/`, `src/lib/components/analytics/`, `src/lib/server/analytics/`, `src/lib/privacy/`                                                                                                                                                                                                                             | `docs/analytics/`, `docs/modules/cookie-consent.md`                                                                                                   | `bun run check:analytics`, analytics unit/e2e tests                                                     |
| Privacy retention                    | `src/lib/server/privacy/retention.ts`, `scripts/privacy-prune.ts`                                                                                                                                                                                                                                                                  | `docs/privacy/data-retention.md`                                                                                                                      | privacy unit tests, dry-run default command                                                             |
| Secrets and env contract             | `src/lib/server/env.ts`, `src/lib/env/`, `.env.example`, `secrets.example.yaml`, `scripts/render-secrets.sh`, `scripts/check-secrets.sh`                                                                                                                                                                                           | `docs/deployment/secrets.md`, `ADR-013`, `ADR-018`                                                                                                    | `bun run secrets:check`, env unit tests, launch checks                                                  |
| Deployment and runtime               | `.dockerignore`, `Containerfile`, `serve.js`, `deploy/`, `scripts/deploy-preflight.ts`, `scripts/deploy-smoke.ts`, `.github/workflows/ci.yml`                                                                                                                                                                                      | `docs/deployment/`, `ADR-007`, `ADR-018`, `ADR-019`                                                                                                   | CI image build, Trivy, container smoke, deploy preflight, deploy smoke                                  |
| Performance budgets                  | `performance.budget.json`, `scripts/check-performance.ts`, `build/client/`, `static/uploads/`, `src/lib/assets/`                                                                                                                                                                                                                   | `docs/template-maintenance.md`, `docs/design-system/images.md`                                                                                        | `bun run check:performance`, `bun run images:optimize`                                                  |
| Backups and restore (PITR + legacy)  | `deploy/Containerfile.postgres`, `scripts/backup-base.sh`, `scripts/backup-wal-check.sh`, `scripts/backup-pitr-check.sh`, `scripts/backup-restore-drill.ts`, `scripts/backup-*.sh`, `scripts/restore-db.sh`, `scripts/backup-check.ts`, `deploy/systemd/backup-base.*`, `deploy/systemd/backup-check.*`, `deploy/systemd/backup.*` | `docs/operations/backups.md`, `docs/operations/restore.md`, `docs/operations/architecture.md`, `docs/privacy/data-retention.md`, `ADR-022`, `ADR-023` | backup unit tests, `bun run backup:pitr:check`, `bun run backup:restore:drill`, `bun run backup:verify` |
| Per-client n8n bundle (optional)     | `deploy/quadlets/n8n.container`, `deploy/quadlets/n8n.volume`, `scripts/enable-n8n.sh`                                                                                                                                                                                                                                             | `docs/automations/n8n-workflow-contract.md`, `docs/operations/architecture.md`                                                                        | `bun run n8n:enable` (idempotent provisioner); editor lockdown via Caddy snippet                        |
| Observability and operations         | `src/routes/+error.svelte`, `src/routes/healthz/+server.ts`, `src/routes/readyz/+server.ts`, `src/lib/server/logger.ts`, `src/lib/server/request-id.ts`, `src/lib/server/safe-error.ts`                                                                                                                                            | `docs/observability/`, `ADR-016`                                                                                                                      | e2e health checks, unit tests                                                                           |
| Optional modules                     | `docs/modules/`, dormant privacy components, optional provider seams                                                                                                                                                                                                                                                               | `docs/modules/README.md`, `ADR-020`                                                                                                                   | Module-specific activation docs; no baseline runtime cost                                               |
| Agent operating rules                | `AGENTS.md`, `CLAUDE.md.template`, `CLAUDE.example.md`                                                                                                                                                                                                                                                                             | `AGENTS.md`, `CLAUDE.md.template`, design-system LLM docs                                                                                             | Human review plus validation commands                                                                   |

## Planning Files That Can Go

Safe first archive/delete candidates:

- `docs/planning/13-bootstrap-contract-phases/`
- `docs/planning/Do-this-next.md`
- `docs/planning/maintainer-context.md`

Likely safe after v1/history review:

- `docs/planning/07-template-repo-spec.md`
- `docs/planning/08-quality-gates.md`
- `docs/planning/09-maintenance-loop.md`
- `docs/planning/10-build-decision-ledger.md`
- `docs/planning/13-bootstrap-contract-project.md`

Keep by default:

- `docs/planning/adrs/`
- `docs/planning/00-vision.md`
- `docs/planning/01-principles.md`
- `docs/planning/02-scope-and-non-goals.md`
- `docs/planning/03-stack-decisions.md`
- `docs/planning/11-template-build-backlog.md` until v1 tagging history is no longer useful
- `docs/planning/12-post-v1-roadmap.md` if you want a future-ideas backlog

Before deleting, run an inbound-link check:

```bash
rg 'planning/(FILENAME|DIRECTORY)' .
```

Then either update links to permanent docs or delete the stale references in the
same change.
