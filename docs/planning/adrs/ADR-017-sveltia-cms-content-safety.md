# ADR-017 — Sveltia CMS Content Safety Layer

**Status:** Accepted  
**Date:** 2026-04-27  
**Supersedes:** None  
**Related:** ADR-014 (Sveltia content system)

---

## Context

Sveltia CMS is a Git-backed CMS. When an editor saves content, Sveltia commits a file to the repository. The site rebuilds from that commit. This is the same path used by n8n automations and direct developer edits.

Several failure modes can corrupt content silently:

1. **Optional datetime fields** saved as `""`, `null`, or `"null"` when left blank — a known Sveltia quirk.
2. **Bad YAML frontmatter** that parses successfully but contains semantically invalid values (blank required fields, wrong date format).
3. **Destructive CMS rewrites** where a field that had content is overwritten with a blank value.
4. **Automations writing invalid content** — n8n workflows that follow the schema incorrectly.
5. **Direct developer edits** that break YAML syntax or remove required fields.

The CMS UI's "save successful" message does not validate content semantics. CI builds succeed even with blank titles or null dates. The site may render incorrectly or break TypeScript types without any visible error.

---

## Decision

Adopt a **CMS content safety layer** as part of the template contract. This layer treats CMS writes as untrusted until validated by repo scripts.

### Posture

```
CMS writes content
  → Git records the diff
    → Scripts validate the content
      → Diff guard catches destructive rewrites
        → Agent rules prevent known-risk schemas
          → CI/deploy refuses bad content
```

### Locked decisions

| Rule                                                           | Rationale                                                               |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| YAML frontmatter is the default for Sveltia-managed Markdown   | Consistent with the rest of the stack; avoids TOML parsing requirements |
| Optional datetime fields are forbidden by default              | Known source of silent blank-value failures in Sveltia                  |
| ISO 8601 datetime with timezone is the canonical date format   | Unambiguous; works in all timezones; TypeScript-friendly                |
| Empty optional date-like fields must be omitted                | Blank values break loaders; `null` breaks TypeScript `string` types     |
| Repo validation scripts are authoritative for content validity | CMS UI success messages do not validate semantics                       |
| Destructive content diffs must fail validation                 | Protects against accidental overwrites and CMS write errors             |

### Scripts

| Script                 | Command                      | Purpose                                 |
| ---------------------- | ---------------------------- | --------------------------------------- |
| CMS config validator   | `bun run check:cms`          | Validates `static/admin/config.yml`     |
| Content file validator | `bun run check:content`      | Validates `.md` files under `content/`  |
| Content diff guard     | `bun run check:content-diff` | Detects destructive changes in git diff |

`check:cms` and `check:content` are included in `bun run validate`. `check:content-diff` is destructive-change protection: run it manually before content-heavy commits, and expect it in the launch-grade pipeline (`bun run validate:launch`).

---

## Consequences

**Positive:**

- Broken content files are caught before deploy, not after.
- Optional datetime fields cannot silently blank out required data.
- Agents cannot create known-risk CMS schemas without the check script catching them.
- The diff guard protects against CMS rewrites that destroy body content or wipe frontmatter.

**Negative:**

- The check scripts add a new failure mode: valid content that the scripts reject due to strict rules. This should be addressed by loosening specific checks (adding to `OPTIONAL_DATETIME_ALLOWLIST`) rather than disabling checks entirely.
- The scripts require `gray-matter` and `js-yaml` — both are already in the template's dependencies.

---

## Alternatives considered

**Trust the CMS UI success message**  
Rejected. Sveltia's success message confirms a commit was created, not that the content is semantically valid.

**Use Sveltia's built-in field validation only**  
Rejected. Field-level validation in Sveltia does not catch all failure modes (e.g., blank optional datetime fields, body truncation, missing frontmatter keys).

**Add a CMS webhook that triggers validation on every save**  
Deferred. This would require n8n or a serverless function to receive the webhook. The current scripts-based approach is simpler and works without external infrastructure.

**Use a full content management platform with built-in validation**  
Out of scope. This template uses Git-backed content as a deliberate architectural choice (ADR-014). Database-backed CMS validation is for a different architecture.

---

## What remains configurable per site

- The exact list of content collections and their required fields.
- Additional optional fields per collection.
- The `OPTIONAL_DATETIME_ALLOWLIST` in `scripts/check-cms-config.ts` — per-project exceptions for optional datetime fields that are intentionally needed.
- Date display format in Svelte components (ISO 8601 is the stored format; display format is a rendering concern).

---

## Deferred

- Webhook-triggered pre-merge validation for CMS commits. The current scripts-based approach is simpler and works without external infrastructure.
- Rich content migrations when field names or structures change significantly.
- Database-backed CMS validation (out of scope for this template).

---

## Rejected as overengineering

- Trusting CMS UI success messages as sufficient validation.
- Allowing agents to freely rewrite frontmatter without running the validation scripts.
- TOML frontmatter as a default.
- Optional datetime fields without explicit allowlisting and validation.
- A separate CMS validation microservice.
