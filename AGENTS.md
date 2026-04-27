# AGENTS.md — tmpl-svelte-app

Operating rules for AI agents (Claude, Codex, Cursor, etc.) working in this repository. Read this before making any changes.

---

## Source of truth order

When planning docs conflict with real files, this is the authority order — top wins:

1. **Files under `src/`** — the implementation is truth
2. **`AGENTS.md`** (this file) and **`CLAUDE.md`** (project copy)
3. **`docs/design-system/`** — real design system documentation
4. **Accepted ADRs in `docs/planning/adrs/`**
5. **Other planning docs** — historical context only; do not use to override implemented files

**Do not use stale planning notes to override implemented CSS architecture or resurrect abandoned dependencies.**

---

## CSS / design-system rules

The full rule set is in [docs/design-system/llm-css-rules.md](docs/design-system/llm-css-rules.md). Key points:

### Always

- Reference semantic tokens (`var(--surface-raised)`, `var(--text-primary)`) — never raw brand primitives or hardcoded values
- Use `color-mix(in oklch, color X%, transparent)` for translucent surfaces — never `opacity` on surfaces
- Use logical properties: `padding-inline`, `border-block-start`, `margin-inline-start`
- Use `gap` for spacing between flex/grid children; `margin-block` only in `.flow` prose contexts
- Use `min-height: 44px` on interactive form controls
- Keep `@layer` order: `reset, tokens, base, utilities, components`
- Add new semantic tokens to `tokens.css` before using a value in component CSS

### Never

- `html, body { overflow: hidden }` — this is a website template; scrolling is the default
- `maximum-scale=1` or `user-scalable=0` in `app.html` — fails WCAG 1.4.4
- Raw color values (oklch/hex/hsl/rgb) in component CSS
- Hardcoded spacing except `1px` borders and `2px` outlines
- Tailwind, shadcn, or any pre-built component library
- A new `@layer` declaration without also updating `app.css`

### Opacity

Opacity is **allowed** for whole-element fades, skeleton/pulse animations, and disabled controls (dimming the whole element including its children is intentional).

Opacity is **not allowed** for translucent backgrounds, borders, overlays, or glass effects — use `color-mix()`.

---

## HTML + CSS generation contract

Before generating any UI markup or components, read:

- `docs/design-system/llm-html-rules.md` — mandatory HTML rules and forbidden patterns
- `docs/design-system/llm-css-rules.md` — mandatory CSS rules
- `docs/design-system/semantic-html-guide.md` — full reference with pre-generation checklist

### Non-negotiable HTML rules

- Use `Section.svelte` (at `src/lib/components/Section.svelte`) for all thematic page sections
- Use the most specific semantic element available — `<article>`, `<nav>`, `<aside>`, `<time>`, `<figure>`, etc.
- Do not generate div-heavy markup when a semantic element exists
- The page `<main id="main-content">` lives in `+layout.svelte` — never add a second `<main>`
- One `<h1>` per page — always the page title, never the site name in the header
- Meaningful images use `<figure><img alt="..."></figure>`, not CSS `background-image`
- Dates use `<time datetime="...">`, not `<span>`
- Links navigate (`<a href>`); actions fire (`<button type="button">`)

### Non-negotiable CSS rules

- Inspect `docs/design-system/` before writing CSS or components
- Reference semantic tokens — never raw brand primitives or hardcoded values
- Do not create new one-off CSS when an existing token, utility, or component covers it
- Component scoped `<style>` blocks are allowed for component-specific layout/appearance — they must consume tokens
- Do not use Tailwind, shadcn, or any pre-built component library
- Do not use component-scoped CSS to bypass the global design system
- Run the pre-generation checklist in `llm-html-rules.md` before finalizing output

---

## What agents may edit

| Target | What to do |
|--------|-----------|
| `tokens.css` | Edit freely for brand customization |
| `src/lib/config/site.ts` | Replace all placeholder values for each project |
| `src/lib/seo/routes.ts` | Add new routes; set `indexable` correctly |
| Component `<style>` blocks | Write component-specific styles here |
| Brand sections in architecture files | Add after the `BRAND-SPECIFIC` marker comment |
| `+layout.svelte` | Add global layout wrapper, header, footer |
| `app.html` | Update title, `theme-color` hex, favicon |

## What agents must NOT edit

| Target | Reason |
|--------|--------|
| `reset.css` | Universal — editing breaks all projects |
| `base.css` | Element defaults — extend via components |
| Architecture sections of `utilities.css`, `animations.css`, `forms.css` | Shared across projects — editing breaks all |
| Layer order in `app.css` | Must stay `reset, tokens, base, utilities, components` |

---

## Images

Full reference and quickstart: [docs/design-system/images.md](docs/design-system/images.md)  
HTML markup rules: [docs/design-system/llm-html-rules.md](docs/design-system/llm-html-rules.md) → Image rules section

### When you are about to write image markup — follow this workflow

**Step 1 — Ask: is this image's path known at build time?**

| Answer | Folder | Component |
|--------|--------|-----------|
| **Yes** — file committed to repo, referenced in code | `src/lib/assets/` | `<enhanced:img>` |
| **No** — path is a runtime string from CMS, DB, or user upload | `static/uploads/` | `<CmsImage>` |

Default to `src/lib/assets/` + `<enhanced:img>` unless there is a clear runtime-path reason for `CmsImage`. The distinction is not "developer vs editor" — it is build-time vs runtime. If unclear, ask before writing markup.

**Step 2 — Always include these three things:**

- `alt` — describe what is in the image; `alt=""` for decorative
- `width` — display width in CSS pixels (not the source file size)
- `height` — display height in CSS pixels

Use standard dimensions from `docs/design-system/images.md`. For Tier 1 (`<enhanced:img>`), `width`/`height` should match the source file — the plugin generates srcset from there. For Tier 2 (`CmsImage`), use the display size.

| Use case | Source file | `width` attr | `height` attr |
|----------|------------|-------------|--------------|
| Hero / full-bleed | 2560 × 1280 | 1920 | 960 |
| Section feature | 1920 × 1080 | 1600 | 900 |
| Article featured | 1200 × 630 | 1200 | 630 |
| Card (2–3/row) | 1200 × 675 | 800 | 450 |
| Team headshot | 600 × 600 | 400 | 400 |

Add `sizes="100vw"` to any full-bleed image.

If the image does not match a standard slot, ask the user for the display dimensions or use the closest standard as a placeholder and flag it. Never omit `width` and `height`.

**Step 3 — Ask: is this the hero or the first large visible image on load?**

If yes: add `loading="eager" fetchpriority="high"`.  
If no: do nothing — `loading="lazy"` is the default in both components.

**Step 4 — Wrap in `<figure>` if the image is meaningful content.**

Decorative images (`alt=""`) do not need a `<figure>`.

### What the pipeline provides automatically

- `<enhanced:img>` → AVIF + WebP + `<picture>` + responsive srcset (Vite plugin)
- `<CmsImage>` → WebP + `<picture>` with original fallback (Sharp prebuild)
- Both default to `loading="lazy"`

You do not need to write `<picture>`, `<source>`, or format-specific markup. The components handle it.

### Never

- Do not use plain `<img>` for brand or CMS images
- Do not put CMS uploads in `src/` — `<enhanced:img>` cannot process `static/` files
- Do not add `loading="lazy"` to a hero or LCP image
- Do not use `background-image` for meaningful content images
- Do not use GIF — use CSS animation or `<video autoplay loop muted playsinline>`
- Do not add R2 or Cloudflare Image Resizing to the base template

---

## Typography

Full reference: [docs/design-system/typography.md](docs/design-system/typography.md)

### Always

- Reference `var(--font-sans)` and `var(--font-mono)` in CSS — never hardcode font names
- Import Fontsource fonts once globally in `src/app.css` — never in components
- Use Fontsource variable packages (`@fontsource-variable/*`) for open-source fonts
- Place paid/proprietary fonts in `static/fonts/` as `.woff2` and declare `@font-face` in `tokens.css`

### Never

- Do not add `<link rel="preload">` for Fontsource fonts — hashed filenames become stale across updates
- Do not use a Google Fonts CDN `<link>` — adds CDN dependency and GDPR risk
- Do not hardcode font family names in component CSS — use `var(--font-sans)` / `var(--font-mono)`
- Do not import Fontsource in a component — one global import in `app.css` only
- Do not keep `woff`, `ttf`, or `eot` fallback formats — modern browsers use `woff2` only

---

## Forms rules

**`forms.css`** owns visual styling: field layout, control appearance, states, messages.

**Superforms** is the standard form behavior library. Install when a project adds its first form with a server action:

```bash
bun add sveltekit-superforms valibot
```

Superforms owns: validation, data binding, submission, progressive enhancement, server errors, constraint API.

Do not:
- Add form validation logic to `forms.css` or any CSS file
- Build a custom form submission handler — use Superforms server actions
- Add Formsnap (Superforms direct is the standard)
- Duplicate Superforms behavior in CSS or Svelte components

All form controls must support `aria-invalid`, `data-invalid`, `:disabled`, visible `:focus-visible`, help text (`.field-help`), and error text (`.field-error`).

---

## SEO rules

Full reference: [docs/seo/README.md](docs/seo/README.md)  
Page contract: [docs/seo/page-contract.md](docs/seo/page-contract.md)  
Schema guide: [docs/seo/schema-guide.md](docs/seo/schema-guide.md)

### Always

- Add every new route to `src/lib/seo/routes.ts` and declare `indexable: true` or `false`
- Add the `SEO` component to every new `+page.svelte` with `title`, `description`, and `canonicalPath`
- Use `site.ts` as the single source of truth — never hardcode domain or site name in SEO files
- Use schema helpers from `src/lib/seo/schemas.ts` — never write raw JSON-LD by hand
- Add schema only when the visible page content supports it (article schema on articles, FAQ schema on FAQ pages)
- Run `bun run check:seo` before deploying

### Never

- Do not create a public page without `title`, `description`, `canonicalPath`, and a route registry entry
- Do not hardcode `yourdomain.com`, `example.com`, or site name strings inside SEO components or schemas
- Do not mark `/styleguide`, `/admin`, `/preview`, or draft-like routes as `indexable: true`
- Do not use `$page.url.href` as the canonical URL — it leaks dev/staging URLs into production metadata
- Do not duplicate `Organization` or `WebSite` schema in individual page components — it is injected by the root layout

---

## Secrets handling

Full guide: [docs/deployment/secrets.md](docs/deployment/secrets.md)  
Decision: [ADR-013](docs/planning/adrs/ADR-013-sops-age-secrets-management.md)

### Always

- Keep real secret values in encrypted `secrets.yaml` — this is the source of truth.
- Add every new required environment variable to both `.env.example` and `secrets.example.yaml` at the same time.
- Use `sops secrets.yaml` to open, edit, and re-encrypt atomically — never edit the encrypted blob by hand.
- Treat rendered `.env` files as credential files — they are plaintext and must not be shared or committed.
- Before completing deployment-related changes, run `bun run secrets:check`.

### Never

- Never commit `.env` or any `.env.*` file except `.env.example`.
- Never commit plaintext `secrets.yaml` (without SOPS metadata). Verify encryption before committing.
- Never put real secret values in `src/lib/config/site.ts` or any module that can be imported by client-side code.
- Never import `DATABASE_URL`, `SESSION_SECRET`, API tokens, or other private secrets into `+page.svelte` or any `src/lib/` file that reaches the browser bundle.
- Never add OpenBao, Doppler, Infisical, 1Password Secrets Automation, cloud KMS, or other secret manager integrations to the template. Per-project adoptions are out of scope here and must be explicitly requested.
- Never manually decrypt `secrets.yaml` and re-encrypt it — use `sops secrets.yaml` for the full round-trip.
- Never put public-safe config (brand name, public site URL, public analytics IDs) in `secrets.yaml` — only encrypt values that are genuinely secret.

### When adding a new environment variable

Update all three of:

1. `.env.example` — add the variable name with an empty or example value
2. `secrets.example.yaml` — add the variable with a representative fake value
3. `docs/deployment/secrets.md` — add to the "What belongs in secrets" section if it is a new category

---

## Template type

**Website-first.** This template targets scrolling websites and landing pages — not dashboard applications. Normal document scrolling is the default. Do not add app-shell behaviors to the baseline.

---

## Git and build artifact policy

This repo is **Bun-first**. All package management, scripts, and tooling use Bun.

### Package management

- Install with `bun install` — never `npm install`, `npm ci`, `pnpm install`, or `yarn install`.
- Add packages with `bun add <pkg>` — never `npm install <pkg>`.
- Run scripts with `bun run <script>` — never `npm run`.
- `bun.lock` (text lockfile) **must be committed**. It is the source of truth for exact dependency versions.
- `bun.lockb` (binary lockfile, legacy) is gitignored and must never be committed.
- Never bump protected package versions (`svelte`, `@sveltejs/kit`, `vite`, `svelte-adapter-bun`, `better-auth`, etc.) without explicit approval.
- Bun uses `"resolutions"` (Yarn syntax), not `"overrides"` (silently ignored by Bun).

### Never commit these

| Path | Reason |
|------|--------|
| `node_modules/` | Installed from `bun.lock`; never source-controlled |
| `.svelte-kit/` | Generated on `bun run dev` or `svelte-kit sync`; never source-controlled |
| `build/` | Production bundle output; regenerated on every deploy |
| `dist/` | Alternative build output; same policy |
| `.env`, `.env.*` | Local secrets — use `.env.example` for safe defaults |
| `bun.lockb` | Legacy binary lockfile; this repo uses `bun.lock` |
| `static/uploads/optimized/`, `static/uploads/responsive/`, `static/uploads/generated/` | Potential generated output dirs — ignore if created |

### Image artifacts — special case

The prebuild script (`scripts/optimize-images.js`) generates `.webp` siblings next to source images in `static/uploads/`. Per [ADR-009](docs/planning/adrs/ADR-009-image-pipeline.md) and [docs/design-system/images.md](docs/design-system/images.md):

- **Source images** (`*.jpg`, `*.png`, `*.tiff`) in `static/uploads/` **may be committed** when they are intentional seed/demo assets.
- **Generated `.webp` siblings** in `static/uploads/` **are also committed** alongside their sources. This allows the site to function without a prebuild step on every checkout.
- Do not gitignore `*.webp` files in `static/uploads/`.
- `src/lib/assets/` images (Tier 1) are always committed — they are developer-owned source files.

### Validation commands

Run these before finalizing any template change:

```bash
bun install --frozen-lockfile   # verify lockfile is clean
bun run check                   # TypeScript + svelte-check
bun run images:optimize         # prebuild image pipeline (idempotent)
bun run build                   # production build
bun run check:seo               # SEO config validation
```

Or run everything at once: `bun run validate`

---

## File structure

```
src/
  app.css           entry file — layer order, font imports, design system imports
  app.html          HTML shell — title, viewport, theme-color, anti-FOUC script
  lib/
    config/
      site.ts       BRAND FILE — SEO/site config single source of truth
    seo/
      types.ts      SEO TypeScript types
      metadata.ts   canonical URL, image URL, title, robots helpers
      schemas.ts    JSON-LD schema helpers
      routes.ts     static route registry — declare all routes here
      sitemap.ts    sitemap XML generator
    styles/
      tokens.css    BRAND FILE — edit to rebrand
      reset.css     architecture — DO NOT EDIT
      base.css      architecture — DO NOT EDIT
      animations.css  architecture — add brand motion below marker
      utilities.css   architecture — add brand utilities below marker
      forms.css       architecture — add brand form overrides below marker
    components/
      seo/
        SEO.svelte  renders all head/meta/schema for a page
  routes/
    +layout.svelte          imports app.css, injects root schema
    sitemap.xml/+server.ts  prerendered sitemap
    robots.txt/+server.ts   prerendered robots.txt
    llms.txt/+server.ts     prerendered llms.txt
    styleguide/+page.svelte design system demo — keep updated
```

---

## CMS / content loading

Full reference: [docs/cms/README.md](docs/cms/README.md)  
Content contract: [docs/cms/sveltia-content-contract.md](docs/cms/sveltia-content-contract.md)  
Collection patterns: [docs/cms/collection-patterns.md](docs/cms/collection-patterns.md)

### Parser rules — never mix these

| File type | Parser | Location |
|-----------|--------|---------|
| `content/pages/*.yml` | **js-yaml** | Pure YAML, no `---` delimiters |
| `content/team/*.yml` | **js-yaml** | Pure YAML |
| `content/testimonials/*.yml` | **js-yaml** | Pure YAML |
| `content/articles/*.md` | **gray-matter** | Markdown with YAML frontmatter |

```ts
// ✓ Correct — pure YAML
import { parse } from 'js-yaml';
const data = parse(readFileSync(path, 'utf-8'));

// ✓ Correct — Markdown frontmatter
import matter from 'gray-matter';
const { data, content } = matter(raw);
return { ...data, body: content }; // remap content → body explicitly

// ✗ Wrong — never use gray-matter for pure YAML files
// ✗ Wrong — never use js-yaml for Markdown frontmatter files
```

### File-reading routes

Always use `+page.server.ts` for filesystem reads — never `+page.ts`:

```ts
// ✓ src/routes/+page.server.ts
import { loadHomePage } from '$lib/content/index';
export const load = async () => ({ home: loadHomePage() });
```

### CMS image fields

Render CMS image path strings through `CmsImage`, not bare `<img>`:

```svelte
<!-- ✓ -->
<CmsImage src={member.photo} alt={member.photo_alt ?? ''} width={400} height={400} />

<!-- ✗ -->
<img src={member.photo} alt={member.photo_alt} />
```

### CMS field naming rules

- Use `snake_case` for all YAML field names
- Do not use `content` or `data` as field names — they clash with loader conventions
- `body` is reserved for the Markdown body in articles
- Field names in `config.yml` = TypeScript interface properties = Svelte component data keys
- **Never rename a CMS field** without also updating: `config.yml`, content files, `types.ts`, loaders, components, and docs

### Adding a new collection

All six steps are required — partial completion breaks the content contract:

1. Create a starter content file in `content/{collection}/`
2. Add to `static/admin/config.yml`
3. Add TypeScript interface to `src/lib/content/types.ts`
4. Add loader and export from `src/lib/content/index.ts`
5. Wire to `+page.server.ts` route; register in `src/lib/seo/routes.ts`
6. Update `docs/cms/collection-patterns.md`

---

## n8n automation posture

Full reference: [docs/automations/README.md](docs/automations/README.md)

### Hard rules

- **Do not add n8n to `package.json`** — n8n is an external operator, not an app dependency
- **Do not import n8n packages** in any SvelteKit module
- **The site must work without n8n** — any webhook code must check `N8N_WEBHOOK_URL` and skip silently if unset
- **Do not make webhook calls blocking** — use fire-and-forget; never let n8n downtime break a form submission
- **Content automation files must match the CMS schema** — follow `static/admin/config.yml`; do not invent fields
- **AI-generated content defaults to draft** — `draft: true` for articles, `published: false` for testimonials
- **Do not commit webhook URLs or secrets** — use `.env.example` for variable names only; real values go in `secrets.yaml`
- **Production webhooks must be signed** — HMAC-SHA256 with `N8N_WEBHOOK_SECRET`

### Two automation categories

```
Content automations → n8n writes to content/ via GitHub API
Runtime automations → SvelteKit server action → Postgres → non-blocking webhook → n8n
```

Content automation writes must pass the same schema validation as a human Sveltia CMS edit. They are not a separate path.

---

## Runtime data

- Postgres is the runtime data store — not SQLite, not flat files in `content/`
- `content/` is for durable editorial content only (committed to Git, version-controlled)
- Operational data (form submissions, user accounts, session state) belongs in Postgres
- Do not introduce SQLite

---

## Before shipping

Verify against [docs/planning/08-quality-gates.md](docs/planning/08-quality-gates.md):

- `bun run build` exits 0
- `bun run check` (TypeScript) exits 0
- No `html, body { overflow: hidden }` in the baseline
- No disabled user zoom in `app.html`
- Styleguide route renders all design system primitives without errors
- All form controls pass the forms gates
- CMS fields in `config.yml` match `types.ts` interfaces
- No n8n package in `package.json`
- `N8N_WEBHOOK_URL` is in `.env.example` with an empty value
