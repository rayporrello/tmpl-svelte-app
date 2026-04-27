# Quality Gates

Checks that must pass before a project built from this template ships or before changes land on `main`.

## Build gates (automated)

- [ ] `bun run build` exits 0 with no errors
- [ ] `bun run check` (svelte-check / TypeScript) exits 0
- [ ] No unresolved TypeScript errors in routes or lib files
- [ ] Bundle size is within expected range (no accidental large imports)

## Lint / format gates (automated)

- [ ] ESLint exits 0 (or equivalent project linter)
- [ ] Prettier exits 0 (or equivalent formatter)
- [ ] No `console.log` left in production code

## Accessibility gates

- [ ] axe-core / Playwright accessibility scan passes with zero critical violations
- [ ] All images have `alt` text (decorative images use `alt=""`)
- [ ] All form controls have associated `<label>` elements
- [ ] All interactive elements are reachable and operable by keyboard
- [ ] Focus rings are visible on all interactive elements (spot-check `Tab` key)
- [ ] Color contrast ratio ≥ 4.5:1 for body text, ≥ 3:1 for large text and UI components

## Performance gates

- [ ] Lighthouse performance score ≥ 90 on mobile (production build)
- [ ] LCP ≤ 2.5s on simulated mid-tier mobile
- [ ] No render-blocking font loads (Fontsource variable fonts self-hosted via `@import`)
- [ ] No images without `width` and `height` attributes (prevents layout shift)
- [ ] LCP image uses `loading="eager"` and `fetchpriority="high"` — never `loading="lazy"`
- [ ] No `<link rel="preload">` tags pointing to Fontsource font files (hashed filenames go stale)

## Image pipeline gates

Full rules: `docs/design-system/images.md`

- [ ] `vite.config.ts` has `enhancedImages()` before `sveltekit()`
- [ ] Brand/dev images are in `src/lib/assets/` and use `<enhanced:img>`
- [ ] CMS uploads are in `static/uploads/` and use `<CmsImage>`
- [ ] `scripts/optimize-images.js` exits 0 when `static/uploads/` is empty
- [ ] Generated `.webp` files in `static/uploads/` are committed and not gitignored
- [ ] No CMS documentation or agent rules suggest putting editor uploads in `src/`
- [ ] `prebuild` script runs automatically before `bun run build`

## Typography gates

Full rules: `docs/design-system/typography.md`

- [ ] Fontsource variable packages are installed (`@fontsource-variable/*`)
- [ ] Font imports are in `src/app.css` — not in any component
- [ ] `--font-sans` and `--font-mono` tokens are defined in `tokens.css`
- [ ] `body` uses `var(--font-sans)` (confirmed in `reset.css`)
- [ ] `code`, `pre`, `kbd` use `var(--font-mono)` (confirmed in `base.css`)
- [ ] Form controls inherit font (confirmed in `reset.css` via `font: inherit`)
- [ ] No Google Fonts CDN `<link>` in `app.html`
- [ ] No `<link rel="preload">` for Fontsource fonts in `app.html`

## Semantic HTML gates

- [ ] Exactly one `<main id="main-content">` per page (provided by `+layout.svelte`)
- [ ] Skip link is present before the `<header>` in `+layout.svelte`
- [ ] Every page has exactly one `<h1>` — the page title, not the site name
- [ ] No `<h1>` appears inside the site `<header>`
- [ ] Heading levels are sequential — no skipped levels (h1 → h2 → h3, never h1 → h3)
- [ ] Every thematic `<section>` has a heading
- [ ] Both `<nav>` elements (primary and footer) have `aria-label` attributes
- [ ] Meaningful images use `<figure>` + `<img alt="...">` — not CSS `background-image`
- [ ] Decorative images have `alt=""` (present and empty, not omitted)
- [ ] `<img>` elements include `width` and `height` attributes to prevent layout shift
- [ ] Dates use `<time datetime="...">`, not `<span>`
- [ ] No `<div>` used where a semantic element exists
- [ ] `/styleguide` route deleted before project goes live

## CSS / design system gates

- [ ] **No `html, body { overflow: hidden }` in the website template baseline.** This is a website-first template; full-height viewport lock is not the default. Any project that deliberately adds this must leave a comment explaining why.
- [ ] **No `maximum-scale=1` or `user-scalable=0` in `app.html`.** Disabling user zoom fails WCAG 1.4.4. Website templates must not ship with zoom disabled.
- [ ] **No raw project colors inside component CSS when a semantic token exists.** Components must reference `var(--token)` — never raw oklch/hex/rgb values that belong in `tokens.css`.
- [ ] **No hardcoded spacing values in component CSS** except approved exceptions (e.g., `1px` borders, `2px` outlines, sub-pixel optical corrections). Spacing must use `var(--space-*)` tokens.
- [ ] **No `opacity` for translucent surfaces, borders, overlays, or glass effects.** Use `color-mix(in oklch, color X%, transparent)`. Opacity is allowed for whole-element fade transitions and disabled controls.
- [ ] **CSS layer order in `app.css` is unchanged:** `reset, tokens, base, utilities, components`.
- [ ] **No form behavior duplicated in CSS.** `forms.css` owns visual styling. Superforms owns validation, submission, and data binding. Do not add JS-like logic via CSS custom properties or attribute tricks that replicate Superforms behavior.

## Forms gates

- [ ] All form controls support `aria-invalid="true"` (error state via ARIA)
- [ ] All form controls support `.field-error` help text (or equivalent rendered by Superforms)
- [ ] All form controls support `.field-help` hint text
- [ ] All form controls support `:disabled` / `[disabled]` visual state
- [ ] All form controls have visible `:focus-visible` keyboard focus ring
- [ ] All interactive form controls meet 44px minimum touch target (`min-height: 44px`)
- [ ] `forms.css` does not import or depend on Superforms — it works without it

## SEO gates

- [ ] `bun run check:seo` exits 0 (validates site config, placeholder detection, route registry)
- [ ] `site.url` in `src/lib/config/site.ts` is the production domain — not `https://example.com`
- [ ] `site.name` and `site.defaultTitle` are not placeholder values
- [ ] Every public `+page.svelte` uses the `SEO` component with `title`, `description`, `canonicalPath`
- [ ] Every route is registered in `src/lib/seo/routes.ts` with `indexable` declared
- [ ] `/styleguide`, `/admin`, `/preview`, and draft routes are `indexable: false` and `noindex, nofollow`
- [ ] `<title>` is unique per page (not the placeholder `[Site Title]`)
- [ ] `<meta name="description">` is present and unique per page
- [ ] Canonical URL is set via the SEO component (not `$page.url.href`)
- [ ] `/sitemap.xml` is accessible and contains only indexable routes
- [ ] `/robots.txt` is present and includes the sitemap URL
- [ ] OG image is accessible and renders correctly in link previews
- [ ] Schema added to pages matches visible page content

## Secrets gates

Full guide: `docs/deployment/secrets.md`

- [ ] `.env.example` exists and lists all required environment variable names
- [ ] `secrets.example.yaml` exists and matches the shape of `.env.example`
- [ ] `.sops.yaml.example` exists
- [ ] `secrets.yaml`, when present, contains a `sops:` metadata block (i.e., is encrypted)
- [ ] `.env` is not tracked by Git (`git ls-files .env` returns empty)
- [ ] No `.env.*` files are tracked except `.env.example`
- [ ] No `secrets.decrypted.yaml` or `*.decrypted.yaml` files are tracked
- [ ] `bun run secrets:check` exits 0
- [ ] No real secret values appear in `src/lib/config/site.ts` or any client-importable file

## Container / deploy gates

- [ ] `podman build` (or `docker build`) completes with no errors
- [ ] Application starts and responds at the expected port
- [ ] Environment variables are validated at startup (not silently missing)
- [ ] Secrets are never committed to the repo (check `.gitignore`, pre-commit hook)

## CMS / content gates

- [ ] `bun run build` exits 0 with content files present in `content/`
- [ ] `content/pages/home.yml` is valid YAML (parseable with js-yaml)
- [ ] `content/articles/*.md` files have valid frontmatter (parseable with gray-matter)
- [ ] Homepage loads from `content/pages/home.yml` (verify `+page.server.ts` uses `loadHomePage()`)
- [ ] `static/admin/config.yml` field names match `src/lib/content/types.ts` interfaces
- [ ] No CMS image path field is rendered as a bare `<img>` — must use `CmsImage`
- [ ] `content/articles/` loader remaps gray-matter `.content` to `.body` (never `data.body`)
- [ ] Pure YAML files use js-yaml — not gray-matter
- [ ] Markdown frontmatter files use gray-matter — not js-yaml
- [ ] File-reading routes use `+page.server.ts` — not `+page.ts`
- [ ] `docs/cms/collection-patterns.md` is updated when a collection is added or removed
- [ ] `/admin` is registered in `src/lib/seo/routes.ts` as `indexable: false`

## Automation-readiness gates

- [ ] n8n is not listed in `package.json` dependencies
- [ ] No SvelteKit module imports from n8n packages
- [ ] `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET` are documented in `.env.example` with empty values
- [ ] No real webhook URL or secret is committed to the repo
- [ ] `docs/automations/runtime-event-contract.md` documents the planned event shape
- [ ] `docs/automations/content-automation-contract.md` documents the write rules
- [ ] Site builds and serves correctly when `N8N_WEBHOOK_URL` is unset

## Template integrity gates (before publishing a new template version)

- [ ] `tokens.css` is the only file that needs to change to rebrand the template
- [ ] `reset.css`, `base.css`, `animations.css`, `utilities.css`, `forms.css` contain no project-specific values
- [ ] `AGENTS.md` and `CLAUDE.md.template` are up to date with current architecture
- [ ] `docs/planning/` reflects actual decisions, not stale planning notes
- [ ] Styleguide route (`/styleguide`) renders all documented classes without errors
- [ ] No routes, components, or assets from a previous project are present
