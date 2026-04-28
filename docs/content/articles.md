# Articles

Articles live in `content/articles/*.md` as Markdown files with YAML frontmatter.

## Required frontmatter

```yaml
---
title: Getting Started
slug: getting-started
description: A short summary for listings, SEO, and RSS.
date: '2026-04-27'
draft: true
image: ''
image_alt: ''
og_image: ''
og_image_alt: ''
---
```

## Filename and slug

The filename must match `slug` exactly:

```text
content/articles/getting-started.md
slug: getting-started
```

This rule applies to drafts too. Draft exemptions create broken publish-time behavior.

## Publishing

`draft: true` excludes the article from public output. `draft: false` includes it in:

- `/articles`
- `/articles/[slug]` prerender entries
- `/sitemap.xml`
- `/llms.txt`
- `/rss.xml`

Published articles cannot use future dates in the base template. Scheduled publishing requires a scheduled rebuild workflow and a deliberate validator policy change.

## Images

`image` and `og_image` are optional. Blank values are treated as omitted. When `image` is set, `image_alt` is required. When `og_image` is set, `og_image_alt` is required.

When both image fields are omitted, article SEO falls back to `site.defaultOgImage`.
