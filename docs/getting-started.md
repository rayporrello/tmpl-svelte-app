# Getting Started

The fast path:

```bash
git clone git@github.com:<you>/<your-project>.git
cd <your-project>
./bootstrap
bun run dev
```

That gets you a working local site with Postgres, migrations applied, `.env`
populated, and the contact form live. Edit `src/lib/styles/tokens.css` for brand
colors and `content/pages/home.yml` for homepage content; both changes hot-reload.

Before launch:

```bash
bun run launch:check   # release-grade pre-deploy gate
bun run deploy:preflight # structural deploy readiness after init/env rendering
```

If you want to understand each step or override what bootstrap does, the manual
path follows below.

---

## Manual setup (advanced)

Step-by-step guide for turning `tmpl-svelte-app` into a production site.

---

## Prerequisites

- **Bun** in the range `>=1.3.13 <1.4.0` installed (`bun --version`). The exact pin lives in `package.json` (`packageManager: bun@1.3.13`); the `preinstall` guard rejects mismatches with a clear error code.
- **Git** and a GitHub account (the CMS uses GitHub as its backend)
- **Podman** for local Postgres bootstrap and production containers
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
   bun run dev            # starts at http://127.0.0.1:5173
   bun run validate:core  # local-safe pipeline: format/type/bootstrap/secret/config checks, build, unit tests
   ```
   `bun run validate` is an alias of `validate:core` and is the green-light
   check before any commit. CI runs `bun run validate:ci`, which adds built
   Playwright e2e, axe accessibility, and visual smoke checks.

---

## Step 2 — Copy CLAUDE.md.template → CLAUDE.md

```bash
cp CLAUDE.md.template CLAUDE.md
```

Fill in every `[PLACEHOLDER]` in `CLAUDE.md`. This file governs how AI coding
agents behave in the project — fill it in before inviting any AI assistant.

For a worked example showing what a finished, filled-in `CLAUDE.md` looks like
(every placeholder resolved, project-specific rules added), see
[CLAUDE.example.md](../CLAUDE.example.md). Refer to it when in doubt about
section length, level of detail, or what a "filled in" answer looks like — but
always copy from `CLAUDE.md.template` (the example uses fictional Acme Studio
values).

---

## Step 3 — Run init:site

`site.project.json` is the durable project contract. `init:site` can still ask
the original setup prompts, but it now writes `site.project.json` first and then
generates owned files from that manifest. Run it once per project and commit the
result.

```bash
bun run init:site
```

It prompts in this order:

1. Package name (`package.json` `"name"`)
2. Site name (shown in titles and OG tags)
3. Production URL (HTTPS, no trailing slash)
4. Default meta description (≤155 chars)
5. GitHub owner (username or org)
6. GitHub repository name
7. Support contact email (shown on error pages)
8. Project slug (used for container/Quadlet names)
9. Production domain (for Caddyfile)
10. PWA short name (≤12 chars, for `site.webmanifest`)

For non-interactive setup, feed the same answers through stdin:

```ts
const answers = `my-cool-site
Acme Studio
https://acme-studio.dev
Portrait and brand photography for independent makers.
acme-org
my-cool-site
hello@acme-studio.dev
my-cool-site
acme-studio.dev
Acme
`;

const proc = Bun.spawn(['bun', 'run', 'init:site'], {
	stdin: 'pipe',
	stdout: 'inherit',
	stderr: 'inherit',
});

proc.stdin.write(answers);
proc.stdin.end();
process.exit(await proc.exited);
```

Re-running `init:site` with the same answers is a no-op: the manifest and
generated files converge to the same bytes.

For manifest-first edits, update `site.project.json` and run:

```bash
bun run init:site -- --write
bun run project:check
```

After init, `bun run validate:launch` will still fail until you replace
`static/og-default.png` with a real 1200×630 OG image. That failure is
intentional because the share image is a manual brand asset.

---

## Step 4 — Review generated site config

Before branding or form work, confirm the production runtime contract. This
template has one production database strategy:

- production runs on rootless Podman with the Bun runtime and the Bun SvelteKit adapter;
- every site has a dedicated `<project>-postgres` service on its own Podman network;
- `DATABASE_URL` is the internal web/worker URL to `<project>-postgres`;
- `DATABASE_DIRECT_URL` is the host/operator URL for migrations, backups, restores, and Drizzle Studio;
- the web, worker, and Postgres Quadlets are required production infrastructure;
- n8n is optional, but when enabled it uses a separate database and role inside this client's Postgres cluster.

The generated names are deterministic from `project.projectSlug`. Hyphens in
the slug become underscores for Postgres identifiers:

| Runtime object          | Name                           |
| ----------------------- | ------------------------------ |
| Podman network          | `<project>.network`            |
| Web container           | `<project>-web`                |
| Worker container        | `<project>-worker`             |
| Postgres container      | `<project>-postgres`           |
| Postgres volume         | `<project>-postgres-data`      |
| App database            | `<project>_app`                |
| App role                | `<project>_app_user`           |
| Optional n8n database   | `<project>_n8n`                |
| Optional n8n role       | `<project>_n8n_user`           |
| PITR backup prefix      | `<project>/postgres`           |
| Rendered production env | `~/secrets/<project>.prod.env` |

Use this build order for production work:

1. Create the repo.
2. Run `bun run init:site`.
3. Confirm generated runtime names.
4. Bootstrap local Podman Postgres with `./bootstrap`.
5. Run `bun run db:migrate`.
6. Verify DB health with `bun run check:db` and `/readyz`.
7. Edit brand, content, and pages.
8. Scaffold and customize business forms.
9. Generate and apply migrations with `bun run db:generate` and `bun run db:migrate`.
10. Configure automation and the required worker path.
11. Render production secrets.
12. Run `bun run deploy:preflight`.
13. Deploy Podman Quadlets.
14. Smoke the deployed URL.
15. Verify backup, PITR, and restore drills.

`./bootstrap` creates or verifies the local Podman Postgres container,
materializes `.env` with both database URLs, runs migrations, and verifies DB
connectivity. It is the supported local setup path.

---

## Step 5 — Review generated site config

Open [src/lib/config/site.ts](../src/lib/config/site.ts) and confirm generated
values from `site.project.json` look right. Hand-edit only project-specific
fields that are intentionally not manifest-owned, such as social profile URLs,
locale, or Search Console verification.

Verify SEO structure, then run the launch check before shipping:

```bash
bun run check:seo
bun run project:check
bun run check:launch   # fails loudly on launch-blocking placeholders
```

---

## Step 6 — Edit tokens.css with brand colors, fonts, and shape

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

## Step 7 — Review app.html

`init:site -- --write` updates the `theme-color` meta value from
`site.project.json`. In [src/app.html](../src/app.html), hand-edit only:

- The favicon `href` if you replace the default SVG at `static/favicon.svg`

---

## Step 8 — Register route policy and public routes

Every SvelteKit route must be covered in
[src/lib/seo/route-policy.ts](../src/lib/seo/route-policy.ts) as `indexable`,
`noindex`, `private`, `api`, `feed`, `health`, or `ignored`.

Public page routes also belong in [src/lib/seo/routes.ts](../src/lib/seo/routes.ts)
with `indexable: true` or `indexable: false`. The sitemap only includes
`indexable: true` routes; `robots.txt` and `llms.txt` derive from the same
registry.

```bash
bun run routes:check
```

---

## Step 9 — Verify static/admin/config.yml

Sveltia CMS needs to know which GitHub repo to write to. `init:site` generates
`backend.repo` from `site.project.json`. Open
[static/admin/config.yml](../static/admin/config.yml) and verify:

```yaml
backend:
  repo: <owner>/<repo>
  branch: main
```

### Verify CMS access before continuing

```bash
bun run dev
# open http://127.0.0.1:5173/admin in a browser
```

You should see the Sveltia CMS login screen and be able to authenticate against
the GitHub repo you configured. After signing in, the editor should list the
collections defined in `config.yml` (Pages, Articles, Team, Testimonials).

If the editor fails to load or auth fails:

- Confirm `backend.repo` is `<owner>/<repo>`, not a URL.
- Confirm your GitHub account has push access to the repo.
- Confirm the repo's default branch matches `backend.branch` (usually `main`).
- For local-only editing without GitHub auth, follow the
  Work-with-Local-Repository flow in
  [docs/cms/README.md](cms/README.md#local-development--work-with-local-repository).
  Open `/admin/index.html` in a Chromium-based browser, click
  **Work with Local Repository**, and select this project root.

Stop here and resolve any failure before moving on. Step 10 edits content the
CMS will manage; verifying CMS auth first prevents commits that the editor
won't be able to round-trip.

---

## Step 10 — Edit content/pages/home.yml

Replace the sample homepage content in [content/pages/home.yml](../content/pages/home.yml)
with real copy. The home route loads this file at build time — no database needed.

---

## Step 11 — Create custom pages and forms

For a plain source-controlled page, use the page scaffold and then edit the
generated Svelte:

```bash
bun run scaffold:page -- --slug=about --title="About"
bun run routes:check
```

For a DB-backed form that captures submitted data or starts a workflow, use the
form scaffold and then customize the generated schema, table, action, and page:

```bash
bun run scaffold:form -- --slug=idea-box --title="Idea Box" --description="Send a small project idea."
bun run db:generate
bun run db:migrate
bun run forms:check
```

The form scaffold writes typed source files; it is not a runtime form builder.
It registers the form, adds route/SEO coverage, inserts a minimized automation
outbox event, and leaves TODOs where project-specific fields belong. Inspect
runtime records with `bun run forms:ops`, which redacts PII by default.

Read [docs/forms/README.md](forms/README.md) before hand-editing a generated
business form.

---

## Step 12 — Configure automation, secrets, and production operations

The full optional module registry is at **[docs/modules/README.md](modules/README.md)**. Every module is dormant by default — no runtime cost unless activated.

The contact form works immediately — it saves to Postgres, logs emails to stdout, and skips outbound automation gracefully. Configure the modules below to extend it.

### Where each kind of value lives

The table below tells you _what_ to set; this section tells you _where_. The
template uses three distinct surfaces — pick the right one for each variable:

| Surface                | Use for                                                                                                           | Committed?            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------- |
| `secrets.yaml` (SOPS)  | All real secret values (API tokens, webhook secrets, DB passwords, backup credentials) — local **and** production | Yes, encrypted        |
| `.env` (gitignored)    | Local-dev convenience copy of values rendered by `bun run secrets:render`, or quick local-only overrides          | **No** — never commit |
| `.env.example`         | The public contract — every required variable name, no real values                                                | Yes                   |
| Production runtime env | What Quadlet/Caddy/CI inject at runtime; usually rendered from `secrets.yaml` by `push-secrets` style scripts     | No                    |

Rules of thumb:

- If a value is **secret** (token, password, signed-webhook secret), it
  belongs in `secrets.yaml`. Run `bun run secrets:render` to materialize a
  local `.env`; CI/prod gets its own rendered env file.
- If a value is **public** (`PUBLIC_*` vars: site URL, GTM ID, analytics
  toggles), it can live in `.env` directly — these end up in the client bundle
  anyway. Do not encrypt public values.
- If a value is a **boolean toggle** (`AUTOMATION_PROVIDER=n8n`,
  `RATE_LIMIT_ENABLED=true`), it can live in `.env` for local dev and in your
  prod env file for production.
- Add new variable _names_ to `.env.example` (and `secrets.example.yaml` if
  secret) the same commit you start using them. `bun run secrets:check` will
  catch plaintext leaks.

Full secrets workflow: [docs/deployment/secrets.md](deployment/secrets.md).

| Module                    | How to activate                                                                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Contact form**          | Already live at `/contact`. Saves to `contact_submissions` automatically. See [docs/design-system/forms-guide.md](design-system/forms-guide.md) and [docs/forms/README.md](forms/README.md).                                                                                         |
| **Real email (Postmark)** | Set `POSTMARK_SERVER_TOKEN`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL` in env. `resolveEmailProvider()` picks it up automatically — no code change needed.                                                                                                                            |
| **Automations**           | Set `AUTOMATION_PROVIDER` to `n8n`, `webhook`, or `noop`. Form actions save source rows and durable outbox events first; the required worker delivers later with retries/dead letters. n8n is optional and per-client only. See [docs/automations/README.md](automations/README.md). |
| **Privacy pruning**       | Run `bun run privacy:prune` for a dry-run and `bun run privacy:prune -- --apply` from scheduled maintenance after reviewing the retention policy. See [docs/privacy/data-retention.md](privacy/data-retention.md).                                                                   |
| **PITR backups**          | Set the required `R2_*`, `R2_PREFIX`, and `PITR_RETENTION_DAYS` values, install `backup-base` and `backup-check` timers, then run `bun run backup:pitr:check` and `bun run backup:restore:drill`. See [docs/operations/backups.md](operations/backups.md).                           |
| **Rate limiting**         | Set `RATE_LIMIT_ENABLED=true` for the in-process bucket. Single-node only — for durable/multi-node, add a Cloudflare WAF rule or `mholt/caddy-ratelimit` (snippets in `deploy/Caddyfile.example`).                                                                                   |
| **Analytics**             | Set `PUBLIC_ANALYTICS_ENABLED=true`, `PUBLIC_GTM_ID=GTM-XXXXXXX` in production env. See [docs/analytics/README.md](analytics/README.md).                                                                                                                                             |
| **Cookie consent**        | Import `ConsentBanner.svelte` from `src/lib/privacy/` into root layout. Required when using GTM/GA4/ad tags with EU or CCPA-jurisdiction users. See [docs/modules/cookie-consent.md](modules/cookie-consent.md).                                                                     |
| **Better Auth**           | Per-project only — not in base template. See [docs/modules/better-auth.md](modules/better-auth.md).                                                                                                                                                                                  |
| **Search (Pagefind)**     | Install `pagefind`, pre-render content routes, add `/search` route. See [docs/modules/pagefind.md](modules/pagefind.md).                                                                                                                                                             |

---

## Step 13 — Deploy

1. Build and verify locally:
   ```bash
   bun run validate:core     # local-safe: format/type/bootstrap/config checks, build, unit
   bun run validate:launch   # release-grade: validate:core + check:launch + check:content-diff
   bun run deploy:preflight  # after init:site/env rendering: Caddy, Quadlet, Postgres, worker structure
   ```
2. Build the web container image for a local smoke. Use the local
   `DATABASE_URL` from `./bootstrap` for this smoke only; production web and
   worker containers use `@<project>-postgres` on the Podman network.
   ```bash
   podman build --format docker -t <your-project>:local .
   podman run --rm -p 127.0.0.1:3000:3000 \
     -e PORT=3000 -e HOST=0.0.0.0 \
     -e ORIGIN=http://127.0.0.1:3000 \
     -e PUBLIC_SITE_URL=http://127.0.0.1:3000 \
     -e DATABASE_URL=postgres://<project>_app_user:yourpassword@host.containers.internal:5432/<project>_app \
     <your-project>:local
   # visit http://127.0.0.1:3000/healthz — process check, should return 200
   # visit http://127.0.0.1:3000/readyz  — DB connectivity check, should return 200
   ```
3. Follow the full deployment runbook for host Caddy, loopback-published web,
   bundled Postgres + WAL-G, explicit migrations, the per-site worker
   container, the daily/6-hour backup timers, and the optional per-client
   n8n bundle:
   [docs/deployment/runbook.md](deployment/runbook.md)
4. After deploying, smoke the live URL:
   ```bash
   bun run deploy:smoke -- --url https://your-domain.example
   ```
5. CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) runs `validate:ci` on every push, builds the image, runs Trivy with CRITICAL gating, smoke-tests the running container, and pushes to GHCR on `main`. `validate:launch` is gated on tags.

---

## Pre-launch checklist

Before going live, run the launch-grade validator:

```bash
bun run validate:launch
bun run deploy:preflight
```

This includes `check:launch` which verifies the production URL is a real
HTTPS domain (not `localhost`, not a placeholder string).

After the site is reachable, run `bun run deploy:smoke -- --url https://your-domain.example`
to verify `/healthz`, `/readyz`, discovery files, `/contact`, and key security
headers from outside the process.

See [docs/seo/launch-checklist.md](seo/launch-checklist.md) for the complete
pre-launch checklist covering SEO, a11y, images, and performance.
