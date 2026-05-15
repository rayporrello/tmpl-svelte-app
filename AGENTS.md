# AGENTS.md — tmpl-svelte-app

Operating rules for AI agents (Claude, Codex, Cursor, etc.) working in this repository. Read this before making any changes.

This file has two jobs:

1. Preserve Ray's two-repo website launch/deploy process.
2. Preserve this template's SvelteKit, design-system, content, forms, SEO, analytics, and local-development rules.

The launch scripts and runbooks are part of the product. Do not optimize them away.

---

## Website Fleet Operating Contract

This repository participates in Ray's SvelteKit website fleet. AI agents must preserve the established two-repo architecture, launch process, deploy process, migration gate, secrets flow, Caddy/loopback routing, and backup/restore boundaries.

### Prime directive

Help build, validate, launch, and maintain websites without bypassing repo-defined processes.

When a request touches production, secrets, databases, migrations, Caddy, Podman, Quadlet, systemd, DNS, Postmark, backups, restore, launch/deploy state, or client registry state:

1. Identify the repo and task class.
2. Read the relevant docs/runbooks/scripts before acting.
3. Use the established command surface.
4. Stop at gates.
5. Never improvise around safety checks.
6. Never hide uncertainty.

If the user asks for a shortcut that conflicts with the process, explain the conflict and offer the safe runbook path.

### Repo identification

Before making changes or running meaningful commands, identify the current repo:

```bash
pwd
git rev-parse --show-toplevel
git status --short
cat package.json 2>/dev/null | head
```

Classify as one of:

- `website-repo`: this repo, `tmpl-svelte-app`, or a client clone.
- `platform-repo`: `web-data-platform`.
- `unknown`: stop and inspect README/docs before acting.

Never assume a website repo and the platform repo are the same project.

### Architecture invariants

Website repos own:

- SvelteKit application code, content, forms, design system, SEO/site code.
- Drizzle schema and Drizzle migration files.
- The website web image.
- The website web Quadlet.
- Local bootstrap/dev database flow.

`web-data-platform` owns:

- `web-platform.network`.
- Shared Postgres cluster.
- One production database and one production role set per client.
- Client provisioning and production env rendering.
- Fleet migrations and the migration gate.
- Fleet worker.
- Production secrets.
- Backups, restore/PITR drills, client exports, and scratch restores.
- Caddy site block rendering/includes.
- Launch checklist state and production data operations.

Do not move platform responsibilities into website repos. Do not reintroduce per-site production Postgres, production worker daemon, production backup/PITR, restore, or site-local production network artifacts into website repos.

### Runtime model

Local development and production are intentionally different.

Local website development:

```bash
./bootstrap
bun run dev
```

`./bootstrap` provisions a per-clone local Postgres container, writes local `.env`, applies migrations, and verifies DB health. Local database commands are allowed only against local `.env`:

```bash
bun run db:generate
bun run db:migrate
bun run db:check
bun run automation:worker
bun run validate
```

Production website containers:

- Run as Podman containers managed by user systemd/Quadlet.
- Join `web-platform.network`.
- Connect to Postgres at `web-platform-postgres:5432`.
- Use one database and one role per client.
- Publish loopback-only web ports.
- Receive public traffic only through host Caddy.

Host Caddy proxies:

```text
public domain -> Caddy :443 -> 127.0.0.1:<loopbackPort> -> website container :3000
```

Do not expose Postgres publicly. Do not expose website containers directly as the public front door when Caddy/loopback is the contract.

### Task classification

Before acting, classify the request as exactly one of:

- `docs-only`
- `local-website-development`
- `local-schema-development`
- `production-launch-groundwork`
- `production-deploy`
- `migration/fleet-migration`
- `caddy-dns-postmark-manual-integration`
- `secrets-credentials`
- `backup-restore-export`
- `incident-recovery`
- `unclear`

If unclear, inspect docs and ask for the minimum missing information before risky action.

### Approval/risk tiers

Tier 0 — read-only. Allowed without special approval:

- Inspect files, docs, package scripts, and git status.
- Inspect non-secret logs when requested.
- Search with `rg`.
- Explain architecture.

Tier 1 — local/non-production. Allowed after explaining local scope:

- Edit website source/content/styles/tests.
- Run `bun install --frozen-lockfile`.
- Run `./bootstrap`.
- Run `bun run dev`.
- Run `bun run validate`.
- Run local `db:generate`, `db:migrate`, `db:check`.
- Run local one-shot automation worker.

Never point local dev at production Postgres.

Tier 2 — production-affecting, standard runbook. Allowed only when the user explicitly requests production work and required details are known:

- Platform `bun run web:check`.
- Platform `bun run launch:site`.
- Platform `bun run launch:checklist`.
- Platform `bun run web:render-client-env`.
- Platform `bun run web:render-cluster-env`.
- Platform `bun run web:test-contact-delivery`.
- Website `bun run launch:deploy`.
- Caddy validate/reload.
- Named systemd status/restart.
- Fleet worker status checks.

Before Tier 2 actions, confirm repo path, client slug, production domain, image name/SHA when deploying, `WEB_DATA_PLATFORM_PATH`, safety mode, and relevant runbook section.

Tier 3 — high-risk/destructive/exception. Do not run unless the user explicitly asks in this session and the relevant runbook has been read:

- Delete a database, role, volume, container, network, backup, dump, or env file.
- Direct production SQL.
- PITR restore or client restore.
- Client export containing PII.
- Secret/password rotation.
- Manual edit to rendered production env.
- Manual edit to generated Quadlet/runtime files.
- Manual edit to active `clients.json`.
- `--skip-migration-gate`.
- `--safety=rollback-blocked`.
- Direct `deploy:apply` instead of `launch:deploy`.
- Direct `web:provision-client` instead of `launch:site`.
- Changing Drizzle migration history, journal, or applied migration hashes.
- Caddy reload without `caddy validate`.

For Tier 3, provide the risk, exact command, expected result, safe stop point, rollback/recovery reference, and what will not be done.

### Task class operating matrix

| Class                                   | Repo to operate from                                                                         | Normal commands                                                                                                                      | Forbidden without explicit approval                                                                                  | Read first                                                                                                           | Success looks like                                                                                          | If a gate fails                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `docs-only`                             | Current repo, plus sibling repo only if requested                                            | `rg`, `sed`, `git diff`, docs edits, light docs validation if available                                                              | Production commands, runtime config edits, secrets edits                                                             | README, documentation map, relevant runbooks/docs                                                                    | Docs/policy updated with no app/runtime/deploy behavior change                                              | Stop, preserve diff, report discrepancy                                       |
| `local-website-development`             | Website repo                                                                                 | `./bootstrap`, `bun run dev`, `bun run validate`, focused checks from package scripts                                                | Production env/render/deploy commands, pointing local at production                                                  | README, this file, relevant design/content/forms docs                                                                | Local site works and validation relevant to change passes                                                   | Stop at failing local check and summarize                                     |
| `local-schema-development`              | Website repo                                                                                 | `bun run db:generate`, `bun run db:migrate`, `bun run db:check`, `bun run forms:check`                                               | Running website `db:migrate` against production, editing Drizzle journal to hide drift                               | `docs/database/README.md`, forms docs if relevant                                                                    | Schema and migration files are consistent locally                                                           | Stop; do not bypass or rewrite migration history                              |
| `production-launch-groundwork`          | `~/web-data-platform`                                                                        | `bun install --frozen-lockfile`, `bun run web:check`, `bun run launch:site -- ...`, `bun run launch:checklist -- --client=<slug>`    | Direct `web:provision-client`, hand edits to generated runtime files, marking manual items done without verification | Platform `docs/runbooks/launch-new-site.md`, platform provisioning runbook, `docs/operations/connect-to-platform.md` | Client registered, env/Caddy/Quadlet rendered/installed, checklist initialized, client inactive until ready | Stop at the failed step; use checklist as resume cursor                       |
| `production-deploy`                     | Website repo                                                                                 | `bun run launch:check`, `bun run deploy:preflight`, `WEB_DATA_PLATFORM_PATH=... bun run launch:deploy -- ... --safety=rollback-safe` | Direct `deploy:apply`, `--skip-migration-gate`, `--safety=rollback-blocked`, claiming success without smoke          | `docs/deployment/runbook.md`, `docs/deployment/README.md`, platform launch/contact runbooks                          | Checklist, migration gate, readiness, smoke, and contact-delivery checks pass or limitations are explicit   | Stop; preserve non-secret logs; do not bypass                                 |
| `migration/fleet-migration`             | Website repo for files; platform repo for production apply/status                            | Local: `bun run db:check`; production gate: platform `bun run web:fleet-migration-status -- --client=<slug> --repo=<website-root>`   | Website `db:migrate` against production, changing applied hashes, editing journal to hide drift                      | `docs/database/README.md`, platform fleet migration runbook                                                          | Drift-free status or applied migrations in journal order after backup/advisory-lock checks                  | Stop and report drift/failure; use recovery runbook only after reconciliation |
| `caddy-dns-postmark-manual-integration` | Mostly `~/web-data-platform`; external provider UIs are manual                               | Platform `launch:checklist`, `web:render-caddy-sites`, `web:render-client-env`, `web:render-cluster-env`, `caddy validate`           | Caddy reload without validate, divergent hand-written Caddy, checklist completion without external verification      | Platform launch/provisioning/contact-delivery runbooks, `docs/operations/connect-to-platform.md`                     | DNS/Postmark/provider items verified, rendered files updated, Caddy validated                               | Stop; state which external condition is missing                               |
| `secrets-credentials`                   | `~/web-data-platform` for production secrets; website repo only for dev/example env metadata | Platform `sops secrets.yaml`, render env commands, secret-shape checks; website `bun run secrets:check`                              | Printing secrets, committing env/dumps/keys, rotating passwords without explicit request                             | `docs/deployment/secrets.md`, platform SOPS/provisioning runbooks                                                    | Encrypted source updated, renderers/checks pass, no secret material printed                                 | Stop; do not paste secret output                                              |
| `backup-restore-export`                 | `~/web-data-platform`                                                                        | `bun run web:cluster-backup-verify -- --latest`, documented export/restore/PITR commands when explicitly requested                   | Deletes, restore/PITR, export of PII, scratch teardown beyond runbook                                                | Platform backup verify, PITR drill, client export, client restore runbooks                                           | Backup/export/restore command reaches documented expected outcome                                           | Stop; use recovery shim; treat artifacts as sensitive                         |
| `incident-recovery`                     | Affected repo, usually platform for shared infrastructure                                    | Named `systemctl --user status`, `journalctl --user -u ... -n 120 --no-pager`, runbook recovery scripts                              | Random command retries, destructive cleanup, bypassing gates                                                         | Runbook index, affected runbook, recent command output                                                               | Failure bounded, non-secret evidence captured, next safe runbook identified                                 | Stop at first failing gate and report safe next step                          |
| `unclear`                               | Read-only in current repo                                                                    | `pwd`, `git status`, `rg`, docs/package inspection                                                                                   | Any write or production command                                                                                      | README, package scripts, docs map/runbook index                                                                      | Task reclassified or user asked for missing details                                                         | Stop before risky action                                                      |

### Normal workflows

Website local development:

```bash
./bootstrap
bun run dev
bun run validate
bun run launch:check
bun run deploy:preflight
```

First launch:

1. From website repo: initialize/check `site.project.json` as documented.
2. From `~/web-data-platform`: run `bun run web:check`.
3. From `~/web-data-platform`: run `bun run launch:site -- --slug=<slug> --repo=<website-root> --domain=<domain> ...`.
4. Complete manual DNS/Postmark/provider checklist items.
5. Install/render/validate Caddy according to the runbook.
6. From website repo: export `WEB_DATA_PLATFORM_PATH`.
7. Run `bun run launch:deploy -- --client=<slug> --image=<ghcr-image> --sha=<sha> --safety=rollback-safe`.
8. Activate operations only when outbox tables and provider config are ready.
9. Verify fleet worker status and contact delivery.

Subsequent deploy:

1. Build/push image.
2. Confirm image SHA.
3. Run website preflight.
4. Run website `launch:deploy`.
5. Let the migration gate run.
6. Wait for `/readyz`.
7. Run/confirm smoke and contact-delivery check.
8. Summarize exact commands and results.

Do not claim success if any gate failed.

### Hard never rules

- Never invent a launch/deploy sequence.
- Never bypass platform scripts to simplify production.
- Never run website `db:migrate` against production.
- Never point production `DATABASE_URL` at local Postgres.
- Never point local dev at production Postgres.
- Never expose Postgres publicly.
- Never publish a website container directly to `0.0.0.0` for public traffic when Caddy/loopback is the contract.
- Never add per-site production Postgres/worker/backup/network artifacts back to website repos.
- Never put production provider secrets in website repos.
- Never commit `.env`, rendered `.prod.env`, secrets, dumps, or keys.
- Never edit Drizzle migration journal to hide drift.
- Never mark checklist items done unless the real external condition is verified.
- Never treat green local dev as proof of production readiness.
- Never tell the user a production deploy succeeded unless readiness, smoke, and contact-delivery checks are green or the limitation is explicitly stated.

### Generated files and lower-level commands

Prefer render/provision commands over hand edits. If generated output is wrong, fix the source registry/secrets/renderer, then regenerate.

These commands and flags may exist but are not the normal happy path:

- `deploy:apply`
- `web:provision-client`
- `--skip-migration-gate`
- Direct systemd/Podman edits.
- Direct production SQL.

Use them only for documented repairs or approved exceptions.

### When uncertain or blocked

Use `rg`, `find`, `package.json`, README, docs, and runbooks to locate the current contract. If docs and code disagree, stop and report the discrepancy. If a command is missing, stop and report; do not invent a substitute.

If the task touches production and required details are missing, ask for the missing slug/domain/repo/image/safety details before acting. If a gate fails, stop at the gate, preserve non-secret logs, summarize the failure, and point to the relevant recovery runbook.

### Diff review and definition of done

Before final response or PR summary:

```bash
git status --short
git diff --stat
git diff
```

Look for forbidden changes: secrets/env/dumps/keys committed, production credentials printed, per-site production Postgres/worker/backup/network artifacts added, Caddy changed by hand when renderer should own it, Drizzle journal edited suspiciously, migration history rewritten, production commands run without explicit request, or lockfile from the wrong package manager.

Every final response must include repo identified, task class, files changed, commands run, validation result, production impact, gates passed or not run, known risks, and the next safe action.

If validation was not run, say why. If production was touched, state exactly what changed. If a gate failed, state that the task stopped at the gate.

---

## Where production lives

This repo owns the SvelteKit website template and local development workflow. Production Postgres, fleet automation workers, backups, restores, and rendered production secrets live in the separate `web-data-platform` repo. Website clones join the shared website data `web-platform.network` and receive production env files rendered by that repo.

---

## Source of truth order

For launch, deploy, production data, secrets, Caddy, migrations, backups, restore, and fleet-worker work, use this authority order — top wins:

1. **User's explicit task**, unless unsafe or contradictory to a hard guardrail.
2. **`AGENTS.md`** (this file).
3. **Platform and website runbooks**, especially `web-data-platform/docs/runbooks/launch-new-site.md` and this repo's `docs/operations/connect-to-platform.md`.
4. **`package.json` scripts and script behavior**.
5. **Accepted ADRs and architecture docs**.

For application/design implementation conflicts, use this authority order:

1. **Files under `src/`** — the implementation is truth.
2. **`AGENTS.md`** (this file) and **`CLAUDE.md`** (project copy).
3. **`docs/design-system/`** — real design system documentation.
4. **Accepted ADRs in `docs/planning/adrs/`**.
5. **Other planning docs** — historical context only; do not use to override implemented files.

**Do not use stale planning notes to override implemented CSS architecture, bypass launch/deploy runbooks, or resurrect abandoned dependencies.**

---

## CSS / design-system rules

The full rule set is in [docs/design-system/llm-css-rules.md](docs/design-system/llm-css-rules.md). Key points:

### Always

- Reference semantic tokens (`var(--surface-raised)`, `var(--text-primary)`) — never raw brand primitives or hardcoded values
- Use `color-mix(in oklch, color X%, transparent)` for translucent surfaces — never `opacity` on surfaces
- Use logical properties: `padding-inline`, `border-block-start`, `margin-inline-start`
- Use `gap` for spacing between flex/grid children; `margin-block` only in `.flow` prose contexts
- Use `min-height: 44px` on interactive form controls
- Keep `@layer` order: `reset, tokens, base, utilities, components`
- Add new semantic tokens to `tokens.css` before using a value in component CSS

### Never

- `html, body { overflow: hidden }` — this is a website template; scrolling is the default
- `maximum-scale=1` or `user-scalable=0` in `app.html` — fails WCAG 1.4.4
- Raw color values (oklch/hex/hsl/rgb) in component CSS
- Hardcoded spacing except `1px` borders and `2px` outlines
- Tailwind, shadcn, or any pre-built component library
- A new `@layer` declaration without also updating `app.css`

### Opacity

Opacity is **allowed** for whole-element fades, skeleton/pulse animations, and disabled controls (dimming the whole element including its children is intentional).

Opacity is **not allowed** for translucent backgrounds, borders, overlays, or glass effects — use `color-mix()`.

---

## HTML + CSS generation contract

Before generating any UI markup or components, read:

- `docs/design-system/llm-html-rules.md` — mandatory HTML rules and forbidden patterns
- `docs/design-system/llm-css-rules.md` — mandatory CSS rules
- `docs/design-system/semantic-html-guide.md` — full reference with pre-generation checklist

### Non-negotiable HTML rules

- Use `Section.svelte` (at `src/lib/components/Section.svelte`) for all thematic page sections
- Use the most specific semantic element available — `<article>`, `<nav>`, `<aside>`, `<time>`, `<figure>`, etc.
- Do not generate div-heavy markup when a semantic element exists
- The page `<main id="main-content">` lives in `+layout.svelte` — never add a second `<main>`
- One `<h1>` per page — always the page title, never the site name in the header
- Meaningful images use `<figure><img alt="..."></figure>`, not CSS `background-image`
- Dates use `<time datetime="...">`, not `<span>`
- Links navigate (`<a href>`); actions fire (`<button type="button">`)

### Non-negotiable CSS rules

- Inspect `docs/design-system/` before writing CSS or components
- Reference semantic tokens — never raw brand primitives or hardcoded values
- Do not create new one-off CSS when an existing token, utility, or component covers it
- Component scoped `<style>` blocks are allowed for component-specific layout/appearance — they must consume tokens
- Do not use Tailwind, shadcn, or any pre-built component library
- Do not use component-scoped CSS to bypass the global design system
- Run the pre-generation checklist in `llm-html-rules.md` before finalizing output

---

## What agents may edit

| Target                               | What to do                                              |
| ------------------------------------ | ------------------------------------------------------- |
| `tokens.css`                         | Edit freely for brand customization                     |
| `site.project.json`                  | Project identity/source manifest for generated files    |
| `src/lib/config/site.ts`             | Generated from manifest; review or add non-owned fields |
| `src/lib/seo/routes.ts`              | Add new routes; set `indexable` correctly               |
| `src/lib/analytics/events.ts`        | Add new typed event names and helpers                   |
| `src/lib/analytics/consent.ts`       | Wire consent state to a project's consent UI            |
| `src/lib/server/analytics/events.ts` | Activate a real provider via `setAnalyticsProvider()`   |
| Component `<style>` blocks           | Write component-specific styles here                    |
| Brand sections in architecture files | Add after the `BRAND-SPECIFIC` marker comment           |
| `+layout.svelte`                     | Add global layout wrapper, header, footer               |
| `app.html`                           | Update title, `theme-color` hex, favicon                |

## What agents must NOT edit

| Target                                                                  | Reason                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------ |
| `reset.css`                                                             | Universal — editing breaks all projects                |
| `base.css`                                                              | Element defaults — extend via components               |
| Architecture sections of `utilities.css`, `animations.css`, `forms.css` | Shared across projects — editing breaks all            |
| Layer order in `app.css`                                                | Must stay `reset, tokens, base, utilities, components` |

---

## Images

Full reference and quickstart: [docs/design-system/images.md](docs/design-system/images.md)  
HTML markup rules: [docs/design-system/llm-html-rules.md](docs/design-system/llm-html-rules.md) → Image rules section

### When you are about to write image markup — follow this workflow

**Step 1 — Ask: is this image's path known at build time?**

| Answer                                                         | Folder            | Component        |
| -------------------------------------------------------------- | ----------------- | ---------------- |
| **Yes** — file committed to repo, referenced in code           | `src/lib/assets/` | `<enhanced:img>` |
| **No** — path is a runtime string from CMS, DB, or user upload | `static/uploads/` | `<CmsImage>`     |

Default to `src/lib/assets/` + `<enhanced:img>` unless there is a clear runtime-path reason for `CmsImage`. The distinction is not "developer vs editor" — it is build-time vs runtime. If unclear, ask before writing markup.

**Step 2 — Always include these three things:**

- `alt` — describe what is in the image; `alt=""` for decorative
- `width` — display width in CSS pixels (not the source file size)
- `height` — display height in CSS pixels

Use standard dimensions from `docs/design-system/images.md`. For Tier 1 (`<enhanced:img>`), `width`/`height` should match the source file — the plugin generates srcset from there. For Tier 2 (`CmsImage`), use the display size.

| Use case          | Source file | `width` attr | `height` attr |
| ----------------- | ----------- | ------------ | ------------- |
| Hero / full-bleed | 2560 × 1280 | 1920         | 960           |
| Section feature   | 1920 × 1080 | 1600         | 900           |
| Article featured  | 1200 × 630  | 1200         | 630           |
| Card (2–3/row)    | 1200 × 675  | 800          | 450           |
| Team headshot     | 600 × 600   | 400          | 400           |

Add `sizes="100vw"` to any full-bleed image.

If the image does not match a standard slot, ask the user for the display dimensions or use the closest standard as a placeholder and flag it. Never omit `width` and `height`.

**Step 3 — Ask: is this the hero or the first large visible image on load?**

If yes: add `loading="eager" fetchpriority="high"`.  
If no: do nothing — `loading="lazy"` is the default in both components.

**Step 4 — Wrap in `<figure>` if the image is meaningful content.**

Decorative images (`alt=""`) do not need a `<figure>`.

### What the pipeline provides automatically

- `<enhanced:img>` → AVIF + WebP + `<picture>` + responsive srcset (Vite plugin)
- `<CmsImage>` → WebP + `<picture>` with original fallback (Sharp prebuild)
- Both default to `loading="lazy"`

You do not need to write `<picture>`, `<source>`, or format-specific markup. The components handle it.

### Never

- Do not use plain `<img>` for brand or CMS images
- Do not put CMS uploads in `src/` — `<enhanced:img>` cannot process `static/` files
- Do not add `loading="lazy"` to a hero or LCP image
- Do not use `background-image` for meaningful content images
- Do not use GIF — use CSS animation or `<video autoplay loop muted playsinline>`
- Do not add R2 or Cloudflare Image Resizing to the base template

---

## Typography

Full reference: [docs/design-system/typography.md](docs/design-system/typography.md)

### Always

- Reference `var(--font-sans)` and `var(--font-mono)` in CSS — never hardcode font names
- Import Fontsource fonts once globally in `src/app.css` — never in components
- Use Fontsource variable packages (`@fontsource-variable/*`) for open-source fonts
- Place paid/proprietary fonts in `static/fonts/` as `.woff2` and declare `@font-face` in `tokens.css`

### Never

- Do not add `<link rel="preload">` for Fontsource fonts — hashed filenames become stale across updates
- Do not use a Google Fonts CDN `<link>` — adds CDN dependency and GDPR risk
- Do not hardcode font family names in component CSS — use `var(--font-sans)` / `var(--font-mono)`
- Do not import Fontsource in a component — one global import in `app.css` only
- Do not keep `woff`, `ttf`, or `eot` fallback formats — modern browsers use `woff2` only

---

## Forms rules

**`forms.css`** owns visual styling: field layout, control appearance, states, messages.

**Superforms** is the standard form behavior library and is already installed in this template.

Superforms owns: validation, data binding, submission, progressive enhancement, server errors, constraint API.

Business-form architecture is documented in `docs/forms/README.md`. For any form that captures a lead or starts a workflow, use a form-specific source table plus the shared automation outbox. Add the form to `src/lib/server/forms/registry.ts`, add any outbox event handler to `src/lib/server/automation/registry.ts`, and run `bun run forms:check`.

For a new typed starter form, prefer `bun run scaffold:form -- --slug=<form-id>` and then edit the generated source. The scaffold uses the generic `business_form.submitted` outbox event, writes source-controlled files, and prints `bun run db:generate` as the migration step. Inspect runtime records with `bun run forms:ops`; it redacts PII by default.

Do not:

- Add form validation logic to `forms.css` or any CSS file
- Build a custom form submission handler — use Superforms server actions
- Add Formsnap (Superforms direct is the standard)
- Duplicate Superforms behavior in CSS or Svelte components

All form controls must support `aria-invalid`, `data-invalid`, `:disabled`, visible `:focus-visible`, help text (`.field-help`), and error text (`.field-error`).

---

## Analytics rules

Full reference: [docs/analytics/README.md](docs/analytics/README.md)  
Event taxonomy: [docs/analytics/event-taxonomy.md](docs/analytics/event-taxonomy.md)  
Server conversions: [docs/analytics/server-conversions.md](docs/analytics/server-conversions.md)

### Always

- Add new analytics events to `docs/analytics/event-taxonomy.md` and `src/lib/analytics/events.ts` before using them in code
- Fire server conversion events ONLY after successful validation and primary operation (email sent, DB insert, webhook fired)
- Use `trackCtaClick()`, `trackOutboundLink()`, and other helpers from `src/lib/analytics/events.ts` — do not push to `window.dataLayer` directly
- Run `bun run check:analytics` before deploying

### Never

- Do not add a direct `gtag.js` GA4 snippet when GTM is active — GA4 is configured inside GTM
- Do not send PII (names, emails, phone numbers, raw message content) to any analytics event or parameter
- Do not track every click by default — use event helpers deliberately on meaningful interactions
- Do not enable analytics in staging/preview/dev without `PUBLIC_ANALYTICS_STAGING_OVERRIDE=true`
- Do not let analytics failures break user-facing form submissions — use `emitServerAnalyticsEvent()` which catches and logs failures
- Do not use Cloudflare Web Analytics as your ad attribution or conversion tracking source
- Do not use GA4 Measurement Protocol as a replacement for browser GTM/GA4 collection
- Do not add server-side GTM, Meta CAPI, LinkedIn CAPI, or Google Ads enhanced conversions to the base template — these are paid-acquisition upgrade paths documented in `docs/analytics/paid-ads-upgrade.md`
- Do not add Search Console verification as runtime code — it belongs in `site.ts` (HTML tag) or DNS (preferred) as a launch/onboarding task
- Do not commit real GTM IDs, GA4 IDs, or Cloudflare tokens to the template — use placeholder comments in `.env.example` only

---

## Privacy and retention rules

Full reference: [docs/privacy/data-retention.md](docs/privacy/data-retention.md)

### Always

- Keep retention defaults in `src/lib/server/privacy/retention.ts` and update the privacy docs in the same change
- Run `bun run privacy:prune` as a dry-run before using `bun run privacy:prune -- --apply`
- Coordinate production pruning with the web-data-platform repo's backup/maintenance window
- Keep `automation_dead_letters` free of full webhook payloads; store only event type, nullable event reference, error text, and timestamps

### Never

- Do not store names, emails, message bodies, or raw webhook payloads in `automation_dead_letters`
- Do not auto-run pruning from app startup, public endpoints, or request handlers
- Do not delete pending/processing automation events unless an operator passes `--include-stale-pending-days=N`

---

## SEO rules

Full reference: [docs/seo/README.md](docs/seo/README.md)  
Page contract: [docs/seo/page-contract.md](docs/seo/page-contract.md)  
Schema guide: [docs/seo/schema-guide.md](docs/seo/schema-guide.md)

### Always

- Add every SvelteKit route to `src/lib/seo/route-policy.ts` with one of: `indexable`, `noindex`, `private`, `api`, `feed`, `health`, `ignored`
- Add public page routes to `src/lib/seo/routes.ts` and declare `indexable: true` or `false`
- Add the `SEO` component to every new `+page.svelte` with `title`, `description`, and `canonicalPath`
- Use root `site.project.json` as the project contract; `site.ts` is generated from it for SEO runtime config
- Use schema helpers from `src/lib/seo/schemas.ts` — never write raw JSON-LD by hand
- Add schema only when the visible page content supports it (article schema on articles, FAQ schema on FAQ pages)
- Run `bun run project:check`, `bun run routes:check`, and `bun run check:seo` before deploying

### Never

- Do not create a public page without `title`, `description`, `canonicalPath`, route policy coverage, and a route registry entry
- Do not hardcode `yourdomain.com`, `example.com`, or site name strings inside SEO components or schemas
- Do not mark `/styleguide`, `/admin`, `/preview`, or draft-like routes as `indexable: true`
- Do not use `$page.url.href` as the canonical URL — it leaks dev/staging URLs into production metadata
- Do not duplicate `Organization` or `WebSite` schema in individual page components — it is injected by the root layout

---

## Security headers policy

Decision: [ADR-019](docs/planning/adrs/ADR-019-security-headers-and-csp-baseline.md)

### Header ownership split

| Header                      | Owner          | Where set                                                                                                                       |
| --------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `Content-Security-Policy`   | **App**        | `src/lib/server/csp.ts` via `hooks.server.ts`                                                                                   |
| `X-Content-Type-Options`    | **App**        | `src/hooks.server.ts`                                                                                                           |
| `Referrer-Policy`           | **App**        | `src/hooks.server.ts`                                                                                                           |
| `X-Frame-Options`           | **App**        | `src/hooks.server.ts`                                                                                                           |
| `Permissions-Policy`        | **App**        | `src/hooks.server.ts`                                                                                                           |
| `Strict-Transport-Security` | **Edge + App** | `deploy/Caddyfile.example` (canonical) and `src/hooks.server.ts` (defense-in-depth, gated on `event.url.protocol === 'https:'`) |

HSTS is dual-written so the header is preserved if the app is ever deployed behind a non-Caddy proxy (Cloudflare Tunnel, Fly proxy, etc.). Both copies use identical max-age/includeSubDomains/preload values; Caddy's wins on the wire when both are present. Do NOT set compression or access logging headers in the app — those remain Caddy-only.

### CSP extension points

To widen a CSP directive for a new project feature, edit `src/lib/server/csp.ts`. Do NOT add directives inline in `hooks.server.ts`. Each extension point has a comment in `csp.ts`:

| Feature                      | Directive                   | Edit                         |
| ---------------------------- | --------------------------- | ---------------------------- |
| Analytics (Plausible, Umami) | `connect-src`, `script-src` | Add host to respective array |
| CMS media CDN                | `img-src`                   | Add CDN origin               |
| Email/form endpoint          | `form-action`               | Add host                     |
| n8n webhook                  | `connect-src`               | Add host                     |
| Embedded video (YouTube)     | `frame-src`                 | Add host                     |

The `/admin` route already has a more permissive policy (allows `https://unpkg.com` for Sveltia CMS). Do not copy-paste the admin exceptions to other routes.

---

## Environment variable policy

Decision: [ADR-018](docs/planning/adrs/ADR-018-production-runtime-and-deployment-contract.md), implemented in Batch B.

### Import paths

| Path               | Use for                            | Security                                               |
| ------------------ | ---------------------------------- | ------------------------------------------------------ |
| `$lib/env/public`  | ORIGIN, PUBLIC_SITE_URL            | Server-side only (transitively imports `$lib/server/`) |
| `$lib/env/private` | DATABASE_URL, SESSION_SECRET, etc. | Server-side only                                       |

Never import env vars directly from `process.env` in application code — use the typed exports from `$lib/env/public` or `$lib/env/private`.

### When adding a new environment variable

1. Add the Valibot schema field in `src/lib/server/env.ts`
2. If required for production, add to `REQUIRED_PUBLIC_ENV_VARS` or `REQUIRED_PRIVATE_ENV_VARS`
3. Update `.env.example` and `deploy/env.example`
4. Update `secrets.example.yaml` if it's a secret value

### Build and CI note

`bun run build` does not require runtime env vars during SvelteKit prerendering; `hooks.server.ts` skips `initEnv()` while `building` is true. Runtime requests still require `ORIGIN`, `PUBLIC_SITE_URL`, and `DATABASE_URL`, so local development should copy `.env.example` to `.env` or render one from SOPS before using DB-backed routes.

---

## Secrets handling

Full guide: [docs/deployment/secrets.md](docs/deployment/secrets.md)  
Decision: [ADR-013](docs/planning/adrs/ADR-013-sops-age-secrets-management.md)

### Always

- Keep real secret values in encrypted `secrets.yaml` — this is the source of truth.
- Add every new required environment variable to both `.env.example` and `secrets.example.yaml` at the same time.
- Use `sops secrets.yaml` to open, edit, and re-encrypt atomically — never edit the encrypted blob by hand.
- Treat rendered `.env` files as credential files — they are plaintext and must not be shared or committed.
- Before completing deployment-related changes, run `bun run secrets:check`.

### Never

- Never commit `.env` or any `.env.*` file except `.env.example`.
- Never commit plaintext `secrets.yaml` (without SOPS metadata). Verify encryption before committing.
- Never put real secret values in `src/lib/config/site.ts` or any module that can be imported by client-side code.
- Never import `DATABASE_URL`, `SESSION_SECRET`, API tokens, or other private secrets into `+page.svelte` or any `src/lib/` file that reaches the browser bundle.
- Never add OpenBao, Doppler, Infisical, 1Password Secrets Automation, cloud KMS, or other secret manager integrations to the template. Per-project adoptions are out of scope here and must be explicitly requested.
- Never manually decrypt `secrets.yaml` and re-encrypt it — use `sops secrets.yaml` for the full round-trip.
- Never put public-safe config (brand name, public site URL, public analytics IDs) in `secrets.yaml` — only encrypt values that are genuinely secret.

### When adding a new environment variable

Update all three of:

1. `.env.example` — add the variable name with an empty or example value
2. `secrets.example.yaml` — add the variable with a representative fake value
3. `docs/deployment/secrets.md` — add to the "What belongs in secrets" section if it is a new category

---

## Template type

**Website-first.** This template targets scrolling websites and landing pages — not dashboard applications. Normal document scrolling is the default. Do not add app-shell behaviors to the baseline.

---

## Git and build artifact policy

This repo is **Bun-first**. All package management, scripts, and tooling use Bun.

### Package management

- Install with `bun install` — never `npm install`, `npm ci`, `pnpm install`, or `yarn install`.
- Add packages with `bun add <pkg>` — never `npm install <pkg>`.
- Run scripts with `bun run <script>` — never `npm run`.
- `bun.lock` (text lockfile) **must be committed**. It is the source of truth for exact dependency versions.
- `bun.lockb` (binary lockfile, legacy) is gitignored and must never be committed.
- Never bump protected package versions (`svelte`, `@sveltejs/kit`, `vite`, `svelte-adapter-bun`, `better-auth`, etc.) without explicit approval.
- Bun uses `"resolutions"` (Yarn syntax), not `"overrides"` (silently ignored by Bun).

### Never commit these

| Path                                                                                   | Reason                                                                   |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `node_modules/`                                                                        | Installed from `bun.lock`; never source-controlled                       |
| `.svelte-kit/`                                                                         | Generated on `bun run dev` or `svelte-kit sync`; never source-controlled |
| `build/`                                                                               | Production bundle output; regenerated on every deploy                    |
| `dist/`                                                                                | Alternative build output; same policy                                    |
| `.env`, `.env.*`                                                                       | Local secrets — use `.env.example` for safe defaults                     |
| `bun.lockb`                                                                            | Legacy binary lockfile; this repo uses `bun.lock`                        |
| `static/uploads/optimized/`, `static/uploads/responsive/`, `static/uploads/generated/` | Potential generated output dirs — ignore if created                      |

### Image artifacts — special case

The prebuild script (`scripts/optimize-images.js`) generates `.webp` siblings next to source images in `static/uploads/`. Per [ADR-009](docs/planning/adrs/ADR-009-image-pipeline.md) and [docs/design-system/images.md](docs/design-system/images.md):

- **Source images** (`*.jpg`, `*.png`, `*.tiff`) in `static/uploads/` **may be committed** when they are intentional seed/demo assets.
- **Generated `.webp` siblings** in `static/uploads/` **are also committed** alongside their sources. This allows the site to function without a prebuild step on every checkout.
- Do not gitignore `*.webp` files in `static/uploads/`.
- `src/lib/assets/` images (Tier 1) are always committed — they are developer-owned source files.

### Validation commands

Run these before finalizing any template change:

```bash
bun install --frozen-lockfile   # verify lockfile is clean
bun run format:check            # Prettier drift
bun run check                   # TypeScript + svelte-check
bun run check:bootstrap         # bootstrap dry-run + mock-provisioner harness
bun run secrets:check           # plaintext secret guard
bun run project:check           # site.project.json + generated-file drift
bun run routes:check            # explicit route policy coverage
bun run forms:check             # business form registry + outbox references
bun run check:seo               # SEO config validation
bun run check:analytics         # analytics config validation (GTM format, staging isolation)
bun run check:cms               # CMS config validation
bun run check:content           # content file validation
bun run check:assets            # favicon / OG / webmanifest validation
bun run check:security-headers  # app security header policy validation
bun run check:accessibility     # source-level accessibility guardrails
bun run check:design-system     # design-system guardrail validation
bun run check:performance       # built bundle/static asset performance budgets
bun run images:optimize         # prebuild image pipeline (idempotent)
bun run build                   # production build
bun run test                    # Vitest unit tests
```

Or run the listener-free local gate: `bun run validate` / `bun run validate:core`.
CI runs `bun run validate:ci`, which adds built Playwright, axe, and visual smoke tests. Release-grade checks also run `bun run check:init-site`, `bun run check:launch`, and `bun run check:content-diff`. Deployment readiness is explicit: run `bun run deploy:preflight` before installing units and `bun run deploy:smoke -- --url https://your-domain.example` after deploy.

---

## File structure

```
src/
  app.css           entry file — layer order, font imports, design system imports
  app.html          HTML shell — title, viewport, theme-color, anti-FOUC script
  app.d.ts          SvelteKit type augmentation — App.Locals (requestId, etc.)
  hooks.server.ts   env init, request ID injection, CSP, security headers, centralized error handling
  lib/
    analytics/
      config.ts             reads PUBLIC_* env vars; buildAnalyticsConfig factory
      events.ts             typed browser event names and push helpers (trackCtaClick, etc.)
      browser.ts            window.dataLayer initializer
      pageview.ts           SvelteKit SPA page_view tracking via afterNavigate
      attribution.client.ts first-touch UTM/click ID capture and localStorage storage
      consent.ts            Consent Mode v2 types and dataLayer helpers
    config/
      site.ts       generated SEO/site config derived from site.project.json
    observability/
      types.ts      ObservabilityTier, LogLevel, HealthResponse, WorkflowEventPayload
    server/
      automation/
        events.ts       enqueue minimized outbox rows
        envelopes.ts    outbox payload + provider envelope builders
        registry.ts     worker delivery handler registry
        signing.ts      HMAC signing
      analytics/
        types.ts                          ServerAnalyticsProvider interface and event types
        events.ts                         emitServerAnalyticsEvent() — wraps provider with failure guard
        noop-provider.ts                  default no-op provider
        ga4-measurement-protocol.example.ts  dormant GA4 MP provider (example/upgrade path)
      logger.ts     structured JSON logger with redaction — use instead of console.error
      request-id.ts read/generate request ID from x-request-id header
      safe-error.ts normalize thrown errors; split public message from diagnostic detail
      db/
        schema.ts   contact_submissions, automation_events, automation_dead_letters
        health.ts   injectable Postgres readiness probe
      forms/
        registry.ts business form registry
        providers/  console + Postmark email providers
      privacy/
        retention.ts data retention defaults
    seo/
      types.ts      SEO TypeScript types
      metadata.ts   canonical URL, image URL, title, robots helpers
      schemas.ts    JSON-LD schema helpers
      routes.ts     public page route registry
      route-policy.ts full SvelteKit route policy coverage
      public-routes.ts sitemap/feed route merge helpers
      feed.ts       RSS feed generator
      sitemap.ts    sitemap XML generator
    styles/
      tokens.css    BRAND FILE — edit to rebrand
      reset.css     architecture — DO NOT EDIT
      base.css      architecture — DO NOT EDIT
      animations.css  architecture — add brand motion below marker
      utilities.css   architecture — add brand utilities below marker
      forms.css       architecture — add brand form overrides below marker
    components/
      analytics/
        AnalyticsHead.svelte  GTM head snippet + Cloudflare Web Analytics (disabled by default)
        AnalyticsBody.svelte  GTM noscript fallback
      seo/
        SEO.svelte  renders all head/meta/schema for a page
  routes/
    +error.svelte           friendly accessible error page
    +layout.svelte          imports app.css, injects root schema + analytics components
    contact/+page.svelte    live Superforms contact form
    articles/+page.svelte   articles index
    articles/[slug]/+page.svelte article detail
    healthz/+server.ts      process liveness check — returns JSON
    readyz/+server.ts       Postgres readiness check — returns 200/503
    sitemap.xml/+server.ts  prerendered sitemap
    rss.xml/+server.ts      prerendered RSS feed
    robots.txt/+server.ts   prerendered robots.txt
    llms.txt/+server.ts     prerendered llms.txt
    styleguide/+page.svelte design system demo — keep updated
scripts/
  bootstrap.ts          local setup orchestrator
  doctor.ts             read-only diagnostic
  automation-worker.ts  one-shot local-dev outbox delivery worker
  check-analytics.ts    validate analytics config (GTM format, docs exist, staging isolation)
  check-cms-config.ts   validate static/admin/config.yml
  validate-content.ts   validate Markdown/YAML files under content/
  check-content-diff.ts detect destructive content changes in git diff
```

---

## CMS / content loading

Full reference: [docs/cms/README.md](docs/cms/README.md)  
Content contract: [docs/cms/sveltia-content-contract.md](docs/cms/sveltia-content-contract.md)  
Collection patterns: [docs/cms/collection-patterns.md](docs/cms/collection-patterns.md)  
AI reference policy: [docs/cms/sveltia-ai-reference.md](docs/cms/sveltia-ai-reference.md)

### Sveltia CMS AI reference

When editing `static/admin/config.yml`, fetch Sveltia's official AI-readable docs — do not rely on Netlify CMS, Decap CMS, or Static CMS examples:

- **Quick reference:** `https://sveltiacms.app/llms.txt` — use for most config edits
- **Full reference:** `https://sveltiacms.app/llms-full.txt` — fetch only for complex config (nested objects, custom widgets, i18n). It is very large; avoid fetching unnecessarily.

Do not download or commit either file to this repo. Sveltia labels them work-in-progress; when a reference conflicts with a working collection in `config.yml`, trust the working config. Always validate after editing:

```bash
bun run check:cms && bun run check:content && bun run check:content-diff
```

Then load `/admin` in a browser to confirm the affected collection loads without error.

**Note on two different llms.txt files:** `https://sveltiacms.app/llms.txt` documents the CMS tool for AI agents. `src/routes/llms.txt/+server.ts` is the generated site's own public AI/SEO disclosure for crawlers. These are unrelated and must not be conflated.

### Parser rules — never mix these

Shared content schemas live in `src/lib/content/schemas.ts`. Loaders and `bun run check:content` must validate parsed content with those schemas; TypeScript content types are derived from them via `src/lib/content/types.ts`.

| File type                    | Parser          | Location                       |
| ---------------------------- | --------------- | ------------------------------ |
| `content/pages/*.yml`        | **js-yaml**     | Pure YAML, no `---` delimiters |
| `content/team/*.yml`         | **js-yaml**     | Pure YAML                      |
| `content/testimonials/*.yml` | **js-yaml**     | Pure YAML                      |
| `content/articles/*.md`      | **gray-matter** | Markdown with YAML frontmatter |

```ts
// ✓ Correct — pure YAML
import { parse } from 'js-yaml';
const data = parse(readFileSync(path, 'utf-8'));

// ✓ Correct — Markdown frontmatter
import matter from 'gray-matter';
const { data, content } = matter(raw);
return { ...data, body: content }; // remap content → body explicitly

// ✗ Wrong — never use gray-matter for pure YAML files
// ✗ Wrong — never use js-yaml for Markdown frontmatter files
```

### File-reading routes

Always use `+page.server.ts` for filesystem reads — never `+page.ts`:

```ts
// ✓ src/routes/+page.server.ts
import { loadHomePage } from '$lib/content/index';
export const load = async () => ({ home: loadHomePage() });
```

### CMS image fields

Render CMS image path strings through `CmsImage`, not bare `<img>`:

```svelte
<!-- ✓ -->
<CmsImage src={member.photo} alt={member.photo_alt ?? ''} width={400} height={400} />

<!-- ✗ -->
<img src={member.photo} alt={member.photo_alt} />
```

### CMS field naming rules

- Use `snake_case` for all YAML field names
- Do not use `content` or `data` as field names — they clash with loader conventions
- `body` is reserved for the Markdown body in articles
- Field names in `config.yml` = `src/lib/content/schemas.ts` schema keys = TypeScript properties = Svelte component data keys
- **Never rename a CMS field** without also updating: `config.yml`, content files, `types.ts`, loaders, components, and docs

### Sveltia CMS admin entrypoint

`static/admin/index.html` must load Sveltia CMS with a plain script tag in `<body>`:

```html
<script src="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js"></script>
```

**Do not add a stylesheet link** — Sveltia CMS bundles its required styles in the JavaScript file:

```html
<!-- ✗ Wrong — do not add this -->
<link rel="stylesheet" href="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.css" />
```

**Do not add `type="module"`** — the Sveltia CMS browser bundle is not an ES module:

```html
<!-- ✗ Wrong -->
<script src="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js" type="module"></script>

<!-- ✓ Correct -->
<script src="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js"></script>
```

These mistakes come from confusing Sveltia CMS with Static CMS or Netlify CMS patterns. Do not copy those examples here.

---

### Adding a new collection

All six steps are required — partial completion breaks the content contract:

1. Create a starter content file in `content/{collection}/`
2. Add or update the Valibot schema in `src/lib/content/schemas.ts`
3. Add to `static/admin/config.yml`
4. Add loader and export from `src/lib/content/index.ts`
5. Wire to `+page.server.ts` route; register in `src/lib/seo/routes.ts`
6. Update `docs/cms/collection-patterns.md`

---

## Observability and error-handling rules

1. Do not log secrets, tokens, cookies, authorization headers, private keys, or raw sensitive form payloads.
2. Use the shared server logger (`src/lib/server/logger.ts`) for server-side errors instead of ad hoc `console.error` calls.
3. Preserve or create a request ID for server-side request handling where practical — use `getOrCreateRequestId` from `src/lib/server/request-id.ts`.
4. User-facing errors must be safe, calm, and non-diagnostic — use `toSafeError` from `src/lib/server/safe-error.ts`.
5. Do not add Sentry, OpenTelemetry, Grafana, Prometheus, Loki, or other observability dependencies without explicit approval.
6. Do not extend `/readyz` with fake checks; only add checks for real required runtime dependencies.
7. When adding an automation-triggered feature, document provider, payload shape, retry behavior, failure behavior, and idempotency key.
8. Automation workflows that mutate data or send external messages must have finite retry behavior and a manual recovery path.
9. Do not implement "self-healing" behavior that mutates production data without explicit approval.

See [docs/observability/README.md](docs/observability/README.md) for the baseline behavior, optional extensions, and the full set of rules.

---

## Sveltia CMS content safety rules

When editing or creating Sveltia CMS config or content:

1. Do not use `toml-frontmatter` for Sveltia-managed Markdown collections unless the user explicitly approves it.
2. Prefer `frontmatter` (YAML) format with `.md` files.
3. Do not create optional `datetime` fields by default. If needed, add the field name to `OPTIONAL_DATETIME_ALLOWLIST` in `scripts/check-cms-config.ts` and document why.
4. Required date fields must use ISO 8601 datetime values with timezone, for example `2026-04-27T12:00:00Z`.
5. Optional date-like fields should be omitted when empty. Do not save them as `""`, `null`, `"null"`, or `"undefined"`.
6. Do not rely on the CMS UI as the source of truth for date validity. The repo validation scripts are authoritative.
7. Never rewrite existing frontmatter wholesale unless the task explicitly requires a migration.
8. Preserve existing valid frontmatter values when adding fields.
9. Do not change content field names casually; field renames require a migration plan (all 7 steps in `docs/cms/sveltia-guide.md`).
10. After changing `static/admin/config.yml` or files under `content/` or `src/content/`, run:
    ```bash
    bun run check:cms
    bun run check:content
    bun run check:content-diff
    ```
    then the normal project validation command.
11. If a content diff blanks required fields, removes large portions of body content, or changes many content files unexpectedly, stop and report it as a blocker.

See [docs/cms/content-safety.md](docs/cms/content-safety.md) and [docs/cms/sveltia-guide.md](docs/cms/sveltia-guide.md).

---

## Automation provider posture

Full reference: [docs/automations/README.md](docs/automations/README.md)

### Hard rules

- **Do not add n8n to `package.json`** — n8n is the default external operator, not an app dependency
- **Do not import n8n packages** in any SvelteKit module
- **The site must work without an automation receiver** — HTTP providers with no URL must skip cleanly
- **Do not call webhook providers from user-facing actions** — insert an outbox row in the same DB transaction as the primary record; production delivery is handled by the platform fleet worker
- **Content automation files must match the CMS schema** — follow `static/admin/config.yml`; do not invent fields
- **AI-generated content defaults to draft** — `draft: true` for articles, `published: false` for testimonials
- **Do not commit webhook URLs or secrets** — use `.env.example` for variable names only; real values go in `secrets.yaml`
- **Production HTTP webhooks must be signed** — HMAC-SHA256 in `X-Webhook-Signature`

### Two automation categories

```
Content automations → automation provider writes to content/ via GitHub API
	Runtime automations → SvelteKit server action → Postgres outbox → platform fleet worker → provider delivery
```

Content automation writes must pass the same schema validation as a human Sveltia CMS edit. They are not a separate path.

---

## Runtime data

- Postgres is the runtime data store — not SQLite, not flat files in `content/`
- `content/` is for durable editorial content only (committed to Git, version-controlled)
- Operational data (form submissions, user accounts, session state) belongs in Postgres
- Do not introduce SQLite

---

## Before shipping

Verify against [docs/planning/08-quality-gates.md](docs/planning/08-quality-gates.md):

- `bun run build` exits 0
- `bun run check` (TypeScript) exits 0
- No `html, body { overflow: hidden }` in the baseline
- No disabled user zoom in `app.html`
- Styleguide route renders all design system primitives without errors
- All form controls pass the forms gates
- CMS fields in `config.yml` match `types.ts` interfaces
- No n8n package in `package.json`
- Local-dev automation provider vars remain documented in `.env.example`; production provider config is shared website data
