# Getting Started

Step-by-step guide for turning `tmpl-svelte-app` into a production site.

---

## Prerequisites

- **Bun** ≥ 1.1 installed (`bun --version`)
- **Git** and a GitHub account (the CMS uses GitHub as its backend)
- **Postgres** — a running instance for local development (local install, Docker, or Podman)
- A Linux host running Podman + Caddy for deployment (see [docs/deployment/README.md](deployment/README.md))

---

## Step 1 — Create your repo from the template

1. On GitHub, click **Use this template → Create a new repository**.
2. Clone your new repo locally:
   ```bash
   git clone git@github.com:<you>/<your-project>.git
   cd <your-project>
   bun install
   ```
3. Verify the scaffold works:
   ```bash
   bun run dev       # starts at http://127.0.0.1:5173
   bun run validate  # full PR-grade pipeline: typecheck, SEO/CMS/content/asset checks, build, unit + e2e tests
   ```
   `bun run validate` is the green-light check before any commit. It must succeed locally before pushing.

---

## Step 2 — Copy CLAUDE.md.template → CLAUDE.md

```bash
cp CLAUDE.md.template CLAUDE.md
```

Fill in every `[PLACEHOLDER]` in `CLAUDE.md`. This file governs how AI coding
agents behave in the project — fill it in before inviting any AI assistant.

---

## Step 3 — Run init:site

`init:site` is an interactive script that rewrites placeholder values across
ten files at once. Run it once per project and commit the result.

```bash
bun run init:site
```

It prompts for:

- **Project name** — used in `package.json`, `README.md`, and `site.webmanifest`
- **Site domain** — the production `https://` URL (used in CSP, sitemap, robots)
- **Site title** and **description** — the default SEO metadata
- **Organisation name** — used in JSON-LD schemas
- **GitHub repo** — `owner/repo` format (used by Sveltia CMS backend)
- **Contact email** — shown on error pages
- **Deployment hostname** — your server's hostname (used in Caddyfile and Quadlets)

Re-running `init:site` with the same answers is safe — it converges without duplicating content.

---

## Step 4 — Edit site.ts

Open [src/lib/config/site.ts](../src/lib/config/site.ts) and replace any
remaining placeholder values that `init:site` does not cover (OG image path,
social handles, locale, etc.).

Verify SEO structure, then run the launch check before shipping:

```bash
bun run check:seo
bun run check:launch   # fails loudly on launch-blocking placeholders
```

---

## Step 5 — Edit tokens.css with brand colors, fonts, and shape

Open [src/lib/styles/tokens.css](../src/lib/styles/tokens.css) and replace
the brand primitives in section 1:

```css
--brand-dark: oklch(…); /* primary dark surface / dark-mode background */
--brand-light: oklch(…); /* primary light surface / light-mode background */
--brand-accent: oklch(…); /* CTAs, links, focus rings */
```

Update fonts in section 5 and the `@import` lines in `src/app.css` to match.

See [src/lib/styles/brand.example.css](../src/lib/styles/brand.example.css) for a
fully annotated "Warm Coral" re-skin showing exactly which values to swap.
See [docs/design-system/tokens-guide.md](design-system/tokens-guide.md) for the
complete token reference and the swap checklist.

---

## Step 6 — Update app.html

In [src/app.html](../src/app.html) replace:

- The `<title>` tag with your site name (the SEO component overrides this per-page,
  but it is the fallback for `<noscript>` crawlers)
- The `theme-color` meta hex value with your brand accent color
- The favicon `href` if you replace the default SVG at `static/favicon.svg`

---

## Step 7 — Register routes in routes.ts

Every URL the site will serve must be registered in
[src/lib/seo/routes.ts](../src/lib/seo/routes.ts) with `indexable: true` or
`indexable: false`. The sitemap only includes `indexable: true` routes;
`robots.txt` and `llms.txt` derive from the same registry.

---

## Step 8 — Update static/admin/config.yml

Sveltia CMS needs to know which GitHub repo to write to. Open
[static/admin/config.yml](../static/admin/config.yml) and set:

```yaml
backend:
  repo: <owner>/<repo>
  branch: main
```

---

## Step 9 — Edit content/pages/home.yml

Replace the sample homepage content in [content/pages/home.yml](../content/pages/home.yml)
with real copy. The home route loads this file at build time — no database needed.

---

## Step 10 — Set up the database

`DATABASE_URL` is required. The app will not start without it.

1. **Create a local Postgres database:**

   ```bash
   createdb site_db
   createuser site_user --pwprompt
   psql site_db -c "GRANT ALL ON DATABASE site_db TO site_user;"
   psql site_db -c "GRANT ALL ON SCHEMA public TO site_user;"
   ```

2. **Set `DATABASE_URL` in your environment:**
   - SOPS workflow (recommended): add to `secrets.yaml`, then `bun run secrets:render`
   - Direct `.env` workflow: copy `.env.example` to `.env` and fill in `DATABASE_URL`

3. **Run migrations:**

   ```bash
   bun run db:migrate
   ```

   This applies the starter schema (`contact_submissions`, `automation_events`, `automation_dead_letters`).

4. **Verify:**
   ```bash
   curl http://127.0.0.1:3000/readyz   # after starting the dev server
   ```
   Should return `{"ok": true, "checks": {"database": {"ok": true}}, ...}`.

See [docs/database/README.md](database/README.md) for the full setup guide, scripts reference, and production checklist.

---

## Step 11 — Configure optional modules

The full optional module registry is at **[docs/modules/README.md](modules/README.md)**. Every module is dormant by default — no runtime cost unless activated.

The contact form works immediately — it saves to Postgres, logs emails to stdout, and skips n8n gracefully. Configure the modules below to extend it.

| Module                    | How to activate                                                                                                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contact form**          | Already live at `/contact`. Saves to `contact_submissions` automatically. See [docs/design-system/forms-guide.md](design-system/forms-guide.md).                                                                 |
| **Real email (Postmark)** | Set `POSTMARK_SERVER_TOKEN`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL` in env. `resolveEmailProvider()` picks it up automatically — no code change needed.                                                        |
| **n8n webhooks**          | Set `N8N_WEBHOOK_URL` + `N8N_WEBHOOK_SECRET`. The contact form emits signed `lead.created` events. Failed deliveries are dead-lettered. See [docs/automations/README.md](automations/README.md).                 |
| **Rate limiting**         | Set `RATE_LIMIT_ENABLED=true`. In-process only; replace with Redis-backed limiter for multi-instance deployments.                                                                                                |
| **Analytics**             | Set `PUBLIC_ANALYTICS_ENABLED=true`, `PUBLIC_GTM_ID=GTM-XXXXXXX` in production env. See [docs/analytics/README.md](analytics/README.md).                                                                         |
| **Cookie consent**        | Import `ConsentBanner.svelte` from `src/lib/privacy/` into root layout. Required when using GTM/GA4/ad tags with EU or CCPA-jurisdiction users. See [docs/modules/cookie-consent.md](modules/cookie-consent.md). |
| **Better Auth**           | Per-project only — not in base template. See [docs/modules/better-auth.md](modules/better-auth.md).                                                                                                              |
| **Search (Pagefind)**     | Install `pagefind`, pre-render content routes, add `/search` route. See [docs/modules/pagefind.md](modules/pagefind.md).                                                                                         |

---

## Step 12 — Deploy

1. Build and verify locally:
   ```bash
   bun run validate          # PR-grade: typecheck, SEO/CMS/content/assets, build, unit + e2e
   bun run validate:launch   # release-grade: validate + check:launch + check:content-diff
   ```
2. Build the container image:
   ```bash
   podman build -t <your-project>:local .
   podman run --rm -p 3000:3000 \
     -e PORT=3000 -e HOST=0.0.0.0 \
     -e ORIGIN=http://127.0.0.1:3000 \
     -e PUBLIC_SITE_URL=http://127.0.0.1:3000 \
     -e DATABASE_URL=postgres://site_user:yourpassword@host.containers.internal:5432/site_db \
     <your-project>:local
   # visit http://127.0.0.1:3000/healthz — process check, should return 200
   # visit http://127.0.0.1:3000/readyz  — DB connectivity check, should return 200
   ```
3. Follow the full deployment runbook: [docs/deployment/runbook.md](deployment/runbook.md)
4. CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) runs `validate` on every push, builds the image, runs Trivy with CRITICAL gating, smoke-tests the running container, and pushes to GHCR on `main`. `validate:launch` is gated on tags.

---

## Pre-launch checklist

Before going live, run the launch-grade validator:

```bash
bun run validate:launch
```

This includes `check:launch` which verifies the production URL is a real
HTTPS domain (not `localhost`, not a placeholder string).

See [docs/seo/launch-checklist.md](seo/launch-checklist.md) for the complete
pre-launch checklist covering SEO, a11y, images, and performance.
