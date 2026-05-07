# Deploy Apply

`deploy:apply` is the attended production deploy orchestrator for one host. It
runs the same sequence operators used to do by hand: preflight, migrations,
Quadlet image rewrite, `systemctl` reload/restart, readiness polling, release
recording, and smoke checks.

## When To Run

Run it on the production host from the checked-out project directory after CI
has built and pushed the target image to GHCR:

```bash
bun run deploy:apply -- \
  --image=ghcr.io/<owner>/<repo>:<sha> \
  --sha=<sha> \
  --safety=rollback-safe
```

Use `--dry-run` before a risky deploy or whenever you want to review the
Quadlet and migration plan without changing files or state.

## Required Flags

| Flag       | Meaning                                                                    |
| ---------- | -------------------------------------------------------------------------- |
| `--image`  | Full image ref to write into the locked Quadlet set. Pin an immutable tag. |
| `--sha`    | Git commit SHA represented by the image. Stored in the release ledger.     |
| `--safety` | Operator-declared migration safety: `rollback-safe` or `rollback-blocked`. |

There is no default for `--safety`. Missing it is a hard failure because the
operator must consciously classify the release.

## Migration Safety

Use `--safety=rollback-safe` only when the previous image can still run against
the post-migration schema. In practice, that means expand-only migrations:
nullable columns, new tables, new indexes, new views, new functions, or new
types.

Use `--safety=rollback-blocked` for destructive or compatibility-breaking
changes such as drops, renames, type narrowing, new required columns without a
default, or constraints that old code cannot satisfy.

The binding rules are in
[`ADR-028`](../planning/adrs/ADR-028-deploy-apply-semantics.md).

## What Happens On Smoke Failure

The release is recorded after units restart and readiness passes, before smoke
runs. If smoke fails, the ledger still reflects what is deployed, and a smoke
event is appended separately.

For `rollback-safe` releases, the CLI prints:

```bash
bun run rollback --to previous
```

For `rollback-blocked` releases, the CLI points you at rollback status and PITR
restore docs:

```bash
bun run rollback --status
```

The CLI does not auto-rollback. The operator chooses rollback, roll-forward, or
PITR based on the failure.

## Why Deploy Executes But Rollback Prints

`deploy:apply` executes migrations and `systemctl` because its value is the
single attended sequence from image to verified release. Rollback is different:
it edits the web and worker Quadlet image lines, then prints the commands for
the operator to run deliberately during an incident.

This asymmetry is intentional and documented in
[`ADR-028`](../planning/adrs/ADR-028-deploy-apply-semantics.md) and
[`rollback.md`](rollback.md).

## Dry Run

Dry run computes the plan and repeats preflight, but it does not run
migrations, write Quadlets, call `systemctl`, record a release, or append
events.

```bash
bun run deploy:apply -- \
  --image=ghcr.io/<owner>/<repo>:<sha> \
  --sha=<sha> \
  --safety=rollback-blocked \
  --dry-run \
  --no-color
```

Use the output to verify the target image, migration list, and Quadlet paths
before removing `--dry-run`.
