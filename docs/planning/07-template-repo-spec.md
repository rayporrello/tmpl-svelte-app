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
    uploads/                  ← CMS editor image uploads
  src/
    app.html                  ← HTML shell; update title, theme-color, favicon
    app.css                   ← design system entry; imports only
    app.d.ts                  ← SvelteKit type augmentation (App.Locals: requestId)
    hooks.server.ts           ← request ID injection; centralized error handling
    lib/
      observability/
        types.ts              ← ObservabilityTier, LogLevel, HealthResponse, WorkflowEventPayload
      server/
        logger.ts             ← structured JSON logger with automatic redaction
        request-id.ts         ← read or generate x-request-id
        safe-error.ts         ← normalize thrown errors; split public/diagnostic message
      config/
        site.ts               ← BRAND FILE — SEO/site config; replace all placeholders per project
      content/
        types.ts              ← TypeScript types for all CMS collections
        pages.ts              ← YAML page loaders (js-yaml)
        articles.ts           ← Markdown article loaders (gray-matter)
        index.ts              ← public re-export of content loader APIs
      seo/
        types.ts              ← SEO TypeScript types
        metadata.ts           ← canonical URL, title, robots helpers
        schemas.ts            ← JSON-LD schema helpers
        routes.ts             ← static route registry — add every route here
        sitemap.ts            ← sitemap XML generator
      styles/
        tokens.css            ← BRAND FILE — replace or extend per project
        reset.css             ← architecture file — do not edit
        base.css              ← architecture file — do not edit
        animations.css        ← architecture file — extend for brand motion
        utilities.css         ← architecture file — extend for brand utilities
        forms.css             ← architecture file — extend for brand form overrides
      components/
        seo/
          SEO.svelte          ← renders all head/meta/JSON-LD for a page
    routes/
      +error.svelte           ← friendly accessible error page; no stack traces
      +layout.svelte          ← imports app.css; injects root Organization/WebSite schema
      +page.server.ts         ← loads home.yml; returns typed home data
      +page.svelte            ← homepage; consumes CMS data; uses SEO component
      healthz/
        +server.ts            ← process liveness check; returns JSON
      sitemap.xml/
        +server.ts            ← prerendered /sitemap.xml
      robots.txt/
        +server.ts            ← prerendered /robots.txt
      llms.txt/
        +server.ts            ← prerendered /llms.txt
      styleguide/
        +page.svelte          ← design system demo; noindex; update when adding components
  docs/
    cms/                      ← CMS documentation (README, sveltia-guide, content-safety, content-contract, collection-patterns)
    observability/            ← observability docs (README, tiers, error-handling, n8n-workflows, runbook)
    automations/              ← automation docs (n8n patterns, contracts, security)
    seo/                      ← SEO documentation (README, page-contract, schema-guide, launch-checklist)
    planning/                 ← planning documents (ADRs, vision, principles)
  scripts/
    check-seo.ts              ← SEO validation — run before deploying
    check-cms-config.ts       ← CMS config validation — run after config.yml changes
    validate-content.ts       ← content file validation — run before deploying
    check-content-diff.ts     ← destructive content diff check — run before content commits
  AGENTS.md                   ← agent operating rules (includes observability + CMS safety rules)
  CLAUDE.md.template          ← template for per-project CLAUDE.md
  README.md                   ← project documentation
```

## Architecture files vs. brand files

| File | Category | Can edit per project? |
|------|----------|-----------------------|
| `src/lib/config/site.ts` | Brand | Yes — replace all placeholder values per project |
| `src/lib/seo/routes.ts` | Brand | Yes — add every route with correct `indexable` value |
| `tokens.css` | Brand | Yes — this is THE CSS brand file |
| `reset.css` | Architecture | No |
| `base.css` | Architecture | No (extend in components) |
| `animations.css` | Architecture | Add brand motion below the marker comment |
| `utilities.css` | Architecture | Add brand utilities below the marker comment |
| `forms.css` | Architecture | Add brand form overrides below the marker comment |
| `app.css` | Entry | Minimal edits: add/remove font imports, update layer order if adding a new layer |
| `app.html` | Shell | Yes — update title, theme-color, favicon path |
| `+layout.svelte` | Entry | Yes — add global header/footer, additional providers |

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

| Module | Activation trigger |
|--------|-------------------|
| Postgres + Drizzle | Add `DATABASE_URL`, create schema, run `drizzle-kit push` |
| n8n webhooks | Add `N8N_WEBHOOK_URL` env var, enable workflow in n8n |
| Postmark | Add `POSTMARK_API_TOKEN`, implement mail helper |
| Better Auth | Follow auth module docs; update `+layout.svelte` |

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
