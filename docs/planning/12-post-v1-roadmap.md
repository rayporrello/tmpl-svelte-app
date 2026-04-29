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

### Tightly tied to Phase 5 (runtime data)

| Topic                      | Why it matters                                                                                          | First question to settle                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Phase 5 — runtime data** | Postgres + Drizzle + `/readyz` + automation event emitter + HMAC signing + dead-letter table            | Which project triggers it? (Don't build it speculatively.) See `docs/automations/runtime-event-contract.md`. |
| **Better Auth**            | Gated content, member areas, admin dashboards. Only needed when a project goes beyond a marketing site. | Same trigger question as Phase 5 — wait until a project needs auth, then scope.                              |

### Independent of Phase 5 (can land any time)

| Topic                                  | Why it matters                                                                                                                    | First question to settle                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Lighthouse CI gate**                 | Replaces the honor-system perf gates in `08-quality-gates.md`. Catches perf regressions before merge.                             | What budgets? (Perf ≥ 90 mobile is the existing target; a11y/SEO/best-practices ≥ 95 is typical.)     |
| **Backup automation**                  | `static/uploads/` is the only mutable file state today. Without scheduled off-host backups it's a single-disk-failure risk.       | Storage target (R2 vs B2 vs S3), schedule (nightly is standard), monitor (Healthchecks.io vs n8n).    |
| **i18n / localisation**                | Marketing sites often need multi-locale; structurally hard to retrofit. Even an explicit "English-only" decision is worth an ADR. | `@inlang/paraglide-sveltekit` as dormant module, or hard "no" with rationale?                         |
| **Analytics / RUM**                    | Every site needs _something_. Template ships nothing today.                                                                       | Plausible vs Umami vs PostHog vs nothing-by-default. Self-hosted matches the template's posture.      |
| **Cookie consent / privacy banner**    | EU/GDPR exposure is real for any public site.                                                                                     | Dormant module (which library?) or explicit per-project responsibility?                               |
| **Newsletter subscription pattern**    | Mirror of contact form — same Superforms + EmailProvider + rate-limit shape. One more dormant route at `/subscribe-example`.      | Provider (Buttondown vs Resend vs ConvertKit) — does the template pick one or stay provider-agnostic? |
| **Site search**                        | `/articles` has no search. Pagefind is build-time and tiny.                                                                       | Pagefind as dormant, or punt entirely until a project asks?                                           |
| **Per-article OG image generation**    | Currently one static `og-default.png`. Per-article previews dramatically improve link-share CTR.                                  | Build-time (Satori prerender) vs runtime route (`@vercel/og`-style). Build-time fits adapter-bun.     |
| **Visual regression testing**          | Catches CSS/design drift. Playwright is already in the stack — `toHaveScreenshot()` is one config flag away.                      | Where do baselines live (in-repo vs external)? Acceptable diff threshold?                             |
| **Page archetypes / examples gallery** | `/styleguide` shows tokens and primitives. No example "About" / "Pricing" / "Blog post" pages to copy from.                       | Optional `examples/` route group, or separate template?                                               |
| **Edge image storage (R2 tier)**       | ADR-009 calls Tier 3 "optional" but never implements. Worth a documented activation recipe.                                       | Stays optional — what's the recipe?                                                                   |
| **PWA / service worker**               | `site.webmanifest` ships; no service worker. Worth an explicit "no, not by default" ADR.                                          | Confirm the "no" or scope a minimal opt-in.                                                           |

---

## Decided (closed)

_(Move topics here as ADRs land. Format: `- **Topic** — [ADR-NNN](adrs/ADR-NNN-...md) — one-line outcome`)_

_Empty for now._

---

## Rejected / out of scope

These came up during planning and were explicitly pushed out. Captured here so they don't get re-litigated without a triggering reason.

- **Tailwind / shadcn / Flowbite** — see [02-scope-and-non-goals.md](02-scope-and-non-goals.md) and [ADR-005](adrs/ADR-005-css-token-architecture.md).
- **SQLite as default data path** — see [ADR-004](adrs/ADR-004-postgres-for-runtime-data.md).
- **Kubernetes / multi-server orchestration** — see [02-scope-and-non-goals.md](02-scope-and-non-goals.md).
- **Managed cloud database as default** — see [02-scope-and-non-goals.md](02-scope-and-non-goals.md) and [ADR-007](adrs/ADR-007-podman-caddy-infrastructure.md).
- **Formsnap** — Superforms is the standard; see [02-scope-and-non-goals.md](02-scope-and-non-goals.md).
