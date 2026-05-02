# Phase 5b — `check:bootstrap-podman` Integration Smoke

> Plan reference: §6 Phase 5 (second PR), §3.1 (container runtime).

## Goal

A real-container integration test for the bootstrap path. Gated behind
`BOOTSTRAP_PODMAN=1`. Not in `validate`. Available as a manual workflow
on a self-hosted runner.

## Prereqs

- Phase 0, 1, 2, 3, 4, 5a merged.

## Files to create / modify

| Path                                           | Change                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `scripts/check-bootstrap-podman.ts`            | New integration script.                                                                     |
| `package.json`                                 | Add `"check:bootstrap:podman": "BOOTSTRAP_PODMAN=1 bun scripts/check-bootstrap-podman.ts"`. |
| `.github/workflows/bootstrap-podman-smoke.yml` | New manual workflow; runs `bun run check:bootstrap:podman` on a self-hosted Linux runner.   |

## Behavior contract

### Test flow

1. Refuse to run unless `BOOTSTRAP_PODMAN=1`.
2. Detect `podman` (preferred) or `docker`. Fail with `BOOT-PG-001` if
   neither is available.
3. Create a tempdir; copy fixture `tests/fixtures/bootstrap/fresh-template/`
   into it.
4. Symlink `node_modules` from the host repo.
5. Run `bun scripts/bootstrap.ts --ci` with deterministic
   `BOOTSTRAP_*` env vars (use a deterministic project slug like
   `tmpl-bootstrap-smoke`).
6. Assert:
   - Exit code 0.
   - Container `tmpl-bootstrap-smoke-pg` exists and has the three
     bootstrap labels.
   - Migrations applied: query `\dt` and confirm
     `contact_submissions`, `automation_events`,
     `automation_dead_letters` exist.
   - `bun run check:db` against the generated `.env` exits 0.
7. Run bootstrap a second time; assert `git diff` empty within the
   tempdir.
8. **Cleanup unless `--keep`:** stop and remove the container, remove
   the tempdir.

### Cleanup safety

- Only remove containers whose labels include
  `tmpl-svelte-app.bootstrap=true` _and_ whose
  `project-slug=tmpl-bootstrap-smoke`. Never remove unlabeled
  containers.
- If cleanup fails, exit nonzero with details. Do not silently leak
  resources.

### Manual workflow shape

```yaml
name: Bootstrap Podman smoke
on:
  workflow_dispatch:

jobs:
  bootstrap-podman:
    runs-on: self-hosted # Podman not available on GH-hosted Linux
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - run: bun install --frozen-lockfile
      - run: bun run check:bootstrap:podman
```

Adjust `runs-on` to whatever self-hosted label this repo uses. This
template is used occasionally, so the workflow is manual-only; a stale
template does not need a scheduled runner to prove it still exists.

## Acceptance criteria

- [ ] `bun run check:bootstrap:podman` succeeds locally with Podman
      installed.
- [ ] The smoke test cleans up after itself by default.
- [ ] `--keep` preserves the container and tempdir for inspection.
- [ ] Manual workflow file exists and references the correct command.
- [ ] `bun run validate` does **not** include this command (still
      CI-fast).

## Commit message

```
test(bootstrap): add Podman/Docker integration smoke

Real-container test for the bootstrap contract. Gated behind
BOOTSTRAP_PODMAN=1 and not in `validate` because it requires a
container runtime.

Flow: fresh fixture → ./bootstrap --ci → assert container exists with
labels, migrations applied, check:db green → second run empty diff →
cleanup container + tempdir.

Cleanup is label-checked: only removes containers tagged
tmpl-svelte-app.bootstrap=true and project-slug=tmpl-bootstrap-smoke.
--keep preserves state for inspection.

Manual GitHub Actions workflow on a self-hosted Linux runner.

Refs: docs/planning/13-bootstrap-contract-project.md §6 Phase 5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Pitfalls

- **Cleanup is mandatory.** A test that leaks containers is worse than
  no test. Wrap the test body in a try/finally and run cleanup in
  finally.
- **Self-hosted runner.** GitHub-hosted Linux runners do not have
  Podman/Docker available for arbitrary container creation in a way
  that suits this test. Plan accordingly.
- **Image pull time.** First run pulls `postgres:17-alpine`. Cache the
  image on the self-hosted runner via a separate keep-warm step or a
  long-lived runner.
- **Don't reuse the project slug across runs.** Use
  `tmpl-bootstrap-smoke` as a fixed slug _and_ delete the container
  before starting; this avoids the "previous run leaked" trap.
