# CMS — Sveltia + Git-Backed Content

This template uses **Sveltia CMS** as the human editor UI for Git-backed content. Content files live in `content/` and are committed to the repository. There is no separate CMS database.

---

## How it works

```
Editor → Sveltia CMS (/admin) → GitHub commit → CI rebuild → live site
    or
n8n workflow → GitHub API → commit to content/ → CI rebuild → live site
```

Both paths write the same files. Sveltia CMS and n8n are two interfaces over the same Git-backed content layer — not competitors.

---

## The three interfaces

| Interface | Who uses it | How it writes |
|-----------|------------|---------------|
| Sveltia CMS (`/admin`) | Human editors | Browser UI → GitHub commit |
| n8n | Automated workflows | GitHub API → commit |
| Developer Git workflow | Engineers | Direct commit |

---

## File locations

| Path | Purpose |
|------|---------|
| `static/admin/index.html` | Sveltia CMS admin page — loads CMS from CDN |
| `static/admin/config.yml` | CMS configuration — collections, fields, media paths |
| `content/pages/` | Singleton YAML files for specific pages |
| `content/articles/` | Markdown files with YAML frontmatter |
| `content/team/` | YAML files for team members |
| `content/testimonials/` | YAML files for testimonials |
| `static/uploads/` | CMS editor image uploads |

---

## How content becomes component data

1. Editor saves content → file committed to `content/`
2. CI rebuilds the site
3. A `+page.server.ts` route reads the file at request time using a content loader
4. The loader returns typed data to `+page.svelte`
5. The Svelte component renders the data

```
content/pages/home.yml
  → src/lib/content/pages.ts (loadHomePage)
    → src/routes/+page.server.ts (load fn)
      → src/routes/+page.svelte (render)
```

---

## Parser rules

**Pure YAML files** (`content/pages/*.yml`, `content/team/*.yml`, `content/testimonials/*.yml`) use **js-yaml**:

```ts
import { parse } from 'js-yaml';
const data = parse(readFileSync(filepath, 'utf-8'));
```

**Markdown article files** (`content/articles/*.md`) use **gray-matter**:

```ts
import matter from 'gray-matter';
const { data, content } = matter(raw);
return { ...data, body: content }; // body ← content, not data.body
```

Never use gray-matter on pure YAML files. Never use js-yaml on Markdown frontmatter files.

---

## Setting up Sveltia CMS

1. Edit `static/admin/config.yml`:
   - Set `backend.repo` to your GitHub `owner/repo`
   - Set `backend.branch` to your main branch
   - Remove or set `local_backend: false` before deploying
2. Configure GitHub OAuth — Sveltia CMS uses GitHub as the authentication provider
3. Visit `/admin` in a browser to access the editor UI

For local development with `local_backend: true`, run `npx netlify-cms-proxy-server` (or the Sveltia equivalent) to proxy file writes locally without GitHub auth.

---

## Relationship to n8n automations

Content automations in n8n write the same files that Sveltia manages. The files follow the same schema as defined in `static/admin/config.yml`. See [docs/automations/content-automation-contract.md](../automations/content-automation-contract.md) for the contract n8n must follow when writing content files.

---

## Content safety

CMS writes are treated as untrusted until validated by repo scripts. A successful save in the CMS UI does not guarantee valid content.

```bash
bun run check:cms          # validate static/admin/config.yml
bun run check:content      # validate .md content files
bun run check:content-diff # detect destructive changes before committing
```

Run these after any change to `static/admin/config.yml` or files under `content/`. They are also part of `bun run validate`.

See [docs/cms/content-safety.md](content-safety.md) for the full safety documentation and what to do when checks fail.

---

## Further reading

- [docs/cms/sveltia-guide.md](sveltia-guide.md) — frontmatter format, date fields, empty fields, field rename rules
- [docs/cms/content-safety.md](content-safety.md) — what the validation scripts check and how to respond to failures
- [docs/cms/sveltia-content-contract.md](sveltia-content-contract.md) — field naming, parser rules, component data interface
- [docs/cms/collection-patterns.md](collection-patterns.md) — how to add, modify, and remove collections
- [docs/cms/sveltia-ai-reference.md](sveltia-ai-reference.md) — how AI agents should use Sveltia's official llms.txt when editing config.yml
- [docs/automations/README.md](../automations/README.md) — n8n automation overview
