# ADR-014 — Sveltia CMS as the Git-Backed Content System

**Status:** Accepted
**Date:** 2026-04-27

---

## Context

The template needs a content management layer that allows non-technical editors to update site copy, articles, team bios, and other durable editorial content without requiring direct Git access or developer involvement for every change.

Requirements:
- Content must be version-controlled in Git (no separate CMS database)
- Non-technical editors need a browser UI that does not require understanding Git
- Content files must be machine-readable for automation (n8n, CI scripts)
- The site must rebuild automatically when content changes
- The solution must work with the existing Bun + SvelteKit + GitHub + Podman stack
- TypeScript types and Svelte components must have a stable interface to the content shape

An additional consideration: n8n automations must be able to write the same content files that human editors write. The CMS schema and the automation write contract must be the same artifact.

## Decision

Adopt **Sveltia CMS** as the default human editing UI for Git-backed content in this template.

- Sveltia CMS admin files live in `static/admin/` (`index.html` + `config.yml`)
- Content files live in `content/` (pure YAML for pages/team/testimonials; Markdown with frontmatter for articles)
- `static/admin/config.yml` is the definitive schema for all CMS-managed collections
- The schema in `config.yml` is the component data contract — field names flow through to TypeScript types and Svelte components unchanged
- **Pure YAML files** (`content/pages/*.yml`, etc.) are parsed with `js-yaml` — never with `gray-matter`
- **Markdown frontmatter files** (`content/articles/*.md`) are parsed with `gray-matter`; the body is remapped from `.content` to `.body` explicitly
- All filesystem reads happen in `+page.server.ts` routes — never in `+page.ts` (which runs in both server and browser contexts)
- CMS image path fields render through `CmsImage`, not bare `<img>` tags
- YAML field names use `snake_case`

## Consequences

**Positive:**
- Zero separate CMS server or database — content is just committed files
- Full Git history for all content changes, including rollback and blame
- Content files are human-readable YAML/Markdown — easy for automations to generate
- Sveltia CMS is Decap-compatible, giving access to a large body of existing configuration examples
- The template's content schema is explicit and version-controlled alongside the code

**Negative / tradeoffs:**
- GitHub OAuth must be configured before the Sveltia editor UI works
- Content changes trigger a full site rebuild (acceptable for most editorial workflows; not suitable for real-time user-generated content — that goes in Postgres)
- Sveltia CMS is a younger project than Decap/Netlify CMS; some edge-case widgets may behave differently

## Alternatives considered

- **Decap CMS (Netlify CMS):** More established but tied to Netlify's ecosystem. Sveltia is a drop-in replacement with active development and a compatible config format.
- **Sanity / Contentful / Hygraph:** Hosted CMS databases that require an external API call at render time. Adds a runtime dependency, a monthly cost, and a new failure mode. Against the "Git as source of truth" principle.
- **MDsveX + manual Markdown:** Suitable for developer-managed content. Does not give non-technical editors a browser UI without custom tooling.
- **Tina CMS:** Git-backed like Sveltia but requires a Tina Cloud account for the production editor. Adds an external dependency not aligned with the self-hosted posture of this template.

## Implementation notes

- Admin UI: `static/admin/index.html` — loads Sveltia CMS from CDN
- Config: `static/admin/config.yml` — collections, fields, media paths
- Content loaders: `src/lib/content/pages.ts`, `src/lib/content/articles.ts`
- Types: `src/lib/content/types.ts`
- Public API: `src/lib/content/index.ts`
- Homepage route: `src/routes/+page.server.ts` loads `content/pages/home.yml`
- Docs: `docs/cms/` — README, sveltia-content-contract.md, collection-patterns.md

## Revisit triggers

- If Sveltia CMS development stalls or the project is abandoned
- If a project requires real-time collaborative editing (consider a hosted CMS instead)
- If the content authoring team scales to a size where PR-based review of every change becomes a bottleneck
