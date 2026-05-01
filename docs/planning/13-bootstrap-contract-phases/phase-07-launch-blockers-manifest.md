# Phase 7 — Launch-Blockers Manifest Filled In

> Plan reference: §6 Phase 7, §9 (Launch-blockers manifest), §8 (Error
> codes).

## Goal

Replace the stub `check` functions in
`scripts/lib/launch-blockers.ts` with real logic. After this phase,
doctor, `validate:launch`, and the dev banner (when it ships in Phase 9) all consume the same single source of truth.

## Prereqs

- Phase 0, 1, 2, 3, 4 merged.
- Phase 5a merged (validate now runs `secrets:check`).
- Phase 6 merged.

## Files to modify

| Path                                 | Change                                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `scripts/lib/launch-blockers.ts`     | Replace each stub `check` with real logic.                                                                                   |
| `tests/unit/launch-blockers.test.ts` | New unit test per blocker (pass and fail cases).                                                                             |
| `scripts/check-launch.ts`            | If this script existed pre-project, refactor it to consume `LAUNCH_BLOCKERS` from the manifest instead of duplicating logic. |

## Behavior contract

Each entry has shape:

```ts
{
  id: 'LAUNCH-OG-001',
  label: 'Default OG image is still the template asset',
  severity: 'required' | 'recommended',
  check: async () => ({ status: 'pass' | 'warn' | 'fail', detail?: string }),
  fixHint: 'NEXT: Replace static/og-default.png with a real 1200×630 PNG.',
  docsPath: 'docs/seo/launch-checklist.md',
}
```

### Blockers and their checks

| ID                   | Severity    | Check                                                                                                                                                                        |
| -------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LAUNCH-OG-001`      | required    | Read `static/og-default.png`, hash it, compare to the template's known checksum. `fail` if it matches the template asset; `pass` otherwise.                                  |
| `LAUNCH-SEO-001`     | required    | Read `src/lib/config/site.ts`, parse `defaultTitle`. `fail` if it equals the template default (`'tmpl-svelte-app'` or whatever the original template name resolves to).      |
| `LAUNCH-CMS-001`     | required    | Read `static/admin/config.yml`, parse `backend.repo`. `fail` if it is `<owner>/<repo>` or any obvious placeholder pattern.                                                   |
| `LAUNCH-ENV-001`     | required    | Read `ORIGIN` from production env (or current `.env` if no prod env file is provided to the check). `fail` if it contains `localhost` or `127.0.0.1`. `warn` if it is unset. |
| `LAUNCH-ENV-002`     | required    | Same shape as `LAUNCH-ENV-001`, against `PUBLIC_SITE_URL`.                                                                                                                   |
| `LAUNCH-APPHTML-001` | required    | Read `src/app.html`, find the `<title>` tag. `fail` if it equals the template fallback (literal `tmpl-svelte-app` or similar).                                               |
| `LAUNCH-BACKUP-001`  | recommended | Check whether `BACKUP_REMOTE` is set in the production env reference. `warn` (not `fail`) if missing — backups can be configured post-launch.                                |
| `LAUNCH-EMAIL-001`   | recommended | Check whether `POSTMARK_SERVER_TOKEN` is set in production env reference. `warn` if missing — the contact form falls back to console-only logging cleanly.                   |

### Severity rules

- `required` blockers with `fail` cause `validate:launch` to fail.
- `recommended` blockers with `fail` or `warn` produce warnings only.
- Doctor surfaces all of them; the dev banner (Phase 9) shows whichever
  fire.

### Detail-level output

Each `check` should return enough detail in the `detail` field that the
user can fix the issue without reading further. For example:

```ts
{
  status: 'fail',
  detail: 'static/admin/config.yml backend.repo is "<owner>/<repo>" — replace before deploy.',
}
```

### `validate:launch` integration

If `scripts/check-launch.ts` already exists, refactor it to:

1. Import `LAUNCH_BLOCKERS` from `scripts/lib/launch-blockers.ts`.
2. Iterate, await each `check()`.
3. Print results grouped by severity.
4. Exit nonzero if any `required` blocker is `fail`.

If a separate script does not exist, add one and wire it into the
existing `validate:launch`. Plan §11 already aliases `launch:check` to
`validate:launch`; that alias is added in Phase 9 extras.

## Acceptance criteria

- [ ] Every entry in the registry has a real `check` function with unit
      tests covering pass and fail cases.
- [ ] Removing `static/og-default.png` (or replacing it with the
      template's checksum) makes `validate:launch` fail with `LAUNCH-OG-001`
      exactly once across the run.
- [ ] Restoring it to a different image makes the next `validate:launch`
      pass.
- [ ] Doctor reports the same set of blockers for the same repo state as
      `validate:launch`.
- [ ] No duplicate blocker logic exists outside the manifest.
- [ ] `bun run validate` passes.

## Commit message

```
feat(launch-blockers): fill in manifest with real checks

Replace the Phase 1 stubs with real logic for each LAUNCH-* code.
Manifest is now the single source of truth consumed by:
- bun run doctor
- bun run validate:launch (and launch:check alias from Phase 9)
- the dev banner (Phase 9)

Severity model: `required` blockers with status='fail' fail
validate:launch; `recommended` blockers warn only. Detail-level
messages on every failed check so the fix is obvious without opening
docs.

Refs: docs/planning/13-bootstrap-contract-project.md §6 Phase 7, §8, §9.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Pitfalls

- **Single source of truth.** If you find yourself duplicating any check
  in `check-seo.ts` or `check-assets.ts`, refactor those scripts to
  consume the manifest too. The whole point of this phase is to remove
  duplication.
- **`LAUNCH-OG-001` checksum.** Checksum the _current_ template asset and
  hard-code it as a constant in the manifest. Re-running the project's
  own image-optimizer must not change the checksum (if it does, the
  template's prebuild is non-idempotent and that's a separate bug).
- **`LAUNCH-ENV-001/002` env source.** When called from `validate:launch`
  on a developer machine without a production env file, default to
  reading the current `.env` and emit `warn` for localhost values rather
  than `fail` — otherwise every dev gets red CI on every push. The fail
  threshold is "production environment said localhost," not "your local
  .env said localhost."
- **Recommended vs required.** Backups and email are recommended; OG
  image, CMS repo, and prod URL placeholders are required. Don't bundle
  all of these as `required` — that would block the launch on things the
  user can rationally defer.
