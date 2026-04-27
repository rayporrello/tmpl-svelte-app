# Content & Data Model

Because this template replaces systems like WordPress, it must clearly define how content and data are stored, retrieved, and managed. We utilize a strict "Split-State" architecture: Editorial Content vs. Runtime Data.

## SEO metadata

SEO metadata for each page (title, description, canonical, schema) is code, not content. It lives in the route's `+page.svelte` via the `SEO` component and is controlled by developers, not editors.

Site-level SEO configuration (domain, name, org, OG image) lives in `src/lib/config/site.ts`. This file must be updated when forking the template for a new project. See [docs/seo/README.md](../seo/README.md).

Editorial content (blog posts, landing page copy) may include SEO-relevant data that gets passed to the SEO component at render time — for example, a blog post's title and description loaded from a content file. The SEO component is the single place that renders `<title>`, `<meta description>`, and JSON-LD schema — never add these directly in `app.html` or layout-level scripts.

---

## 1. Editorial Content (Git-Backed)
* **What it is:** Blog posts, landing page copy, FAQs, privacy policies, team bios.
* **The Tool:** Sveltia CMS + Markdown/MDX + SvelteKit.
* **How it works:**
  * Sveltia CMS provides a user-friendly admin interface at `/admin`.
  * When a post is written, Sveltia commits a Markdown file directly to the GitHub repository.
  * Because this is a code change, GitHub Actions automatically rebuilds the SvelteKit app and pushes the update to the public server.
* **Why this way:** It makes content completely immutable. You get full version control, no database queries to render a blog post, perfect performance, and zero risk of losing articles if a database corrupts.

## 2. Runtime Data (Database-Backed)
* **What it is:** User accounts, waitlist signups, user-generated comments, e-commerce transactions, SaaS application state.
* **The Tool:** Postgres (in Podman) + Drizzle ORM.
* **How it works:**
  * SvelteKit Server Actions (`+page.server.ts`) read and write to Postgres.
  * The database maintains state independently of the application deployments.
  * It is backed up nightly to Cloudflare R2.
* **Why this way:** Relational data requires transactional integrity, rapid querying, and continuous mutation that Git cannot provide.

## 3. Automation Data (n8n-Backed)

n8n is an **optional, external** automation operator. It is not a package dependency in the SvelteKit app. The site must function correctly whether or not n8n is running.

n8n interacts with the template through two interfaces:

### 3a. Content automations (Git-backed)
* **What it is:** Automated workflows that create or update files in `content/` — the same files that Sveltia CMS manages.
* **The Tool:** n8n (self-hosted in Podman), using its GitHub node or HTTP Request node to call the GitHub API.
* **How it works:**
  * An external trigger (HR system, review platform, monitoring tool) fires a webhook into n8n.
  * n8n formats a content file (YAML or Markdown) following the collection schema in `static/admin/config.yml`.
  * n8n commits the file to the GitHub repository via the GitHub API.
  * CI rebuilds the site automatically.
* **Key rule:** Content automation writes must follow the exact schema defined in `static/admin/config.yml`. AI-generated content must default to `draft: true` or `published: false`. See [docs/automations/content-automation-contract.md](../automations/content-automation-contract.md).

### 3b. Runtime automations (webhook-based, Phase 5)
* **What it is:** Background jobs, third-party API integrations, automated email sequences triggered by user actions.
* **The Tool:** n8n (in Podman).
* **How it works:**
  * SvelteKit server actions save to Postgres, then emit a typed webhook event to n8n (non-blocking).
  * n8n handles downstream tasks (email, CRM update, Slack alert, etc.).
  * n8n stores its own execution logs in its internal database.
  * Webhook delivery failures must not break user-facing form submissions.
* **Not yet implemented.** Phase 5 will add the webhook emitter and typed event shape. See [docs/automations/runtime-event-contract.md](../automations/runtime-event-contract.md).

## 4. Media and File Assets
* **Static Site Assets:** Logos, UI icons, and core site imagery live in the git repository (`static/` and `src/lib/assets/`) and are deployed with the code. Use `<enhanced:img>` for build-time assets. See [docs/design-system/images.md](../design-system/images.md).
* **CMS/User Uploads:** Images uploaded via Sveltia CMS go to `static/uploads/`. The prebuild script generates `.webp` siblings. Use `<CmsImage>` to render uploads. Future projects may redirect uploads to cloud storage (Cloudflare R2, etc.) — that is a per-project decision, not a template default.
