# Historical Audit Snapshot — Superseded

This file is preserved as context from an earlier "poke holes" audit. It is
not a current task list. For live status, use:

- [11-template-build-backlog.md](11-template-build-backlog.md) — v1 readiness and implementation history
- [12-post-v1-roadmap.md](12-post-v1-roadmap.md) — beyond-baseline topics to decide later
- [../template-maintenance.md](../template-maintenance.md) — current validation and maintenance commands

## Resolved From The Original Audit

- Graceful shutdown: `serve.js` wraps `build/index.js` and handles SIGTERM/SIGINT.
- DB client basics: `src/lib/server/db/index.ts` configures postgres.js timeouts.
- Rate-limit boundary: app token bucket exists and `deploy/Caddyfile.example` documents Cloudflare/Caddy options.
- Contact form spam baseline: `/contact` includes a honeypot field and silent bot success.
- HSTS dual-write: Caddy is canonical, and the app preserves HSTS behind non-Caddy proxies.
- Speculation Rules: `src/app.html` includes same-origin prerender rules.
- `bun audit`: CI runs it as advisory.
- Immutable SvelteKit assets: adapter handling is the default; the Caddyfile also carries an explicit optional override snippet.
- Reduced motion: global motion controls live in `src/lib/styles/animations.css`.

## Still Deliberately Deferred

These are not blockers for v1. They need a project trigger or a dedicated ADR
before code lands:

- Lighthouse CI / bundle budgets
- RUM / Web Vitals dashboards
- Client/server error tracking provider such as Sentry or GlitchTip
- CodeQL, SBOM, SLSA provenance, and image signing
- CSP report-uri/report-to endpoint
- View Transitions
- Service worker / PWA behavior
- Global Privacy Control handling in the consent module
- Branch preview deployments
- i18n, newsletter, site search, generated OG images, and other optional modules

## Current Launch Blockers For A Derived Site

A project created from this template is not launch-ready until it has:

- Run `bun run init:site`
- Replaced `static/og-default.png` with a real 1200x630 share image
- Set production `ORIGIN`, `PUBLIC_SITE_URL`, and `DATABASE_URL`
- Configured `static/admin/config.yml` for the real GitHub repository
- Run migrations against the production database
- Passed `bun run validate:launch`
