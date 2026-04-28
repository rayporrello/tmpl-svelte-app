# Stack Decisions

Rationale for the technology choices in this template. For full ADRs see `docs/planning/adrs/`.

---

## Framework

**SvelteKit + Svelte 5** — website-first, compiler-based, minimal runtime. Not a dashboard scaffold.

## Runtime / package manager

**Bun** — unified package manager, script runner, and server runtime. Replaces Node + npm/pnpm.  
See [ADR-012](adrs/ADR-012-bun-first-dependency-and-build-artifact-policy.md).

## CSS

**Native CSS with cascade layers and custom properties.** No Tailwind, no component library.  
See [ADR-005](adrs/ADR-005-css-token-architecture.md).

## Forms

**Superforms + Valibot** — standard form behavior library; install per project when the first server action is added.  
CSS layer (`forms.css`) works without it for display-only forms.

## CMS

**Sveltia CMS** — file-based, Git-backed. Wired into the template; activate per project by setting `backend.repo` in `static/admin/config.yml`.  
See [ADR-014](adrs/ADR-014-sveltia-content-system.md).

## Database

**Postgres + Drizzle** — default for runtime data. Dormant in base template; activate when a project needs persistent data.  
See [ADR-004](adrs/ADR-004-postgres-for-runtime-data.md).

## Images

**Dual-tier pipeline:** `<enhanced:img>` for build-time assets (AVIF+WebP via Vite plugin), `<CmsImage>` for runtime uploads (WebP via Sharp prebuild).  
See [ADR-009](adrs/ADR-009-image-pipeline.md).

## Typography

**Fontsource variable packages** — self-hosted, no Google CDN dependency.  
See [ADR-010](adrs/ADR-010-typography-and-font-loading.md).

## SEO

**Built-in:** central site config, SEO component, schema helpers, sitemap, robots.txt, check script.  
See [ADR-011](adrs/ADR-011-built-in-seo-system.md).

## Analytics

**Dormant spine, env-var activated.** GTM web container + GA4 is the default production path. SvelteKit emits explicit `dataLayer` page views on every navigation. Cloudflare Web Analytics is a supported optional sanity layer. Server-side conversion events exist as a typed seam (no-op by default). GA4 Measurement Protocol, server-side GTM, and ad-platform APIs are documented upgrade paths — not default infrastructure.

See [docs/analytics/README.md](../analytics/README.md).

## Deployment

**Podman Quadlet + Caddy** — container-based, rootless. Templates planned for Phase 6.  
See [ADR-007](adrs/ADR-007-podman-caddy-infrastructure.md).

## Search

**Pagefind — optional, not installed by default.** Static, build-output-based search. No backend service to run. Activate per project when the site has enough content (10+ pages/articles) that a nav is insufficient.

See [docs/modules/pagefind.md](../modules/pagefind.md).

## Cookie consent

**Dormant seam installed; UI not activated by default.** `src/lib/analytics/consent.ts` provides typed Google Consent Mode v2 helpers. Dormant banner and preferences UI live in `src/lib/privacy/`. Activate per project when using GTM/GA4/ad tags with users in consent-required jurisdictions.

See [docs/modules/cookie-consent.md](../modules/cookie-consent.md) and [docs/analytics/consent-and-privacy.md](../analytics/consent-and-privacy.md).

## Auth

**No auth by default.** Better Auth is the recommended library when a project needs user accounts, member areas, or a gated admin portal. It layers on the existing Postgres/Drizzle foundation and is activated per project only.

See [docs/modules/better-auth.md](../modules/better-auth.md).

## PWA / service worker

**No service worker by default.** The web manifest, icons, and `theme-color` are included. A service worker adds cache complexity and stale-content risk that is not appropriate for marketing and content sites without a deliberate cache strategy and update UX.

See [ADR-020](adrs/ADR-020-pwa-no-by-default.md).

## Secrets management

**SOPS + age** — encrypted `secrets.yaml` is the Git-tracked source of truth. `.env` is a rendered artifact, never committed.

- `.env.example` documents the public variable contract.
- `secrets.example.yaml` shows the expected shape with fake values.
- `.sops.yaml` declares encryption rules; public recipients only — safe to commit.
- `scripts/render-secrets.sh` decrypts to `.env` for local dev or deployment.
- `scripts/check-secrets.sh` / `bun run secrets:check` is the quality gate.

**OpenBao is deferred / escalation only.** It is the right tool for dynamic credentials, workflow-created secrets, tenant provisioning, and multi-service access boundaries — not for static website deployment config.

**SaaS secret managers** (Doppler, Infisical, 1Password Secrets Automation) are optional per real project and are not part of the base template. They require accounts and network access that conflict with the provider-independent template goal.

See [ADR-013](adrs/ADR-013-sops-age-secrets-management.md) and [docs/deployment/secrets.md](../deployment/secrets.md).
