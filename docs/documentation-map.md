# Documentation Map And Audit

Last audited: 2026-05-13

This file maps implemented systems to the docs that should be kept current.
Planning notes are historical unless an accepted ADR says otherwise.

## Authority Order

1. `src/`, `scripts/`, root config, and CI files
2. `AGENTS.md` and `CLAUDE.md.template`
3. Permanent docs under `docs/`
4. Accepted ADRs under `docs/planning/adrs/`
5. Other planning files

## Durable Decisions

Keep accepted ADRs through `ADR-031`. `ADR-022` and `ADR-023` are withdrawn
tombstones retained for history. `ADR-026` was already withdrawn.

## System Coverage

| System             | Implementation                                                                                               | Primary Docs                                                                                               | Validation                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Local bootstrap    | `bootstrap`, `scripts/bootstrap.ts`, `scripts/lib/postgres-dev.ts`                                           | `docs/getting-started.md`, `ADR-021`                                                                       | `bun run check:bootstrap`, unit tests              |
| Project manifest   | `site.project.json`, `scripts/init-site.ts`, `scripts/lib/site-project.ts`                                   | `docs/getting-started.md`                                                                                  | `bun run project:check`, `bun run check:init-site` |
| SvelteKit site     | `src/routes/`, `src/hooks.server.ts`, `src/app.css`                                                          | `README.md`, `docs/seo/`, `docs/design-system/`                                                            | `bun run check`, e2e                               |
| Postgres + Drizzle | `src/lib/server/db/`, `drizzle/`, `drizzle.config.ts`                                                        | `docs/database/README.md`, `ADR-031`                                                                       | `bun run check:db`, unit tests                     |
| Business forms     | `src/routes/contact/`, `src/lib/forms/`, `scripts/scaffold-form.ts`                                          | `docs/forms/README.md`                                                                                     | `bun run forms:check`                              |
| Runtime outbox     | `src/lib/server/automation/`, `scripts/automation-worker.ts`                                                 | `docs/automations/README.md`                                                                               | automation unit tests                              |
| Deployment         | `Containerfile`, `serve.js`, `deploy/quadlets/web.container`, `scripts/launch-deploy.ts`, `scripts/deploy-*` | `docs/deployment/`, `docs/operations/connect-to-platform.md`, `docs/operations/deploy-apply.md`, `ADR-028` | deploy/preflight/smoke tests                       |
| Secrets            | `src/lib/server/env.ts`, `.env.example`, `deploy/env.example`, `secrets.example.yaml`                        | `docs/deployment/secrets.md`, `ADR-013`, `ADR-031`                                                         | `bun run secrets:check`, env tests                 |
| Health             | `scripts/lib/health-engine.ts`, `/healthz`, `/readyz`, `/admin/health`                                       | `docs/operations/health.md`, `ADR-030`                                                                     | health unit tests                                  |
| Ops ledger         | `scripts/lib/ops-status.ts`, `scripts/lib/release-state.ts`                                                  | `docs/operations/ops-status-ledger.md`, `ADR-025`                                                          | ops-status tests                                   |

## Moved Out

Production Postgres, worker daemon, backup/PITR, restore, and platform network
docs now belong in `web-data-platform`.

Historical planning directories such as `docs/planning/passes/` and
`docs/planning/13-bootstrap-contract-phases/` are not current implementation
guides. Their shared-infrastructure redirect notes point at ADR-031.
