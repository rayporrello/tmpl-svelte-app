# Content & Data Model

Because this template replaces systems like WordPress, it must clearly define how content and data are stored, retrieved, and managed. We utilize a strict "Split-State" architecture: Editorial Content vs. Runtime Data.

## 1. Editorial Content (Git-Backed)
* **What it is:** Blog posts, landing page copy, FAQs, privacy policies, team bios, and SEO metadata.
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
* **What it is:** Background jobs, third-party API webhooks, automated email dispatch sequences.
* **The Tool:** n8n (in Podman).
* **How it works:**
  * n8n listens for webhooks from SvelteKit (e.g., "New Waitlist User").
  * n8n stores its own execution logs in its internal database.
  * n8n is granted access to the Postgres database if it needs to update records (e.g., marking a user as "Email Sent").

## 4. Media and File Assets
* **Static Site Assets:** Logos, UI icons, and core site imagery live in the git repository (`/static` folder) and are deployed with the code.
* **CMS/User Uploads:** Any images uploaded via Sveltia or by users are configured to upload directly to Cloudflare R2, keeping the server's local disk perfectly clean and stateless.
