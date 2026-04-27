# Content Automation Contract

Rules that any automation (n8n or otherwise) must follow when writing files to `content/`. Violations break the CMS UI, TypeScript types, and Svelte components simultaneously.

---

## The contract

n8n content automations must write files that are **structurally identical** to what a human editor would produce through Sveltia CMS. The source of truth for the required structure is `static/admin/config.yml`.

---

## Hard rules

### 1. Follow the collection schema

Every field written to a content file must exist in `static/admin/config.yml` under the corresponding collection. Do not invent new fields without also updating the config, TypeScript types, loaders, and components.

### 2. Use the correct file format

| Collection | Format | Extension |
|-----------|--------|-----------|
| `content/pages/` | Pure YAML (no `---` delimiters) | `.yml` |
| `content/articles/` | Markdown with YAML frontmatter | `.md` |
| `content/team/` | Pure YAML | `.yml` |
| `content/testimonials/` | Pure YAML | `.yml` |

### 3. Use lowercase hyphenated slugs

```
# ✓ Correct
content/team/alex-rivera.yml
content/articles/getting-started.md

# ✗ Wrong
content/team/Alex_Rivera.yml
content/articles/GettingStarted.md
```

### 4. Default AI content to draft/review

Any file written by an AI node must include a draft or unpublished flag:

```yaml
# For articles
draft: true

# For testimonials
published: false
```

Do not auto-publish AI-generated content without explicit human approval.

### 5. Do not write to protected paths

Automations may only write to `content/`. They must not write to:
- `src/` — application source code
- `static/` (except `static/uploads/` for images)
- `docs/`
- Configuration files (`svelte.config.js`, `vite.config.ts`, etc.)

---

## Recommended branch strategy

| Write type | Target | Rationale |
|-----------|--------|-----------|
| Deterministic data (team member, service listing) | `main` directly | Low risk, predictable structure |
| AI-generated copy (article drafts, descriptions) | Branch + PR | Human review before publish |
| Collected user content (testimonials, reviews) | `published: false` + branch + PR | Editorial gatekeeping |
| Removals | Branch + PR unless pre-approved | Destructive changes need review |

---

## What happens when the contract is violated

| Violation | Symptom |
|-----------|---------|
| Unknown field added | TypeScript error on next build |
| Wrong format (YAML vs frontmatter) | Parse error at runtime |
| Wrong extension | Loader silently skips the file |
| AI content published directly | Unreviewed content appears on live site |
| Non-slug filename | CMS UI shows broken entry; loader may fail |

---

## Validation before enabling a new workflow

Before enabling a new n8n content automation in production:

1. Run the workflow once targeting a test branch
2. Verify the generated file matches the expected schema (compare to a human-authored file in the same collection)
3. Run `bun run build` to confirm the build succeeds with the new file
4. Run `bun run check` to confirm TypeScript types pass
5. Confirm the file renders correctly in the browser
6. Only then merge to main and enable the production workflow
