# Sveltia Content Contract

The CMS configuration in `static/admin/config.yml` is a **data interface contract**, not just a UI configuration. Field names defined there become property keys throughout the stack. Treat them as a public API.

---

## Admin entrypoint rule

`static/admin/index.html` must be the minimal plain-script form:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Content Manager</title>
  </head>
  <body>
    <script src="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js"></script>
  </body>
</html>
```

Do not add:

```html
<link rel="stylesheet" href="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.css" />
```

Do not add `type="module"` to the script tag.

Sveltia CMS bundles its styles in the JavaScript file and is not distributed as an ES module. These mistakes come from confusing Sveltia CMS with Static CMS or Netlify CMS examples.

---

## The contract

```
config.yml field name
  = content file key
  = TypeScript interface property
  = Svelte component data key
```

If you rename a field in config.yml, you must also update:

1. Existing content files in `content/` (all affected files)
2. The TypeScript interface in `src/lib/content/types.ts`
3. Any content loader in `src/lib/content/`
4. Any Svelte component that reads that field
5. This doc and `docs/cms/collection-patterns.md`

Never rename a CMS field casually. The consistency is intentional.

---

## Field naming conventions

- Use `snake_case` for all YAML field names (e.g., `image_alt`, `primary_cta`, `photo_alt`)
- Avoid ambiguous names that clash with loader conventions:
  - Do **not** use `content` as a field name — gray-matter uses `.content` for the Markdown body
  - Do **not** use `data` as a field name — it shadows the parsed YAML object
  - Prefer `body` (reserved for the Markdown body), `bio`, `description`, `quote`
- Slugs should be lowercase, hyphenated (e.g., `alex-rivera`, `getting-started`)

---

## Parser rules by file type

### Pure YAML files — js-yaml

Used for: `content/pages/*.yml`, `content/team/*.yml`, `content/testimonials/*.yml`

```ts
import { parse } from 'js-yaml';
import { readFileSync } from 'node:fs';

const raw = readFileSync(filepath, 'utf-8');
const data = parse(raw);
```

These files have no `---` frontmatter delimiters. The entire file is YAML.

### Markdown frontmatter files — gray-matter

Used for: `content/articles/*.md`

```ts
import matter from 'gray-matter';
import { readFileSync } from 'node:fs';

const raw = readFileSync(filepath, 'utf-8');
const { data, content } = matter(raw);
return { ...data, body: content }; // remap content → body
```

**Critical:** gray-matter returns the Markdown body as `.content`, not `.data.body`. The loader must explicitly remap it:

```ts
// Correct
return { ...data, body: content };

// Wrong — body will be undefined
return data;
```

---

## File-reading routes

Any SvelteKit route that reads from the filesystem must use `+page.server.ts`, not `+page.ts`.

```ts
// ✓ Correct — runs server-side only
// src/routes/+page.server.ts
import type { PageServerLoad } from './$types';
import { loadHomePage } from '$lib/content/index';

export const load: PageServerLoad = async () => {
  const home = loadHomePage();
  return { home };
};
```

```ts
// ✗ Wrong — +page.ts runs in both server and browser contexts
// src/routes/+page.ts  ← do not use for filesystem reads
```

---

## Image fields

CMS image path fields hold a string like `/uploads/photo.jpg`. Render them through `CmsImage`, not a bare `<img>`:

```svelte
<!-- ✓ Correct -->
{#if member.photo}
  <figure>
    <CmsImage src={member.photo} alt={member.photo_alt ?? ''} width={400} height={400} />
  </figure>
{/if}

<!-- ✗ Wrong — bypasses WebP optimization and lazy loading defaults -->
<img src={member.photo} alt={member.photo_alt} />
```

---

## Rich text fields

Sveltia CMS `markdown` widget fields return Markdown string content. To render Markdown in Svelte, use a Markdown renderer (e.g., `marked` or `@sveltejs/markdown`) added per project. The base template does not ship a Markdown renderer — add one when the first rich-text field is consumed.

---

## Date fields

Date fields from the CMS are ISO 8601 strings (e.g., `'2026-04-27'`). Render them with `<time>`:

```svelte
<time datetime={article.date}>
  {new Date(article.date).toLocaleDateString('en-US', { dateStyle: 'long' })}
</time>
```

---

## TypeScript types

Types live in `src/lib/content/types.ts`. Every collection has a corresponding interface. Field names in the interface must exactly match the content file keys.

```ts
// src/lib/content/types.ts
export interface HomePageContent {
  title: string;
  description: string;
  hero: {
    eyebrow?: string;
    headline: string;
    // ...
  };
}
```

---

## Adding a new field to an existing collection

1. Add the field to `static/admin/config.yml` under the relevant collection
2. Add the field to the TypeScript interface in `src/lib/content/types.ts`
3. Update existing content files if the field is required (or give it a sensible default)
4. Use the field in the Svelte component
5. Update `docs/cms/collection-patterns.md`

---

## AI reference for editing config.yml

When editing `static/admin/config.yml`, consult Sveltia's official AI-readable docs rather than Netlify CMS, Decap CMS, or Static CMS examples — those projects diverge from Sveltia on widget names and entrypoint patterns.

- Quick reference: `https://sveltiacms.app/llms.txt`
- Full reference (large): `https://sveltiacms.app/llms-full.txt` — fetch only for complex config work

Do not commit either file to this repo. Sveltia labels these docs work-in-progress; treat them as helpful but not infallible. When a reference conflicts with a working collection in `config.yml`, trust the working config. See [docs/cms/sveltia-ai-reference.md](sveltia-ai-reference.md) for the full policy.
