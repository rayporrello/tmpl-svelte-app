# Optional Modules

This registry documents every optional module available in this template. Every module is **dormant by default** — no runtime cost, no installed dependency unless explicitly activated.

The core template (SvelteKit, CSS, Postgres, Drizzle, forms, SEO, CMS, observability) is always on. See [ADR-002](../planning/adrs/ADR-002-core-plus-dormant-modules.md) for the core/module boundary decision.

---

## Module registry

| Module                                       | Status                     | When to use                                                            | Activation summary                                                 | Required env vars                                                                         | Docs                                                     |
| -------------------------------------------- | -------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [Search (Pagefind)](#search-pagefind)        | Not installed              | 10+ pages/articles; users need to find content                         | Install `pagefind`, pre-render content routes, add `/search` route | None                                                                                      | [pagefind.md](pagefind.md)                               |
| [Cookie consent](#cookie-consent)            | Seam installed, UI dormant | Using GTM/GA4/ad tags with users in GDPR/CCPA jurisdictions            | Import `ConsentBanner.svelte` into root layout                     | None                                                                                      | [cookie-consent.md](cookie-consent.md)                   |
| [R2 image storage](#r2-image-storage)        | Not installed              | Large media library, CDN delivery, or multi-instance deployment        | Wire S3 client, set bucket env vars, update upload handler         | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | [r2-images.md](r2-images.md)                             |
| [Better Auth](#better-auth)                  | Not installed              | User accounts, member areas, gated pages, admin portal                 | Install `better-auth`, run migration, add auth routes              | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`                                                   | [better-auth.md](better-auth.md)                         |
| [PWA / service worker](#pwa--service-worker) | Not applicable             | App-like offline experience explicitly required                        | Add `src/service-worker.ts` with cache strategy per project        | None                                                                                      | [ADR-020](../planning/adrs/ADR-020-pwa-no-by-default.md) |
| [Newsletter](#newsletter)                    | Not installed              | Email list integration (Mailchimp, ConvertKit, Resend Audiences, etc.) | Add newsletter form + provider API call; reuse form seam           | Provider-specific                                                                         | —                                                        |
| [Visual regression](#visual-regression)      | Not applicable             | Pixel-accurate UI regression is a stated requirement                   | Add Playwright screenshot assertions as a separate CI job          | None                                                                                      | —                                                        |
| [Generated OG images](#generated-og-images)  | Not applicable             | Per-page dynamic share images beyond the default fall-through          | Add OG image endpoint; wire into SEO component                     | None                                                                                      | —                                                        |

---

## Search (Pagefind)

**Status:** Not installed — see [pagefind.md](pagefind.md) for full activation.

Pagefind is a static, build-output-based search library. It indexes pre-rendered HTML at build time and delivers search results with a small JS bundle. No backend service, no database query — just a build step.

**Use when:** The site has 10+ indexable pages or articles and users genuinely need to find content across them. A sitemap nav is insufficient.

**Skip when:** The site is 5–10 pages, a nav covers discovery, or content pages cannot be pre-rendered.

---

## Cookie consent

**Status:** Google Consent Mode v2 seam installed at `src/lib/analytics/consent.ts`. Dormant UI at `src/lib/privacy/ConsentBanner.svelte` and `src/lib/privacy/ManageConsent.svelte`. See [cookie-consent.md](cookie-consent.md).

The template ships typed consent helpers. The banner UI is available but not imported — most small informational sites do not need one.

**Use when:** Your site uses GTM/GA4/ad tags and users are in EU/EEA/UK (GDPR), California (CCPA), Brazil (LGPD), or similar jurisdictions. Ad targeting always requires consent.

**Skip when:** You use Cloudflare Web Analytics only (no cookies, no fingerprinting), or legal review confirms no consent banner is required.

---

## R2 image storage

**Status:** Not installed — see [r2-images.md](r2-images.md).

Cloudflare R2 is an S3-compatible object store for media uploads. The current pipeline serves uploads from `static/uploads/` — simple and sufficient for most small sites.

**Use when:** Uploads would exceed server disk, you need edge CDN delivery, or the app runs on multiple instances (disk not shared).

**Skip when:** The site has modest media requirements and runs on a single server with adequate storage.

---

## Better Auth

**Status:** Not installed — see [better-auth.md](better-auth.md) for the recipe.

Better Auth is a TypeScript auth library built for SvelteKit. It layers on the existing Postgres/Drizzle foundation.

**Use when:** The site needs user accounts, member-gated pages, an admin login, or a customer portal.

**Skip when:** The site is entirely public-facing with no user accounts.

---

## PWA / service worker

**Status:** Web app manifest (`static/site.webmanifest`), icons, and `theme-color` are included. Service worker is intentionally absent. See [ADR-020](../planning/adrs/ADR-020-pwa-no-by-default.md).

**Use when:** The site must work offline, users need home-screen installation, and you have a deliberate cache strategy and stale-content UX plan.

**Skip when:** The site is a normal marketing or content site where offline capability is not a stated requirement.

---

## Newsletter

**Status:** Not installed.

A newsletter form collects email addresses and calls a list provider's API. The existing contact form seam (`src/lib/server/forms/`) is the starting point — add a `newsletter` Valibot schema and a provider client.

**Use when:** The site collects subscribers for regular email communication.

---

## Visual regression

**Status:** Not applicable. Playwright + axe smoke tests cover functional and accessibility regressions.

Screenshot regression testing is **not** part of `bun run validate` because diffs are noisy across environments and require a disciplined golden-baseline workflow.

**Use when:** The design is locked and pixel-accurate regression detection is a stated business requirement.

**How to add:**

1. Add `toHaveScreenshot()` assertions to a separate `tests/visual/` directory (Playwright built-in).
2. Commit golden screenshots (`tests/visual/snapshots/`) after deliberate review.
3. Run as a separate CI job, not as part of `validate`.
4. Update goldens intentionally using `--update-snapshots`.

---

## Generated OG images

**Status:** Not installed. The default fall-through chain requires no code.

**Default behavior (no code needed):**

- Articles: `og_image` frontmatter → `image` (feature image) → `site.defaultOgImage`
- Pages: `<SEO image="...">` → `site.defaultOgImage`

The article feature image becomes the share image automatically. Most sites do not need generated OG images.

**Use when:** Per-page branded share cards are a marketing requirement (e.g., blog previews on social media with dynamic text or data).

**How to add:** Create `src/routes/og/[slug]/+server.ts` that returns a PNG using `@vercel/og` or similar. Wire it into the SEO component as `og:image`. Document your cache strategy.
