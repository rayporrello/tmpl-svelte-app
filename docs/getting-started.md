# Getting Started

Step-by-step guide for turning `tmpl-svelte-app` into a production site.

---

## Prerequisites

- **Bun** ≥ 1.1 installed (`bun --version`)
- **Git** and a GitHub account (the CMS uses GitHub as its backend)
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
nine files at once. Run it once per project and commit the result.

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

Verify no placeholder values remain:

```bash
bun run check:seo   # fails loudly on placeholder strings
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

## Step 10 — Activate dormant modules (only when needed)

| Module             | How to activate                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contact form       | Rename `src/routes/contact-example/` → `src/routes/contact/`; install an email provider (see [docs/design-system/forms-guide.md](design-system/forms-guide.md)) |
| Postgres + Drizzle | Add `DATABASE_URL` to `.env`; create a schema file                                                                                                              |
| n8n webhooks       | Add `N8N_WEBHOOK_URL` + `N8N_WEBHOOK_SECRET` env vars                                                                                                           |
| Postmark email     | Copy `src/lib/server/forms/providers/postmark.example.ts` → `postmark.ts`; add `POSTMARK_SERVER_TOKEN` (matches `.env.example`)                                 |
| Better Auth        | Follow the auth module docs                                                                                                                                     |

---

## Step 11 — Deploy

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
     <your-project>:local
   # visit http://127.0.0.1:3000/healthz — should return 200
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
