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

The env-source rule for `LAUNCH-ENV-001` and `LAUNCH-ENV-002` is the
crux of the dev-vs-prod question (see "env source" below the table).

| ID                   | Severity    | Check                                                                                                                                                                                                                                                                                     |
| -------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LAUNCH-OG-001`      | required    | Read `static/og-default.png`, hash it, compare to the template's known checksum. `fail` if it matches the template asset; `pass` otherwise.                                                                                                                                               |
| `LAUNCH-SEO-001`     | required    | Read `src/lib/config/site.ts`, parse `defaultTitle`. `fail` if it equals the template default (`'tmpl-svelte-app'` or whatever the original template name resolves to).                                                                                                                   |
| `LAUNCH-CMS-001`     | required    | Read `static/admin/config.yml`, parse `backend.repo`. `fail` if it is `<owner>/<repo>` or any obvious placeholder pattern.                                                                                                                                                                |
| `LAUNCH-ENV-001`     | required    | Read `ORIGIN`. **Production env source:** `fail` if it contains `localhost` or `127.0.0.1`, or if missing. **Dev env source (`.env`):** `warn` if localhost (expected for local dev), `warn` if missing. The same physical check function takes an `envSource: 'prod' \| 'dev'` argument. |
| `LAUNCH-ENV-002`     | required    | Same shape as `LAUNCH-ENV-001`, against `PUBLIC_SITE_URL`.                                                                                                                                                                                                                                |
| `LAUNCH-APPHTML-001` | required    | Read `src/app.html`, find the `<title>` tag. `fail` if it equals the template fallback (literal `tmpl-svelte-app` or similar).                                                                                                                                                            |
| `LAUNCH-BACKUP-001`  | recommended | Check whether `BACKUP_REMOTE` is set in the production env reference. `warn` (not `fail`) if missing — backups can be configured post-launch.                                                                                                                                             |
| `LAUNCH-EMAIL-001`   | recommended | Check whether `POSTMARK_SERVER_TOKEN` is set in production env reference. `warn` if missing — the contact form falls back to console-only logging cleanly.                                                                                                                                |

### Env source — which env file the check reads

Each consumer passes an explicit `envSource` to the manifest:

| Consumer                                                  | `envSource` | Why                                                                                   |
| --------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------- |
| `bun run validate:launch` / `launch:check` (release gate) | `'prod'`    | About to ship; `localhost` in `ORIGIN`/`PUBLIC_SITE_URL` is a fail.                   |
| `bun run doctor` (default)                                | `'dev'`     | A diagnostic on a developer machine; localhost is expected and should warn, not fail. |
| `bun run doctor --env prod` (or `DOCTOR_ENV=prod`)        | `'prod'`    | When checking a prod env file or running pre-deploy.                                  |
| Dev banner                                                | `'dev'`     | Always dev; only renders in dev mode anyway.                                          |

The "production env reference" is the rendered prod env file (e.g.,
`.env.production` or whatever `secrets:render` produces). If no prod env
file is locatable when `envSource: 'prod'`, the check fails with
`status: 'fail', detail: 'no production env file found at …'`.

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
existing `validate:launch`. The `launch:check` alias for
`validate:launch` ships in Phase 8 alongside the docs flip; this
phase's checks are consumed by both names interchangeably.

## Acceptance criteria

- [ ] Every entry in the registry has a real `check` function with unit
      tests covering pass and fail cases (and, for `LAUNCH-ENV-001/002`,
      both `envSource: 'dev'` and `envSource: 'prod'` cases).
- [ ] Replacing `static/og-default.png` with a non-template image makes
      `LAUNCH-OG-001` disappear from the next `validate:launch` run
      (other unrelated launch blockers may still be present; this
      criterion asserts the OG-specific code goes away, not that the
      whole gate passes).
- [ ] A `tests/fixtures/ready-to-launch/` fixture (every blocker
      satisfied — real OG, real prod URLs, real CMS repo, real app.html
      title) makes `validate:launch` exit 0 against that fixture.
- [ ] On a developer machine with `localhost` in the local `.env`,
      `bun run doctor` reports `LAUNCH-ENV-001/002` as **warn**, not fail.
- [ ] On a production env file with `localhost` set, `validate:launch`
      reports `LAUNCH-ENV-001/002` as **fail**.
- [ ] Doctor reports the same set of blockers for the same repo state as
      `validate:launch` (when invoked with the same `envSource`).
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
- **`LAUNCH-ENV-001/002` env source is explicit, not heuristic.** Each
  caller passes `envSource: 'prod' | 'dev'`. The check does **not**
  guess based on whether a `.env.production` happens to exist. See the
  "Env source" table in the contract above. The fail threshold is
  "production env said localhost," not "your local `.env` said
  localhost," so `bun run doctor` on a dev machine with localhost
  values returns `warn`, never `fail`, by default.
- **`validate:launch` always uses `envSource: 'prod'`.** That is its
  job. Doctor defaults to `'dev'`; `--env prod` switches it.
- **Recommended vs required.** Backups and email are recommended; OG
  image, CMS repo, and prod URL placeholders are required. Don't bundle
  all of these as `required` — that would block the launch on things the
  user can rationally defer.
