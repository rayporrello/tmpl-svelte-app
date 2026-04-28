# Search — Pagefind

Pagefind is a static, build-output-based search library. It indexes pre-rendered HTML at build time and delivers search results with a small JavaScript bundle served from the same host. No search backend, no database query, no external API.

---

## When to use

**Use Pagefind when:**

- The site has 10+ indexable pages or articles and users need to find content across them.
- A nav or article list is insufficient for content discovery.
- You prefer no search infrastructure to operate or pay for.

**Skip Pagefind when:**

- The site is 5–10 pages — a well-structured nav is sufficient.
- Content pages are fully server-rendered without pre-rendering (Pagefind requires static HTML files).
- You already use an external search provider (Algolia, Typesense, etc.).

---

## How Pagefind works

1. After `bun run build`, Pagefind crawls the pre-rendered HTML files in the build output.
2. It builds a search index stored alongside the build output.
3. The Pagefind JS client fetches that index from the browser and returns results locally.
4. The index travels with the site — no external search API calls, no latency from a third-party server.

**Key requirement:** Pages must be **pre-rendered to static HTML** for Pagefind to index them. SvelteKit's `prerender` page option controls this per route.

---

## Activation steps

### 1. Install Pagefind

```bash
bun add -d pagefind
```

### 2. Mark content routes for pre-rendering

In `src/routes/articles/[slug]/+page.server.ts`:

```ts
export const prerender = true;
```

In `src/routes/articles/+page.server.ts` (the index page):

```ts
export const prerender = true;
```

Add `prerender = true` to any other routes you want indexed (about, services pages, etc.).

Verify after build:

```bash
bun run build
# Check that HTML files are present in the prerendered output
```

### 3. Add the `search:index` script to `package.json`

```json
"search:index": "pagefind --site <your-prerendered-output-path>"
```

The exact output path depends on your adapter configuration. With `svelte-adapter-bun`, pre-rendered pages typically appear in the build output alongside the server bundle. Check the official SvelteKit docs for your adapter's prerender output location.

Run after every build:

```bash
bun run build && bun run search:index
```

### 4. Add a search route

Create `src/routes/search/+page.svelte`:

```svelte
<script lang="ts">
	import { onMount } from 'svelte';

	onMount(async () => {
		// Pagefind UI bundle is generated at build time — not a listed npm dependency.
		// @ts-ignore
		const { PagefindUI } = await import('/pagefind/pagefind-ui.js');
		new PagefindUI({ element: '#search', showImages: false });
	});
</script>

<svelte:head>
	<link rel="stylesheet" href="/pagefind/pagefind-ui.css" />
</svelte:head>

<main>
	<h1>Search</h1>
	<div id="search"></div>
</main>
```

Register in `src/lib/seo/routes.ts`:

```ts
{ path: '/search', indexable: true, priority: 0.5 },
```

Add a link to `/search` in your site navigation.

### 5. Wire it into CI

Add to `.github/workflows/ci.yml` after the build step:

```yaml
- name: Index search
  run: bun run search:index
```

---

## Controlling what Pagefind indexes

Pagefind indexes the full page text by default. Use HTML data attributes to refine:

```html
<!-- Index only this element (everything else on the page is excluded): -->
<article data-pagefind-body>...</article>

<!-- Exclude from the index: -->
<nav data-pagefind-ignore>...</nav>
<footer data-pagefind-ignore>...</footer>

<!-- Custom metadata attached to a result: -->
<time data-pagefind-meta="date">2026-04-28</time>
<span data-pagefind-meta="author">Ray</span>
```

For article routes, wrapping the article body with `data-pagefind-body` prevents nav, header, and footer text from polluting the index.

---

## Custom search UI

The Pagefind JS API is available for a fully custom search UI if the default Pagefind UI does not match your design system:

```ts
import('/pagefind/pagefind.js').then(async (pagefind) => {
	const search = await pagefind.search('query');
	const results = await Promise.all(search.results.map((r) => r.data()));
	// results is an array of { url, meta, content, excerpt, ... }
});
```

---

## Important notes

- **`validate` does not depend on Pagefind.** The `search:index` step produces a build artifact — it does not block `bun run validate` or PR CI.
- **Do not commit the search index.** The index lives in the build output, which is already gitignored.
- **The `/search` route itself should not be pre-rendered.** It is client-rendered — leave out `prerender = true` on the search route.
- **Test locally** by running `bun run build && bun run search:index && bun run preview` and verifying search returns results.

---

## References

- Official docs: [pagefind.app](https://pagefind.app)
- SvelteKit pre-rendering: [kit.svelte.dev/docs/page-options#prerender](https://kit.svelte.dev/docs/page-options#prerender)
- Module registry: [docs/modules/README.md](README.md)
