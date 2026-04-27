# Collection Patterns

Reference for working with the four base collections and for adding new ones.

---

## Base collections

### pages

| Property | Value |
|----------|-------|
| Path | `content/pages/` |
| Format | Pure YAML (no frontmatter delimiters) |
| Parser | `js-yaml` |
| CMS type | Files collection (singleton files) |
| Loader | `src/lib/content/pages.ts` → `loadPage()` / `loadHomePage()` |

Each file is a specific page (e.g., `home.yml`, `about.yml`). The CMS config lists them individually under `files:`.

**Automation-safe writes:** Deterministic data sync is safe for direct-to-main writes. AI-generated copy should go to a branch/PR for editorial review.

---

### articles

| Property | Value |
|----------|-------|
| Path | `content/articles/` |
| Format | Markdown with YAML frontmatter |
| Parser | `gray-matter` |
| CMS type | Folder collection |
| Loader | `src/lib/content/articles.ts` → `loadArticle()` / `loadArticles()` |

Each file is a Markdown article. The `body` field is the Markdown content below the `---` delimiters, remapped from gray-matter's `.content` property.

**Automation-safe writes:** AI-generated article drafts should use `draft: true` and target a branch or PR. Never auto-publish AI copy directly to main without review.

---

### team

| Property | Value |
|----------|-------|
| Path | `content/team/` |
| Format | Pure YAML |
| Parser | `js-yaml` |
| CMS type | Folder collection |
| Loader | Add `loadTeam()` to `src/lib/content/pages.ts` pattern when needed |

Each file is a team member. `order` controls display order. `active: false` hides the member.

**Automation-safe writes:** HR/onboarding automation creating a new team member file is deterministic and safe for direct-to-main. Removals should use `active: false` rather than deleting files.

---

### testimonials

| Property | Value |
|----------|-------|
| Path | `content/testimonials/` |
| Format | Pure YAML |
| Parser | `js-yaml` |
| CMS type | Folder collection |
| Loader | Add `loadTestimonials()` when needed |

Each file is a testimonial. `published: false` hides it from the live site. An automation can create testimonials with `published: false` for editorial review.

**Automation-safe writes:** Auto-collected testimonials (from review platforms, surveys) should default to `published: false` and require human approval before going live.

---

## Adding a new collection

Follow all six steps. Partial completion breaks the content contract.

### Step 1 — Create a starter content file

```yaml
# content/jobs/sample-job.yml
title: Senior Engineer
slug: senior-engineer
department: Engineering
location: Remote
type: full-time
description: A brief role description.
draft: true
```

### Step 2 — Add to static/admin/config.yml

```yaml
- name: jobs
  label: Jobs
  folder: content/jobs
  create: true
  slug: '{{fields.slug}}'
  extension: yml
  format: yaml
  fields:
    - { label: Title, name: title, widget: string }
    - { label: Slug, name: slug, widget: string }
    - { label: Department, name: department, widget: string }
    - { label: Location, name: location, widget: string }
    - { label: Type, name: type, widget: select, options: [full-time, part-time, contract] }
    - { label: Description, name: description, widget: text }
    - { label: Draft, name: draft, widget: boolean, default: true }
```

### Step 3 — Add a TypeScript interface to src/lib/content/types.ts

```ts
export interface Job {
  title: string;
  slug: string;
  department: string;
  location: string;
  type: 'full-time' | 'part-time' | 'contract';
  description: string;
  draft: boolean;
}
```

### Step 4 — Add a loader function

For pure YAML collections, follow the pattern in `src/lib/content/pages.ts`:

```ts
import type { Job } from './types.js';

export function loadJobs(): Job[] {
  const dir = join(process.cwd(), 'content', 'jobs');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yml'))
    .map((f) => parse(readFileSync(join(dir, f), 'utf-8')) as Job)
    .filter((j) => !j.draft)
    .sort((a, b) => a.title.localeCompare(b.title));
}
```

Export from `src/lib/content/index.ts`.

### Step 5 — Wire to a route

```ts
// src/routes/jobs/+page.server.ts
import type { PageServerLoad } from './$types';
import { loadJobs } from '$lib/content/index';

export const load: PageServerLoad = async () => {
  return { jobs: loadJobs() };
};
```

Register the route in `src/lib/seo/routes.ts`.

### Step 6 — Update docs

- Add the collection to `docs/cms/collection-patterns.md` (this file)
- Note the automation-safe write policy
- Update `AGENTS.md` if there are agent-specific rules for this collection

---

## Removing a collection

1. Remove from `static/admin/config.yml`
2. Remove the TypeScript interface from `types.ts`
3. Remove the loader from the relevant file and from `index.ts`
4. Remove the route's `+page.server.ts` load call
5. Remove the route entry from `src/lib/seo/routes.ts`
6. Archive or delete the content files from `content/`
7. Update docs
