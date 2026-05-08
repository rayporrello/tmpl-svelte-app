# Post-v1 Roadmap

This file is the parking lot for everything that goes **beyond the website-only baseline**. Each topic gets its own dedicated thread (and usually its own ADR) before any code lands. The goal is one focused decision per thread — defer or scope — so the template grows deliberately rather than accidentally.

Items here are **not** required to tag v1.0.0. The v1.0.0 readiness list lives at the top of [11-template-build-backlog.md](11-template-build-backlog.md). This roadmap captures what comes after — and what was deliberately considered but punted.

---

## How to use this file

When picking up one of these topics in a new thread:

1. Re-read the entry below to recover prior context.
2. Decide: **scope it** (write an ADR, build it, mark dormant or active) or **defer it** (write a "Rejected for v1" ADR explaining why).
3. Either way, the result is an ADR in `docs/planning/adrs/` and an update here (move from "open" to "decided" with a link).
4. If scoping into the template, add a backlog row to `11-template-build-backlog.md`.

Empty ADRs are forbidden — if a topic isn't worth writing 3 paragraphs of rationale on, it isn't worth a decision yet.

---

## Open topics (each needs a dedicated thread)

### Reliability triggers

These stay deferred until real client usage says otherwise. Revisit after two
or three more launched client sites, or sooner if one of these frictions repeats
in production:

| Topic                                               | Current decision                                             | Trigger to scope                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **Auto-rollback on smoke failure**                  | Deferred by ADR-028; smoke prints failures for the operator. | Operators repeatedly run manual rollback immediately after deploy smoke fails, with no diagnosis needed. |
| **Fleet view**                                      | Delivered as a platform-infrastructure concern by ADR-031.   | Platform repo owns cross-client worker, migration, backup, restore, and dead-letter views.               |
| **`deploy:apply` plan/apply split**                 | Deferred by ADR-028; one command owns deploy orchestration.  | Deploy approvals need a durable dry-run artifact, or CI/CD wants separate planning and execution steps.  |
| **Dedicated backup channel in website health view** | Removed from the website repo by ADR-031.                    | Platform repo owns backup and restore health; website health stays web-service focused.                  |

### Application-shape topics

| Topic                                  | Why it matters                                                                                                                    | First question to settle                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Better Auth**                        | Gated content, member areas, admin dashboards. Only needed when a project goes beyond a marketing site.                           | Wait until a project needs auth, then scope.                                                          |
| **i18n / localisation**                | Marketing sites often need multi-locale; structurally hard to retrofit. Even an explicit "English-only" decision is worth an ADR. | `@inlang/paraglide-sveltekit` as dormant module, or hard "no" with rationale?                         |
| **Newsletter subscription pattern**    | Mirror of contact form — same Superforms + EmailProvider + rate-limit shape. One more dormant route at `/subscribe-example`.      | Provider (Buttondown vs Resend vs ConvertKit) — does the template pick one or stay provider-agnostic? |
| **Site search**                        | `/articles` has no search. Pagefind is build-time and tiny.                                                                       | Pagefind as dormant, or punt entirely until a project asks?                                           |
| **Per-article OG image generation**    | Currently one static `og-default.png`. Per-article previews dramatically improve link-share CTR.                                  | Build-time (Satori prerender) vs runtime route (`@vercel/og`-style). Build-time fits adapter-bun.     |
| **Page archetypes / examples gallery** | `/styleguide` shows tokens and primitives. No example "About" / "Pricing" / "Blog post" pages to copy from.                       | Optional `examples/` route group, or separate template?                                               |
| **Edge image storage (R2 tier)**       | ADR-009 calls Tier 3 "optional" but never implements. Worth a documented activation recipe.                                       | Stays optional — what's the recipe?                                                                   |

### Quality / observability topics

| Topic                               | Why it matters                                                                                               | First question to settle                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| **Lighthouse CI gate**              | Catches perf regressions before merge. Currently deferred per YAGNI — homepage ships <50KB JS.               | Re-evaluate when a regression makes CI gating worth it. Budgets: Perf ≥ 90 mobile, others ≥ 95.      |
| **Analytics / RUM**                 | Cloudflare Web Analytics is wired (sanity layer). Per-route LCP/INP/CLS dashboards are not.                  | Plausible vs Umami vs PostHog vs nothing-by-default. Self-hosted matches the template's posture.     |
| **Cookie consent / privacy banner** | `ConsentBanner` ships dormant. Decide whether to wire by default for analytics-enabled deploys.              | Auto-import in root layout when `PUBLIC_ANALYTICS_ENABLED=true`, or stay per-project responsibility? |
| **Visual regression testing**       | Catches CSS/design drift. Playwright is already in the stack — `toHaveScreenshot()` is one config flag away. | Where do baselines live (in-repo vs external)? Acceptable diff threshold?                            |
| **PWA / service worker**            | ADR-020 already says "no by default." Worth revisiting if a project needs offline read.                      | Confirm the "no" stays, or scope a minimal opt-in module.                                            |

---

## Decided (closed)

- **Phase 5 — runtime data** — Postgres + Drizzle + `/readyz` + typed automation outbox (`enqueueLeadCreated` / compatibility alias `emitLeadCreated`) + HMAC signing + `automation_dead_letters` all shipped. See [11-template-build-backlog.md](11-template-build-backlog.md) Phase 5 section.
- **Shared infrastructure cell** — accepted in [ADR-031](adrs/ADR-031-shared-infrastructure-cell.md). Fleet view, production DB provisioning, backups, restore, and worker operations are platform repo responsibilities.
- **PWA / service worker (no by default)** — [ADR-020](adrs/ADR-020-pwa-no-by-default.md). Manifest + icons stay; no service worker.
- **Production hardening (audit pass)** — DB pool config, SIGTERM wrapper (`serve.js`), HSTS dual-write, contact form honeypot, Speculation Rules, `bun audit` advisory step, Caddy rate-limit snippet docs. Recorded in PR #11; see ADR-018 §"Graceful shutdown" and ADR-019 §"App vs edge header ownership".

---

## Rejected / out of scope

These came up during planning and were explicitly pushed out. Captured here so they don't get re-litigated without a triggering reason.

- **Tailwind / shadcn / Flowbite** — see [02-scope-and-non-goals.md](02-scope-and-non-goals.md) and [ADR-005](adrs/ADR-005-css-token-architecture.md).
- **SQLite as default data path** — see [ADR-004](adrs/ADR-004-postgres-for-runtime-data.md).
- **Kubernetes / multi-server orchestration** — see [02-scope-and-non-goals.md](02-scope-and-non-goals.md).
- **Managed cloud database as default** — see [02-scope-and-non-goals.md](02-scope-and-non-goals.md) and [ADR-007](adrs/ADR-007-podman-caddy-infrastructure.md).
- **Formsnap** — Superforms is the standard; see [02-scope-and-non-goals.md](02-scope-and-non-goals.md).
