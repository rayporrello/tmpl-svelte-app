---
name: website-platform-operator
description: Use whenever working on Ray's SvelteKit website fleet, tmpl-svelte-app clones, web-data-platform, launch:site, launch:deploy, deploy:apply, Drizzle migrations, Caddy, Podman, Quadlet, systemd, production secrets, fleet worker, backups, restore, PITR, client export, Postmark, contact delivery, clients.json, or website deployment. Do not use for unrelated generic coding.
---

# Website Platform Operator Skill

You are operating a two-repo SvelteKit website platform. Preserve the established processes and avoid unsafe improvisation.

## First Move

Before editing or running meaningful commands:

1. Identify repo type: `website-repo`, `platform-repo`, or `unknown`.
2. Identify task class: `docs-only`, `local-website-development`, `local-schema-development`, `production-launch-groundwork`, `production-deploy`, `migration/fleet-migration`, `caddy-dns-postmark-manual-integration`, `secrets-credentials`, `backup-restore-export`, `incident-recovery`, or `unclear`.
3. Read root `AGENTS.md`, the relevant README/runbook, and package scripts.
4. State the safe command path.
5. Stop if required production details are missing.

## Source Of Truth

Use this order:

1. User's explicit task, unless unsafe.
2. Root `AGENTS.md`.
3. Repo README.
4. Relevant runbook.
5. ADR/architecture docs.
6. `package.json` scripts.
7. Source code.

If docs and code conflict, stop and report the discrepancy.

## Website Repo Normal Commands

Local:

```bash
./bootstrap
bun run dev
bun run validate
bun run launch:check
bun run deploy:preflight
```

Schema local only:

```bash
bun run db:generate
bun run db:migrate
bun run db:check
```

Deploy:

```bash
export WEB_DATA_PLATFORM_PATH="$HOME/web-data-platform"
bun run launch:deploy -- --client=<slug> --image=<image> --sha=<sha> --safety=rollback-safe
```

## Platform Repo Normal Commands

Preflight:

```bash
bun install --frozen-lockfile
bun run web:check
```

First launch:

```bash
bun run launch:site -- --slug=<slug> --repo=<website-root> --domain=<domain> ...
bun run launch:checklist -- --client=<slug>
```

Migrations:

```bash
bun run web:fleet-migration-status -- --client=<slug> --repo=<website-root>
```

Contact smoke:

```bash
bun run web:test-contact-delivery -- --client=<slug>
```

Worker status:

```bash
bun run web:fleet-worker-status -- --client=<slug>
```

Backup verify:

```bash
bun run web:cluster-backup-verify -- --latest
```

## Hard Stops

Stop and ask/report before:

- Production DB mutation.
- `--skip-migration-gate`.
- `--safety=rollback-blocked`.
- Direct `deploy:apply`.
- Direct `web:provision-client`.
- Deleting volumes, containers, networks, databases, backups, dumps, or env files.
- Restoring backups or running PITR/client restore.
- Editing production secrets or rotating passwords.
- Editing rendered env files or generated Quadlets.
- Changing Caddy without `caddy validate`.
- Rewriting Drizzle migration history.
- Marking manual checklist items done without external verification.

## Never Do

- Never invent commands when scripts/runbooks exist.
- Never run local website `db:migrate` against production.
- Never point local dev at production DB.
- Never point production at local DB.
- Never expose Postgres publicly.
- Never reintroduce per-site production Postgres, worker, backup/PITR, restore, or network artifacts.
- Never commit secrets, env files, dumps, or keys.
- Never print tokens, passwords, rendered env, dump contents, contact payloads, or provider response bodies.
- Never bypass launch checklist, migration gate, readiness, smoke, contact-delivery, backup, or Caddy validation gates.
- Never claim production success without verified gates.

## Final Response Checklist

Report:

- Repo.
- Task class.
- Files changed.
- Commands run.
- Validation status.
- Production impact.
- Gates passed or not run.
- Risks.
- Next safe action.
