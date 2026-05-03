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
```

If you want to understand each step or override what bootstrap does, the manual
path follows below.

---

## Manual setup (advanced)

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
   bun run dev            # starts at http://127.0.0.1:5173
   bun run validate:core  # local-safe pipeline: typecheck, SEO/CMS/content/asset checks, build, unit tests
   ```
   `bun run validate` is an alias of `validate:core` and is the green-light
   check before any commit. CI runs `bun run validate:ci`, which adds built
   Playwright e2e and visual smoke checks.

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

## Step 6 — Review app.html

`init:site -- --write` updates the `theme-color` meta value from
`site.project.json`. In [src/app.html](../src/app.html), hand-edit only:

- The favicon `href` if you replace the default SVG at `static/favicon.svg`

---

## Step 7 — Register route policy and public routes

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

## Step 8 — Verify static/admin/config.yml

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

Stop here and resolve any failure before moving on. Step 9 edits content the
CMS will manage; verifying CMS auth first prevents commits that the editor
won't be able to round-trip.

---

## Step 9 — Edit content/pages/home.yml

Replace the sample homepage content in [content/pages/home.yml](../content/pages/home.yml)
with real copy. The home route loads this file at build time — no database needed.

---

## Step 10 — Set up the database

`DATABASE_URL` is required. The app will not start without it.

1. **Make sure Postgres is running.** If you don't already have one running locally, the fastest options are:

   ```bash
   # Option A — Podman (matches the prod runtime; recommended)
   podman run -d --name site-pg \
     -e POSTGRES_PASSWORD=devpw -e POSTGRES_DB=site_db -e POSTGRES_USER=site_user \
     -p 127.0.0.1:5432:5432 \
     docker.io/library/postgres:17-alpine
   # DATABASE_URL=postgres://site_user:devpw@127.0.0.1:5432/site_db

   # Option B — Docker Desktop
   docker run -d --name site-pg \
     -e POSTGRES_PASSWORD=devpw -e POSTGRES_DB=site_db -e POSTGRES_USER=site_user \
     -p 127.0.0.1:5432:5432 \
     postgres:17-alpine

   # Option C — Native install (macOS Homebrew, Debian/Ubuntu apt, Fedora dnf)
   #   macOS:        brew install postgresql@17 && brew services start postgresql@17
   #   Debian/Ubuntu: sudo apt install postgresql && sudo systemctl start postgresql
   #   Fedora:       sudo dnf install postgresql-server && sudo postgresql-setup --initdb && sudo systemctl start postgresql
   ```

   With Options A and B, the database, user, and password are created by the
   container at first start — skip step 2 below and jump to step 3.

2. **Create the database and user (native install only):**

   ```bash
   # Easy path — your shell user already has a Postgres role with CREATEDB
   createdb site_db
   createuser site_user --pwprompt
   psql site_db -c "GRANT ALL ON DATABASE site_db TO site_user;"
   psql site_db -c "GRANT ALL ON SCHEMA public TO site_user;"
   ```

   **If `createdb` or `createuser` fails with "role does not exist" or
   "permission denied":** your shell user is not a Postgres superuser. Run the
   equivalents through the `postgres` superuser instead:

   ```bash
   # Linux (Debian/Ubuntu/Fedora) — postgres OS user owns the cluster
   sudo -u postgres psql <<'SQL'
   CREATE DATABASE site_db;
   CREATE USER site_user WITH PASSWORD 'devpw';
   GRANT ALL ON DATABASE site_db TO site_user;
   \connect site_db
   GRANT ALL ON SCHEMA public TO site_user;
   SQL

   # macOS Homebrew — your shell user is the cluster owner; if `createdb`
   # still fails, the cluster did not finish initializing:
   brew services restart postgresql@17
   ```

3. **Set `DATABASE_URL` in your environment:**
   - SOPS workflow (recommended for shipping projects): add to `secrets.yaml`,
     then `bun run secrets:render`. See
     [docs/deployment/secrets.md](deployment/secrets.md).
   - Direct `.env` workflow (fastest for local dev): copy `.env.example` to
     `.env` and fill in `DATABASE_URL`. `.env` is gitignored.

4. **Run migrations:**

   ```bash
   bun run db:migrate
   ```

   This applies the starter schema (`contact_submissions`, `automation_events`, `automation_dead_letters`).

   Runtime tables have default privacy retention windows. Review [docs/privacy/data-retention.md](privacy/data-retention.md), then use `bun run privacy:prune` for a dry-run before enabling scheduled pruning.

5. **Verify:**

   ```bash
   curl http://127.0.0.1:3000/readyz   # after starting the dev server
   ```

   Should return `{"ok": true, "checks": {"database": {"ok": true}}, ...}`.

   If `/readyz` returns 503 with `database.ok: false`: your `DATABASE_URL` is
   wrong, the database isn't running, or the user lacks privileges on the
   `public` schema. The `error` field on the response identifies which.

See [docs/database/README.md](database/README.md) for the full setup guide, scripts reference, and production checklist.

---

## Step 11 — Configure optional modules

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

| Module                    | How to activate                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contact form**          | Already live at `/contact`. Saves to `contact_submissions` automatically. See [docs/design-system/forms-guide.md](design-system/forms-guide.md) and [docs/forms/README.md](forms/README.md).                                                                                                                                                                                                        |
| **Real email (Postmark)** | Set `POSTMARK_SERVER_TOKEN`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL` in env. `resolveEmailProvider()` picks it up automatically — no code change needed.                                                                                                                                                                                                                                           |
| **Automations**           | Set `AUTOMATION_PROVIDER` to `n8n`, `webhook`, `console`, or `noop`. n8n is the default and uses `N8N_WEBHOOK_URL` + `N8N_WEBHOOK_SECRET`. Failed HTTP deliveries are dead-lettered. See [docs/automations/README.md](automations/README.md).                                                                                                                                                       |
| **Privacy pruning**       | Run `bun run privacy:prune` for a dry-run and `bun run privacy:prune -- --apply` from scheduled maintenance after reviewing the retention policy. See [docs/privacy/data-retention.md](privacy/data-retention.md).                                                                                                                                                                                  |
| **Off-host backups**      | One-time per host: `curl https://rclone.org/install.sh \| sudo bash` + `rclone config`. Per-project: set `BACKUP_REMOTE` and `BACKUP_HEALTHCHECK_URL` in `secrets.yaml`, then `cp deploy/systemd/backup.{service,timer} ~/.config/systemd/user/<project>-backup.{service,timer}` + `systemctl --user enable --now <project>-backup.timer`. See [docs/operations/backups.md](operations/backups.md). |
| **Rate limiting**         | Set `RATE_LIMIT_ENABLED=true` for the in-process bucket. Single-node only — for durable/multi-node, add a Cloudflare WAF rule or `mholt/caddy-ratelimit` (snippets in `deploy/Caddyfile.example`).                                                                                                                                                                                                  |
| **Analytics**             | Set `PUBLIC_ANALYTICS_ENABLED=true`, `PUBLIC_GTM_ID=GTM-XXXXXXX` in production env. See [docs/analytics/README.md](analytics/README.md).                                                                                                                                                                                                                                                            |
| **Cookie consent**        | Import `ConsentBanner.svelte` from `src/lib/privacy/` into root layout. Required when using GTM/GA4/ad tags with EU or CCPA-jurisdiction users. See [docs/modules/cookie-consent.md](modules/cookie-consent.md).                                                                                                                                                                                    |
| **Better Auth**           | Per-project only — not in base template. See [docs/modules/better-auth.md](modules/better-auth.md).                                                                                                                                                                                                                                                                                                 |
| **Search (Pagefind)**     | Install `pagefind`, pre-render content routes, add `/search` route. See [docs/modules/pagefind.md](modules/pagefind.md).                                                                                                                                                                                                                                                                            |

---

## Step 12 — Deploy

1. Build and verify locally:
   ```bash
   bun run validate:core     # local-safe: typecheck, SEO/CMS/content/assets, build, unit
   bun run validate:launch   # release-grade: validate:core + check:launch + check:content-diff
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
4. CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) runs `validate:ci` on every push, builds the image, runs Trivy with CRITICAL gating, smoke-tests the running container, and pushes to GHCR on `main`. `validate:launch` is gated on tags.

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
