# Phase 2 — `bun run check:db`

> Plan reference: §6 Phase 2.

## Goal

A single shared DB-health command that bootstrap, doctor, and CI all call.
This is the only place script-side code is allowed to import from `src/`.

## Prereqs

- Phase 0 merged.
- Phase 1 merged (uses `scripts/lib/print.ts`, `scripts/lib/diagnose-pg.ts`,
  `scripts/lib/errors.ts`).

## Files to create / modify

| Path                                 | Change                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `scripts/check-db-health.ts`         | New script. Imports `src/lib/server/db/health.ts`.                                                                   |
| `tests/unit/check-db-health.test.ts` | New unit test (mocks failures).                                                                                      |
| `package.json`                       | Add `"check:db": "bun run scripts/check-db-health.ts"`. **Do not** add it to `validate` yet — it requires a live DB. |

## Behavior contract

`scripts/check-db-health.ts` must:

1. Load `.env` deterministically (use Bun's built-in `import.meta.env` or
   read `.env` via `scripts/lib/env-file.ts`).
2. Call `checkDbHealth()` from `src/lib/server/db/health.ts`.
3. On success, print:
   ```
   OK   Database connectivity verified
        host: <host>:<port>
        db:   <database>
        latency: <ms>
   ```
   and exit 0.
4. On failure, route the error through `diagnosePostgresError()` from
   `scripts/lib/diagnose-pg.ts`, which returns `{ code, hint }`. Print:
   ```
   FAIL <code> <human label from errors.ts>
        detail: <error.message>
   NEXT <hint>
   ```
   and exit nonzero. The exit code can simply be `1` — the readable
   `BOOT-DB-*` code is in the output.
5. **Never print `DATABASE_URL` or any password.** Use the redaction in
   `scripts/lib/run.ts` if you log connection info.

### Failure → code mapping

| Postgres error               | Code          | Hint                                                                                      |
| ---------------------------- | ------------- | ----------------------------------------------------------------------------------------- |
| `DATABASE_URL` missing       | `BOOT-DB-001` | `NEXT: Set DATABASE_URL in .env. Run ./bootstrap to generate one.`                        |
| `DATABASE_URL` parse failure | `BOOT-DB-001` | `NEXT: Check DATABASE_URL in .env. Format: postgres://user:pw@host:port/db`               |
| `28P01` auth failed          | `BOOT-DB-002` | `NEXT: Verify the password in DATABASE_URL matches the database user.`                    |
| `3D000` database missing     | `BOOT-DB-003` | `NEXT: Create the database, or re-run ./bootstrap to provision a local one.`              |
| `42501` permission denied    | `BOOT-DB-004` | `NEXT: Grant the user privileges on schema public: GRANT ALL ON SCHEMA public TO <user>;` |
| Connection refused           | `BOOT-PG-001` | `NEXT: Start Postgres, or re-run ./bootstrap to provision a local container.`             |

## Acceptance criteria

- [ ] `bun run check:db` against a healthy DB exits 0 with the documented
      output shape.
- [ ] `bun run check:db` against a wrong-password DB exits nonzero,
      prints `BOOT-DB-002`, and includes a `NEXT:` line.
- [ ] `bun run check:db` against `DATABASE_URL=postgres://x:y@127.0.0.1:1/z`
      (refused) exits nonzero with `BOOT-PG-001`.
- [ ] No password ever appears in stdout/stderr (verified by snapshot
      tests with redaction asserts).
- [ ] `tests/unit/check-db-health.test.ts` mocks `checkDbHealth()` for
      each failure mode and asserts the printed output and exit code.
- [ ] `bun run validate` still passes (this script is not added to
      `validate` yet).

## Commit message

```
feat(scripts): add check:db primitive (bun run check:db)

Single shared DB-health command. The only place script-side code imports
src/ — specifically src/lib/server/db/health.ts via a documented seam.

Routes Postgres errors through diagnose-pg.ts to surface stable
BOOT-DB-001..004 / BOOT-PG-001 codes with NEXT: hints. Never logs
DATABASE_URL or passwords.

Used by:
- bootstrap (Phase 3) for step 6 health verification
- doctor (Phase 4) in detection mode
- CI bootstrap-smoke (Phase 8) for the deployed-server check

Not added to `validate` because it requires a live DB.

Refs: docs/planning/13-bootstrap-contract-project.md §6 Phase 2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Pitfalls

- **Importing app code is fine here, but only here.** Document this as
  the deliberate seam in a comment at the top of `check-db-health.ts`
  and reference §6 Phase 2 of the planning doc. Do not let it become a
  precedent for other scripts.
- **Do not add to `validate`.** Validate runs in CI and on dev machines
  that may not have a DB. Bootstrap-smoke (Phase 8) is where it belongs
  in CI.
- **Loading `.env`.** Bun reads `.env` automatically for `bun run`, but
  the path resolution is project-root. If you spawn this script from
  elsewhere, prefer reading `.env` explicitly via `env-file.ts`.
