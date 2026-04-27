# Markdown Renderer

`src/lib/content/markdown.ts` — the template's sanitized Markdown renderer.

## Stack

- **Parser:** [`marked`](https://marked.js.org/) (v18+, synchronous)
- **Sanitizer:** [`sanitize-html`](https://github.com/apostrophecms/sanitize-html) — chosen as the fallback after `@aloskutov/dompurify-node` returned 404 on npm

## Usage

```typescript
import { renderMarkdown } from '$lib/content/markdown';

const html = renderMarkdown(article.body);              // tier: 'local' (default)
const html = renderMarkdown(article.body, 'cms');       // CMS-authored content
const html = renderMarkdown(userComment, 'user');        // End-user-submitted
```

The function is synchronous and returns a sanitized HTML string.

---

## Trust Model

Three tiers control how aggressively output is sanitized.

| Tier | Who authors it | Sanitization | Use cases |
|------|----------------|--------------|-----------|
| `'local'` | Developers, committed to git | Permissive (allows headings, images, code, details) | `content/articles/`, `content/pages/` |
| `'cms'` | Sveltia CMS editors, committed to git | Same as `local` (CMS content goes through git, not a database) | Article body from the CMS editor |
| `'user'` | End users (contact forms, comments) | Strict (only `p`, `strong`, `em`, `a`, `ul`, `ol`, `li`, `code`) | Form submissions — do not render user content at `'local'` trust |

### Why local and cms have the same trust level

Sveltia CMS commits content to the git repository as files. This means CMS-authored content is equivalent to developer-authored content in terms of review path (it goes through GitHub, can be reverted). Use `'cms'` as a semantic signal; it resolves to the same allow-list as `'local'`.

### Never render user-submitted content at `'local'` or `'cms'` trust

Even after sanitization, the `'local'` allow-list permits `<script>` execution paths (via allowed attributes like `href` with `javascript:` — though `javascript:` is excluded from `allowedSchemes`). Use `'user'` for any content that comes from a form or external source.

---

## Renderer Behaviors

### Heading IDs

Every heading gets a deterministic `id` attribute computed from the heading text:

```markdown
## What you will find here
```
```html
<h2 id="what-you-will-find-here">What you will find here</h2>
```

The slug is lowercase, uses hyphens for spaces, strips non-word characters. IDs are stable as long as the heading text is unchanged — suitable for deep links.

### External Links

Links to `http://` or `https://` origins get `target="_blank" rel="noopener noreferrer"` automatically:

```markdown
[Read more](https://example.com)
```
```html
<a href="https://example.com" target="_blank" rel="noopener noreferrer">Read more</a>
```

Internal links (`/path`, `#anchor`) are not modified.

### Code Blocks

Fenced code blocks emit a `language-*` class for syntax highlighter integration:

````markdown
```typescript
const x = 1;
```
````
```html
<pre><code class="language-typescript">const x = 1;</code></pre>
```

If no language is specified, no class is added.

### Raw HTML

Raw HTML passthrough is not disabled at the parser level. `sanitize-html` removes unsafe tags in the post-parse step. The net effect is that raw HTML in content files is neutralized before rendering — `<script>` and `<iframe>` tags are stripped, `javascript:` href schemes are disallowed.

---

## Sanitization Allow-lists

### Trusted (local / cms)

Extends `sanitize-html` defaults with:
- **Tags:** `h1`–`h6`, `img`, `figure`, `figcaption`, `details`, `summary`, `pre`
- **Attributes:** `id` and `class` on any element; `target` and `rel` on `<a>`; `src`, `alt`, `width`, `height`, `loading` on `<img>`; `class` on `<pre>` and `<code>`
- **Schemes:** `http`, `https`, `mailto`

### User (strict)

Only allows:
- **Tags:** `p`, `br`, `strong`, `em`, `a`, `ul`, `ol`, `li`, `blockquote`, `code`
- **Attributes:** `href` on `<a>` only
- **Schemes:** `https` only

---

## Extending

To add a new renderer behavior (e.g. table captions, custom callouts), extend the `ContentRenderer` class in `src/lib/content/markdown.ts`. All overrides have access to `this.parser.parseInline(token.tokens)` for rendering inline content within a custom block.

To widen the sanitization allow-list for a specific project (e.g. to allow `<video>` or `<iframe>` for trusted embeds), edit `TRUSTED_SANITIZE` in the same file.
