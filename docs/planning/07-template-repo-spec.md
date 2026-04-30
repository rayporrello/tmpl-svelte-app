# Template Repo Spec

## What this document covers

The structural contract for `tmpl-svelte-app`: what files exist, what they own, and what must not change between projects.

## Template type

Website-first. The template targets landing pages, content sites, product sites, and advanced marketing sites. Normal document scrolling is the default. App-shell behaviors (full-height viewports, hidden overflow, mobile-native input suppression) are not baked in.

A project that grows into a full application should add app-shell features deliberately, not remove website defaults.

## Repository structure

```
tmpl-svelte-app/
  content/
    pages/
      home.yml                ← CMS-managed page content — parsed with js-yaml
    articles/
      *.md                    ← CMS-managed articles — parsed with gray-matter
    team/
      *.yml                   ← CMS-managed team members — parsed with js-yaml
    testimonials/
      *.yml                   ← CMS-managed testimonials — parsed with js-yaml
  static/
    admin/
      index.html              ← Sveltia CMS editor UI
      config.yml              ← CMS schema — the component data contract
    favicon.svg               ← default brand favicon (replace per project)
    favicon-32.png            ← legacy raster favicon
    apple-touch-icon.png      ← iOS home-screen icon
    og-default.png            ← default Open Graph share image
    site.webmanifest          ← PWA-style manifest
    fonts/                    ← self-hosted woff2 (paid fonts only — Fontsource lives in node_modules)
    uploads/                  ← CMS editor image uploads (commit source + generated .webp)
  deploy/
    Caddyfile.example         ← Caddy reverse proxy template (TLS, HSTS, compression, health_uri)
    env.example               ← runtime env reference (distinct from SOPS secrets)
    quadlets/
      web.container           ← systemd user unit via Podman Quadlet
      web.network             ← project-local Podman network
  src/
    app.html                  ← HTML shell; update title, theme-color, favicon
    app.css                   ← design system entry; imports only
    app.d.ts                  ← SvelteKit type augmentation (App.Locals: requestId; App.Error: requestId)
    hooks.server.ts           ← request ID injection, env init, CSP, security headers, centralized error handling
    lib/
      components/
        CmsImage.svelte       ← <CmsImage> for static/uploads/ (Sharp prebuild)
        Section.svelte        ← <Section> wraps <section> + .container (semantic HTML contract)
        seo/
          SEO.svelte          ← renders all head/meta/JSON-LD for a page
      config/
        site.ts               ← BRAND FILE — SEO/site config; replace all placeholders per project
      content/
        types.ts              ← TypeScript types for all CMS collections
        pages.ts              ← YAML page loaders (js-yaml)
        articles.ts           ← Markdown article loaders (gray-matter)
        team.ts               ← team YAML loader
        testimonials.ts       ← testimonials YAML loader
        markdown.ts           ← sanitized Markdown renderer (marked + sanitize-html, three trust tiers)
        index.ts              ← public re-export of content loader APIs
      env/
        public.ts             ← public env import path (PUBLIC_SITE_URL, etc.) — Valibot validated
        private.ts            ← private env import path (DATABASE_URL, secrets) — Valibot validated
      forms/
        contact.schema.ts     ← Valibot schema for the dormant contact form
      observability/
        types.ts              ← ObservabilityTier, LogLevel, HealthResponse, WorkflowEventPayload
      seo/
        types.ts              ← SEO TypeScript types
        metadata.ts           ← canonical URL, title, robots helpers
        schemas.ts            ← JSON-LD schema helpers (Organization, WebSite, Article, Breadcrumb, Person, LocalBusiness, FAQ)
        routes.ts             ← BRAND FILE — static route registry; declare every route + indexability
        sitemap.ts            ← sitemap XML generator
      server/
        env.ts                ← Valibot env schemas; initEnv() called from hooks.server on first request
        csp.ts                ← per-route CSP (relaxed on /admin for Sveltia CDN)
        logger.ts             ← structured JSON logger with automatic redaction
        request-id.ts         ← read or generate x-request-id
        safe-error.ts         ← normalize thrown errors; split public/diagnostic message
        forms/
          email-provider.ts   ← EmailProvider seam (interface)
          rate-limit.ts       ← in-memory token-bucket rate limiter (RATE_LIMIT_ENABLED)
          providers/
            console.ts        ← default no-op provider (logs to stdout)
            postmark.example.ts ← Postmark swap target — copy to postmark.ts to activate
      styles/
        tokens.css            ← BRAND FILE — replace or extend per project
        brand.example.css     ← annotated "Warm Coral" re-skin example
        reset.css             ← architecture file — do not edit
        base.css              ← architecture file — do not edit
        animations.css        ← architecture file — extend for brand motion below marker
        utilities.css         ← architecture file — buttons + extend for brand utilities below marker
        forms.css             ← architecture file — extend for brand form overrides below marker
    routes/
      +error.svelte           ← friendly accessible error page (request ID, support link, dev-only stack)
      +layout.svelte          ← imports app.css; injects root Organization/WebSite schema; real header + footer nav
      +page.server.ts         ← loads home.yml; returns typed home data
      +page.svelte            ← homepage; consumes CMS data; uses SEO component
      articles/
        +page.server.ts       ← loads published articles, sorted newest-first
        +page.svelte          ← /articles index — SEO + cards + empty state
        [slug]/
          +page.server.ts     ← loadArticle + renderMarkdown
          +page.svelte        ← /articles/[slug] — full Article schema, sanitized HTML body
      contact-example/        ← DORMANT — rename to contact/ to activate
        +page.server.ts       ← Superforms server action with rate limit + EmailProvider
        +page.svelte          ← Superforms-powered contact form with forms.css styles
      healthz/
        +server.ts            ← process liveness check; returns JSON
      sitemap.xml/
        +server.ts            ← prerendered /sitemap.xml
      robots.txt/
        +server.ts            ← prerendered /robots.txt
      llms.txt/
        +server.ts            ← prerendered /llms.txt
      styleguide/
        +page.server.ts       ← noindex; loads token data
        +page.svelte          ← design system demo; brand swatches, shadows, buttons; update when adding patterns
  docs/
    getting-started.md        ← 11-step new-site walkthrough
    template-maintenance.md   ← Bun-first workflow; validate vs validate:launch
    template-update-strategy.md ← clone-and-customize model + future @<owner>/web-template-utils extraction path
    cms/                      ← CMS docs (README, sveltia-guide, content-safety, content-contract, collection-patterns, sveltia-ai-reference)
    content/                  ← content rendering docs (markdown.md — trust tiers, allow-lists)
    observability/            ← observability docs (README, tiers, error-handling, n8n-workflows, runbook)
    automations/              ← automation docs (n8n patterns, contracts, security)
    deployment/               ← deployment docs (README, runbook, secrets)
    design-system/            ← design system docs (component CSS, tokens, forms, semantic HTML, images, typography, accessibility, llm rules, media editor)
    seo/                      ← SEO documentation (README, page-contract, schema-guide, launch-checklist)
    planning/                 ← planning documents (ADRs 001–019, vision, principles, build backlog, decision ledger)
  scripts/
    check-seo.ts              ← SEO validation
    check-cms-config.ts       ← CMS config validation (after config.yml changes)
    validate-content.ts       ← content file validation
    check-content-diff.ts     ← destructive content diff check (release-grade)
    check-assets.ts           ← default static assets exist and are non-empty
    check-launch.ts           ← release-grade env check (real HTTPS production URL)
    optimize-images.js        ← Sharp prebuild for static/uploads/
    init-site.ts              ← interactive idempotent site initializer (rewrites 9 files)
    generate-placeholder-assets.ts ← regenerate default favicon / og-default / manifest assets
    render-secrets.sh         ← decrypt secrets.yaml → .env (SOPS + age)
    check-secrets.sh          ← verify no plaintext secrets are tracked
  tests/
    unit/                     ← Vitest unit tests (env, seo-metadata, articles)
    e2e/                      ← Playwright + @axe-core/playwright smoke tests (10+ tests)
  .github/
    dependabot.yml            ← protected-package ignore list per ADR-012
    workflows/ci.yml          ← validate / image / launch jobs; Trivy CRITICAL gating; smoke; GHCR push
  Containerfile               ← multi-stage oven/bun:1-alpine, non-root, HEALTHCHECK
  Containerfile.node.example  ← adapter-node escape hatch (not CI-tested)
  AGENTS.md                   ← agent operating rules (security, env, CSP, observability, CMS safety)
  CLAUDE.md.template          ← template for per-project CLAUDE.md
  README.md                   ← project documentation
  lefthook.yml                ← pre-commit: prettier + eslint --fix on staged files
  eslint.config.js            ← ESLint flat config
  .prettierrc                 ← Prettier config (useTabs)
  vitest.config.ts            ← Vitest config ($lib alias)
  playwright.config.ts        ← Playwright config (runs against bun build/index.js)
```

## Architecture files vs. brand files

| File                            | Category     | Can edit per project?                                                            |
| ------------------------------- | ------------ | -------------------------------------------------------------------------------- |
| `src/lib/config/site.ts`        | Brand        | Yes — replace all placeholder values per project (or via `bun run init:site`)    |
| `src/lib/seo/routes.ts`         | Brand        | Yes — add every route with correct `indexable` value                             |
| `src/lib/server/csp.ts`         | Brand        | Yes — add per-route policy adjustments (third-party CDNs, analytics)             |
| `static/admin/config.yml`       | Brand        | Yes — set `backend.repo` and `backend.branch`; add new collections               |
| `tokens.css`                    | Brand        | Yes — this is THE CSS brand file                                                 |
| `brand.example.css`             | Reference    | Read-only example; copy values into `tokens.css`                                 |
| `reset.css`                     | Architecture | No                                                                               |
| `base.css`                      | Architecture | No (extend in components)                                                        |
| `animations.css`                | Architecture | Add brand motion below the marker comment                                        |
| `utilities.css`                 | Architecture | Add brand utilities below the marker comment                                     |
| `forms.css`                     | Architecture | Add brand form overrides below the marker comment                                |
| `app.css`                       | Entry        | Minimal edits: add/remove font imports, update layer order if adding a new layer |
| `app.html`                      | Shell        | Yes — update title, theme-color, favicon path                                    |
| `+layout.svelte`                | Entry        | Yes — add global header/footer, additional providers                             |
| `Containerfile`                 | Architecture | No — modify only with an ADR                                                     |
| `deploy/quadlets/web.container` | Per-host     | Yes — set `Image=`, `PublishPort=`, `Environment=` per project                   |
| `deploy/Caddyfile.example`      | Per-host     | Yes — set domain, upstream port                                                  |

## app.html constraints

- `viewport` must be `width=device-width, initial-scale=1` — do not disable user zoom on websites.
- `theme-color` should match `--brand-dark` or `--surface-ground` as a raw hex value (CSS variables are not readable here).
- The anti-FOUC theme initialization script must remain if the project supports a light/dark toggle.
- `%sveltekit.head%` and `%sveltekit.body%` must not be removed.

## app.css constraints

- The `@layer` declaration must be the first CSS rule (before any `@import`).
- Layer order must remain: `reset, tokens, base, utilities, components`.
- Font imports follow the layer declaration.
- Design system files import in order: tokens → reset → base → animations → utilities → forms.
- Do not add `html, body { height: 100%; overflow: hidden; }` — this is a website template.

## CSS authoring constraints

- All colors must reference semantic tokens from `tokens.css`, not raw brand primitives or palette values.
- Do not use `opacity` to create translucent surfaces. Use `color-mix(in oklch, color X%, transparent)`.
- Opacity is allowed for whole-element visibility transitions (fades) and disabled controls.
- Use logical properties (`padding-inline`, `border-block-start`) instead of physical directional properties.
- Use `gap` for spacing between flex/grid children. Use `margin-block` only in flow/prose contexts.
- All interactive controls must have a 44px minimum touch target.
- Form controls must support `aria-invalid`, `data-invalid`, help text, error text, disabled state, and keyboard focus visibility.

## Forms

`forms.css` is visual-only. It does not include validation logic, form submission, or data binding.

**Superforms is the standard form behavior library** for projects built from this template. When a project adds its first form with a server action, install Superforms: `bun add sveltekit-superforms valibot`. Superforms owns validation, data binding, submission, and progressive enhancement. It generates markup that `forms.css` already styles — no CSS changes needed.

## Dormant modules

These are planned but not active in the base template:

| Module              | Activation trigger                                                    |
| ------------------- | --------------------------------------------------------------------- |
| Postgres + Drizzle  | Add `DATABASE_URL`, create schema, run `drizzle-kit push`             |
| Automation webhooks | Set `AUTOMATION_PROVIDER`, configure the selected provider URL/secret |
| Postmark            | Add `POSTMARK_API_TOKEN`, implement mail helper                       |
| Better Auth         | Follow auth module docs; update `+layout.svelte`                      |

## Styleguide route

`src/routes/styleguide/+page.svelte` is a living demo of all design system primitives. It must be updated when new classes or component patterns are added. It is not linked from the site navigation by default — remove it or gate it behind a check before shipping to production.

## What not to add to this template

- Tailwind CSS or any utility-first CSS framework
- shadcn or any pre-built component library
- A competing forms validation framework (Superforms is the standard — do not add Formsnap, react-hook-form, or equivalents)
- A dashboard or app-shell layout as the default
- Site/app shell split architecture
- `html, body { overflow: hidden }` in the baseline CSS
- `maximum-scale=1, user-scalable=0` in the viewport meta tag
- SEO SaaS dependencies or external SEO plugins — the template ships built-in SEO infrastructure
- Hardcoded domain names or site names in SEO components, schemas, or routes
- `$page.url.href` used as a canonical URL — always derive from `site.url`
