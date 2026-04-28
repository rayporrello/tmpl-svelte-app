# Examples

`src/routes/examples/` is a copyable reference of common page archetypes for real website builds. Every page under `/examples` is `noindex, nofollow` and is enforced by `scripts/check-seo.ts` — these pages must never ship to production search results.

## What's in here

| Path                                 | Archetype                | Use it for                                        |
| ------------------------------------ | ------------------------ | ------------------------------------------------- |
| `/examples`                          | Index                    | Browsing the library                              |
| `/examples/homepage`                 | Marketing homepage       | Hero + value props + social proof + CTA           |
| `/examples/about`                    | About page               | Story, values, team                               |
| `/examples/services`                 | Services landing         | Directory of service offerings                    |
| `/examples/services/example-service` | Service detail           | Outcomes, process, sidebar pricing, CTA           |
| `/examples/pricing`                  | Pricing                  | Three-tier table with featured plan               |
| `/examples/blog`                     | Blog landing             | Featured article + reverse-chronological list     |
| `/examples/contact`                  | Contact (layout)         | Mirrors `/contact` without the live form behavior |
| `/examples/faq`                      | FAQ                      | Accessible `<details>` disclosure pattern         |
| `/examples/testimonials`             | Testimonials section     | Quote cards in a responsive grid                  |
| `/examples/cta`                      | Call-to-action band      | Three variants — bold, split, quiet               |
| `/examples/legal`                    | Privacy / legal skeleton | Long-form prose with TOC anchors                  |

## How to copy one into a real route

Most archetypes are a single `+page.svelte` file. The flow is:

1. **Pick the example** that's closest to what you want.
2. **Copy the file** into the real route — for example,
   `src/routes/examples/about/+page.svelte` → `src/routes/about/+page.svelte`.
3. **Register the route** in [src/lib/seo/routes.ts](../../src/lib/seo/routes.ts):
   ```ts
   { path: '/about', indexable: true, changefreq: 'monthly', priority: 0.8 }
   ```
4. **Remove the noindex override** from the SEO call:
   ```diff
     <SEO seo={{
       title: 'About',
       description: '...',
       canonicalPath: '/about',
   -   robots: 'noindex, nofollow',
     }} />
   ```
5. **Update the canonical path** so it matches the new location (e.g. `/about` instead of `/examples/about`).
6. **Replace the placeholder content** — copy, links, images.
7. **Wire in real data** if the example uses inline arrays. Move them into a content file under `content/` and load them through a `+page.server.ts`. See [docs/cms/](../cms/README.md) for the content layer.
8. **Optionally delete the example** from `src/routes/examples/` if you no longer need it as reference. The library is meant to shrink as your real site grows.

## Before launch

The `/examples` directory is fine to ship in dev — it's `noindex, nofollow` everywhere — but most teams delete it before going live to keep the bundle small. To remove it:

```bash
rm -rf src/routes/examples
```

Then remove `'/examples'` from the entries in [src/lib/seo/routes.ts](../../src/lib/seo/routes.ts) and the dev-only nav link in [src/routes/+layout.svelte](../../src/routes/+layout.svelte).

`bun run validate` will keep passing — the route registry rule for `/examples` only applies to entries that exist.

## Conventions every example follows

- Uses `Section.svelte` for major page bands and the `container` width modifiers (`narrow`, `wide`, `full`).
- Reads spacing, colour, and type from tokens in `src/lib/styles/tokens.css` — never hard-coded values.
- Uses semantic HTML (`<article>`, `<section>`, `<aside>`, `<nav>`, `<figure>`, `<details>`) over generic `<div>` wrappers.
- Buttons use the `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-ghost` utility classes from `src/lib/styles/utilities.css`.
- All interactive elements have visible focus states (the global `:focus-visible` rule in `base.css`).
- Headings start at `<h1>` per page and never skip levels.
- Page-scoped CSS lives in the same `+page.svelte` file inside a `<style>` block — there are no per-archetype CSS files.

## Adding a new example

1. Create `src/routes/examples/<name>/+page.svelte` and follow the conventions above.
2. Set `robots: 'noindex, nofollow'` in the SEO call.
3. Add an entry to the `examples` array in [src/routes/examples/+page.svelte](../../src/routes/examples/+page.svelte) so it appears in the index.
4. The route registry entry is not required — `/examples` is already covered as a noindex prefix.

## Why these are kept separate from the styleguide

`/styleguide` documents the **design system** — typography, colours, components, semantic HTML rules. `/examples` documents **page-level patterns** — how those pieces compose into a hero, a pricing table, an FAQ. They serve different jobs and shouldn't be folded together.
