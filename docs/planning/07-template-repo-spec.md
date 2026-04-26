# Template Repo Spec

## What this document covers

The structural contract for `tmpl-svelte-app`: what files exist, what they own, and what must not change between projects.

## Template type

Website-first. The template targets landing pages, content sites, product sites, and advanced marketing sites. Normal document scrolling is the default. App-shell behaviors (full-height viewports, hidden overflow, mobile-native input suppression) are not baked in.

A project that grows into a full application should add app-shell features deliberately, not remove website defaults.

## Repository structure

```
tmpl-svelte-app/
  src/
    app.html                  ← HTML shell; update title, theme-color, favicon
    app.css                   ← design system entry; imports only
    lib/
      styles/
        tokens.css            ← BRAND FILE — replace or extend per project
        reset.css             ← architecture file — do not edit
        base.css              ← architecture file — do not edit
        animations.css        ← architecture file — extend for brand motion
        utilities.css         ← architecture file — extend for brand utilities
        forms.css             ← architecture file — extend for brand form overrides
    routes/
      +layout.svelte          ← imports app.css; add global layout wrapper here
      styleguide/
        +page.svelte          ← design system demo; update when adding components
  docs/
    planning/                 ← planning documents (ADRs, vision, principles)
  AGENTS.md                   ← agent operating rules
  CLAUDE.md.template          ← template for per-project CLAUDE.md
  README.md                   ← project documentation
```

## Architecture files vs. brand files

| File | Category | Can edit per project? |
|------|----------|-----------------------|
| `tokens.css` | Brand | Yes — this is THE brand file |
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
