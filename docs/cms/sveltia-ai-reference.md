# Sveltia CMS — AI Reference Policy

When an AI agent edits `static/admin/config.yml`, it should consult Sveltia's official AI-readable documentation rather than relying on Netlify CMS, Decap CMS, or Static CMS examples. Those projects share surface-level YAML syntax with Sveltia but diverge on widget names, field options, and the admin entrypoint pattern.

---

## Reference files

Sveltia CMS publishes two AI-readable reference files at its own domain:

| File            | URL                                    | When to use                                                                                                                                                      |
| --------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `llms.txt`      | `https://sveltiacms.app/llms.txt`      | **Default.** Quick reference for field widgets, collection options, and backend config. Fetch this when editing `config.yml`.                                    |
| `llms-full.txt` | `https://sveltiacms.app/llms-full.txt` | **Large file.** Full documentation. Fetch only for complex config work (nested objects, custom widgets, i18n, media libraries) where `llms.txt` is insufficient. |

**Do not download or commit either file to this repo.** Always fetch the current version from the source to avoid using a stale snapshot.

---

## How to use these references

When editing `static/admin/config.yml`:

1. Fetch `https://sveltiacms.app/llms.txt` as a quick reference.
2. If `llms.txt` does not cover the feature you need, fetch `https://sveltiacms.app/llms-full.txt`.
3. Cross-check against existing collections in `static/admin/config.yml` — they are validated working examples.
4. Do **not** copy field patterns from Netlify CMS, Decap CMS, or Static CMS documentation. These differ from Sveltia in meaningful ways (widget names, `editor_components`, admin entrypoint, media handling).

---

## Trust level

Sveltia labels both llms files as **work-in-progress** and notes they may contain inaccuracies or omissions. Treat them as helpful first-pass references, not as infallible specifications.

When a llms reference conflicts with an existing working collection in `config.yml` or with behavior observed at `/admin`, prefer the working config and flag the discrepancy.

---

## Validation

After any change to `static/admin/config.yml`:

```bash
bun run check:cms          # validate config structure
bun run check:content      # validate existing content files still parse
bun run check:content-diff # detect unintended field renames or removals
```

Load `/admin` in a browser and confirm the affected collection loads without a console error. The validation scripts catch schema issues; the browser check catches runtime widget errors that static analysis misses.

---

## Disambiguation — two different llms.txt files

This repo and the sites built from it contain **both** a Sveltia reference and a site-level llms.txt. They are unrelated:

| File                              | Purpose                                             | Who reads it                                           |
| --------------------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| `https://sveltiacms.app/llms.txt` | Sveltia CMS documentation for AI coding tools       | AI agents editing `static/admin/config.yml`            |
| `src/routes/llms.txt/+server.ts`  | Public AI/SEO disclosure for the **generated site** | Crawlers and AI systems indexing the published website |

Do not conflate these. The site's own `/llms.txt` route describes the website's content and purpose. Sveltia's `llms.txt` describes the CMS tool itself. They serve different audiences and must not be merged or cross-referenced.
