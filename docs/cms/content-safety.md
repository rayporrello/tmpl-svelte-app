# CMS Content Safety

This document explains the content safety layer, what it protects against, and how to use it.

---

## What are silent CMS failures?

"Silent CMS failures" are cases where:

- The CMS UI shows a successful save.
- The Git commit is created.
- CI rebuilds successfully.
- But the saved content is wrong — blank fields, `null` values, truncated body, missing frontmatter keys.

These failures are hard to catch because neither the CMS nor the CI pipeline necessarily validates content semantics. The site may render with empty titles, missing descriptions, or broken date fields.

**Common causes:**

- Optional datetime fields saved as `""` or `null` when left empty.
- A CMS UI bug or misconfiguration that blanks fields on save.
- An n8n automation that overwrites content with a malformed payload.
- A developer editing content files directly and breaking YAML syntax.
- A CMS field rename that was applied to config.yml but not to existing content files.

---

## What the scripts protect against

### `bun run check:cms`

Validates `static/admin/config.yml` when it exists.

- Fails if a Markdown collection uses `toml-frontmatter`.
- Fails if optional `datetime` fields are present (unless allowlisted).
- Fails if duplicate field names exist within a collection.
- Fails if canonical collections (`pages`, `articles`, `posts`) are missing required fields.
- Fails if collection folders are outside approved content directories.
- Fails if `media_folder` or `public_folder` is missing or inconsistent.

### `bun run check:content`

Validates Markdown and pure YAML content across all base collections using the shared Valibot schemas. See [docs/content/validation.md](../content/validation.md) for the canonical field contract, rules, and error format.

### `bun run check:content-diff`

Detects destructive changes to content files before commit or deploy.

- Fails if a required field changed from non-empty to blank/null.
- Fails if three or more frontmatter fields in a file became blank/null/undefined.
- Fails if body content shrank by more than 70%.
- Fails if frontmatter key count dropped by more than 40%.
- Warns if more than 10 content files changed at once.

---

## How to run the checks

```bash
bun run check:cms          # Validate CMS config
bun run check:content      # Validate content files
bun run check:content-diff # Check for destructive content changes
```

All three are included in `bun run validate` alongside the normal checks.

---

## What to do when a check fails

### check:cms fails

1. Read the error message — it names the collection and field.
2. Open `static/admin/config.yml` and fix the identified issue.
3. Re-run `bun run check:cms` to verify.

Common fixes:

- Change `format: toml-frontmatter` to `format: frontmatter`.
- Remove `required: false` from a `datetime` widget, or add the field name to `OPTIONAL_DATETIME_ALLOWLIST` with matching schema validation.
- Remove duplicate field names.

### check:content fails

1. Open the named file.
2. Fix the identified field.
3. Re-run `bun run check:content` to verify.

For blank required fields: set a real value or remove the field if it should not exist.

For bad date formats: change to ISO 8601 with timezone (`2026-04-27T12:00:00Z`).

For blank optional fields: remove the field entirely from frontmatter rather than setting `""` or `null`.

### check:content-diff fails

**Do not dismiss this check.** A fail here often indicates a CMS write error that damaged content.

1. Run `git diff HEAD content/` (or the relevant path) and carefully read the diff.
2. Identify what changed and why.
3. If the change is intentional: verify it is correct and the check is a false positive, then proceed.
4. If the change is unexpected: revert the file with `git checkout HEAD -- <file>` and investigate what caused the damage.

Do not commit if you cannot explain why the diff looks the way it does.

---

## Why Git diffs must be reviewed for content changes

The CMS UI's "save successful" message only means the commit was created. It does not mean the content is correct. The only way to verify correctness is to:

1. Check the Git diff.
2. Run `bun run check:content`.
3. Run `bun run check:content-diff`.

Repo validation scripts are authoritative. A CMS UI success message with a failing `check:content` is a content failure.

---

## What agents must not do

Agents (Claude, Codex, Cursor, etc.) working in this repository must:

1. Never rewrite frontmatter wholesale unless the task explicitly requires a migration.
2. Never save optional date-like fields as `""`, `null`, `"null"`, or `"undefined"`.
3. Never change a CMS field name without following the full migration checklist.
4. Always run `bun run check:cms`, `bun run check:content`, and `bun run check:content-diff` after modifying `static/admin/config.yml` or any file under `content/`.
5. Report a blocker if a content diff blanks required fields or removes large portions of body content.

---

## Why repo validation scripts are authoritative

The CMS is a UI on top of Git. The Git repo is the source of truth. Validation scripts enforce the content contract at the repo level, independent of what the CMS UI accepted.

This means:

- A file that the CMS saved "successfully" but that fails `bun run check:content` is **invalid content**.
- A CMS config that passes Sveltia's own validation but fails `bun run check:cms` is **invalid config**.
- Do not deploy content that fails the validation scripts, even if the CMS did not complain.
