# Phase 0 — Prettier Formatting Baseline

> Plan reference: §6 Phase 0, §5.3 (Modified files), §4 rule 1 (Phase 0 ships
> separately).

## Goal

Make Prettier a silent gate. After this phase, a single bad-formatted file
in any future PR fails `bun run validate` at the `format:check` step,
before any expensive `check`/build/test work.

## Prereqs

None. This is the first phase.

## Files to create / modify

| Path              | Change                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `.prettierignore` | Audit + ensure exclusions (see below)                                                               |
| `package.json`    | Add `format` and `format:check` scripts; wire `format:check` into `validate` early (before `check`) |
| _everything else_ | Run `bun run format` once, repo-wide, as part of this phase's commit                                |

### `.prettierignore` exclusions (must be present)

```
node_modules
.svelte-kit
build
dist
coverage
.env
.env.*
bun.lock
static/admin/sveltia-cms.js
drizzle/meta
test-results
```

If any of these are missing from `.prettierignore`, add them **before**
running the format sweep. If `.prettierignore` does not exist, create it.

### `package.json` script changes

```json
{
	"scripts": {
		"format": "prettier --write .",
		"format:check": "prettier --check ."
	}
}
```

Wire `format:check` into `validate` as the **first step**, before
`check`:

```
"validate": "bun run format:check && bun run check && bun run check:seo && bun run check:analytics && bun run check:cms && bun run check:content && bun run check:assets && bun run check:design-system && bun run images:optimize && bun run build && bun run test && bun run test:e2e:built"
```

## Behavior contract

1. Audit `.prettierignore` first; commit any additions to it as part of
   this phase, before running the sweep.
2. Run `bun run format` once at the repo root. This will rewrite any file
   that drifted from `.prettierrc`. The diff will be large but mechanical
   (whitespace, quote style, trailing commas, line wrapping).
3. Run `bun run validate` and confirm green. If it fails, the failure is
   not from formatting — diagnose and stop; do not paper over.
4. Commit everything as a single commit. Do **not** mix any logic changes
   into this commit.

## Acceptance criteria

- [ ] `bun run format:check` exits 0 against the working tree.
- [ ] `bun run validate` passes locally.
- [ ] The commit diff contains only:
  - `.prettierignore` (if changed)
  - `package.json` (script additions + `validate` wiring)
  - mechanical formatting changes to other files
- [ ] No `src/` logic changes, no test logic changes, no doc content
      changes (formatting only).
- [ ] Inserting one bad-formatted file in a follow-up branch fails
      `bun run validate` at `format:check`, not at a later step.

## Commit message

```
chore(format): establish prettier baseline + format:check gate

Run `bun run format` repo-wide so the working tree matches .prettierrc.
Add format:check script and wire it into validate as the first step so
formatting drift fails fast on every PR.

No code-meaning changes. Only whitespace, quotes, line wrapping, and
trailing-comma normalization.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Pitfalls

- **Do not pass file paths to `bun run format`.** Bun does not forward args
  after `--` to scripts in the way `npm run` sometimes does. Running
  `bun run format -- some/file.md` will still format the entire repo
  because `package.json` defines `format` as `prettier --write .`. Use
  `bunx prettier --write <path>` if you need to format a single file.
- The format sweep will touch many files (~40+). That is expected — it's
  a one-time catch-up. Lefthook only formats staged files on commit, so
  drift accumulates from edits made outside that path (LLMs writing files,
  hand edits without format-on-save). After this phase, `format:check` in
  CI prevents recurrence.
- Confirm `bun run validate` passes **before** committing. If it fails
  after the sweep, something else is broken — do not commit a red baseline.
