# Sveltia CMS Guide

Conventions and safety rules for working with Sveltia CMS configuration and content.

---

## Frontmatter format

**Always use YAML frontmatter** for Sveltia-managed Markdown collections.

```yaml
# static/admin/config.yml — correct
- name: articles
  format: frontmatter   # ← YAML frontmatter
  extension: md
```

Do not use `toml-frontmatter` unless the user explicitly approves it. TOML frontmatter is unusual in this stack, reduces interoperability, and requires custom parsing. The template ships YAML frontmatter throughout.

---

## Date fields

### Required dates

Required date fields should be ISO 8601 datetime with timezone.

```yaml
# ✓ Correct — required datetime with timezone hint
- label: Published At
  name: publishedAt
  widget: datetime
  required: true
  hint: "Use ISO 8601 with timezone, e.g. 2026-04-27T12:00:00Z"
```

### Optional date fields — the problem

Optional datetime fields in Sveltia CMS are a known source of silent failures:

- When an editor saves without filling in an optional datetime, Sveltia may write `""`, `null`, or no value at all.
- If the loader expects a string and receives `null`, rendering may silently break.
- If the content is later edited in a different tool, the blank value may be preserved and cause a type error in TypeScript.

### The rule

**Do not create optional datetime fields by default.**

If a date-like field genuinely needs to be optional, use one of these patterns instead:

1. **Omit entirely when unused.** The content loader checks `if (data.updatedAt)` before using it.
2. **Use a string widget with a format hint.** Gives full control over what is saved.
3. **If you must use `widget: datetime` with `required: false`:** add it to the `OPTIONAL_DATETIME_ALLOWLIST` in `scripts/check-cms-config.ts` and document why.

```yaml
# ✗ Bad — optional datetime without allowlist entry
- label: Updated Date
  name: updatedAt
  widget: datetime
  required: false

# ✓ Better — plain string that the author fills in or leaves out
- label: Updated Date
  name: updatedAt
  widget: string
  required: false
  hint: "ISO 8601 datetime with timezone, e.g. 2026-04-27T12:00:00Z. Leave blank if unchanged."

# ✓ Also fine — simply omit the field if it is rarely needed
```

### Canonical date format

Stored dates must be ISO 8601 datetime with timezone:

```
2026-04-27T12:00:00Z       ← UTC (preferred)
2026-04-27T08:00:00-04:00  ← With offset
```

Date-only values (`2026-04-27`) are acceptable for `date` fields that represent a calendar day without a time component (e.g., article publication date). For `publishedAt`, `updatedAt`, `createdAt` — always include the time and timezone.

---

## Empty optional fields

Optional fields that are not filled in must be **omitted entirely** from frontmatter. They must never be saved as:

| Bad value | Why |
|-----------|-----|
| `""` | Breaks loaders that expect `string | undefined`, not `""` |
| `null` | Breaks TypeScript `string` types |
| `"null"` | Literal string "null" — causes display bugs |
| `"undefined"` | Literal string "undefined" — causes display bugs |

If Sveltia is saving blank optional fields as `""` or `null`, check the widget configuration. Consider switching to a `string` widget with `required: false` instead of `datetime`.

---

## Preserving existing frontmatter

When adding a new field to an existing collection:

1. Add the field to `static/admin/config.yml`.
2. Add the property to `src/lib/content/types.ts`.
3. **Do not rewrite existing content files** unless the field is required. Existing files without the new field are valid — TypeScript should mark new optional fields as `field?: Type`.
4. Run `bun run check:content` to verify existing files still pass.

When editing content files directly (not via CMS), preserve all existing valid frontmatter values. Do not remove fields unless a migration plan has been written.

---

## Field renames require a migration plan

Field names in `config.yml` are a data contract. Renaming a field requires:

1. A migration plan documenting the rename.
2. Updating `static/admin/config.yml`.
3. Updating all content files in `content/`.
4. Updating the TypeScript interface in `src/lib/content/types.ts`.
5. Updating content loaders in `src/lib/content/`.
6. Updating all Svelte components that consume the field.
7. Updating documentation in `docs/cms/`.
8. Running `bun run check:content` and `bun run check:cms` to verify.

A casual field rename breaks the entire content pipeline. Treat it like a database column rename.

---

## Examples: good vs. bad config patterns

### Required date field — correct

```yaml
- label: Published At
  name: publishedAt
  widget: datetime
  required: true
  hint: "Use ISO 8601 with timezone, e.g. 2026-04-27T12:00:00Z"
```

### Optional date field — incorrect

```yaml
# ✗ Bad — will cause blank values and potential content damage
- label: Updated Date
  name: updatedAt
  widget: datetime
  required: false
```

### Optional date field — better

```yaml
# ✓ Omit entirely, or use string widget
- label: Last Updated
  name: updatedAt
  widget: string
  required: false
  hint: "ISO 8601 with timezone (e.g. 2026-04-27T12:00:00Z). Omit if unchanged."
```

### TOML frontmatter — incorrect

```yaml
# ✗ Bad
- name: articles
  format: toml-frontmatter
```

### YAML frontmatter — correct

```yaml
# ✓ Correct
- name: articles
  format: frontmatter
  extension: md
```

### Duplicate field names — incorrect

```yaml
# ✗ Bad — duplicate "title" field
fields:
  - { name: title, widget: string }
  - { name: body, widget: markdown }
  - { name: title, widget: string }   # duplicate!
```
