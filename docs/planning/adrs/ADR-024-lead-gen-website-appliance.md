# ADR-024: Lead-gen website appliance as default profile

- Status: Accepted
- Date: 2026-05-06
- Related: ADR-004 (Postgres for runtime data), ADR-015 (n8n automation
  bridge), ADR-018 (production runtime and deployment contract), ADR-023
  (single self-hosted Postgres production strategy)

## Context

This template grew with several components scoped as "optional":
database, automation provider, Postmark, n8n. That optionality crept
into the launch gates. The result is that no single document, env
template, or script in the repo agrees on what a launched site
requires.

In particular:

- `check:launch`, `deploy:preflight`, `.env.example`, `deploy/env.example`,
  and `secrets.example.yaml` do not converge on whether Postmark is
  required for production.
- n8n is implicitly treated as if every site uses it, while the
  architecture docs treat n8n as optional per-client infrastructure.
- A lead-capture site whose only notification path is a console logger
  is not launch-ready, but no gate enforces that.

The default product needs to be named explicitly so launch gates can be
unambiguous and downstream slices (rollback, smoke, restore drill,
health, fleet) can build on a stable contract.

## Decision

The default product profile of this template is the **reliable
lead-gen website appliance**.

### Default-required components for production launch

- SvelteKit web service
- Postgres (forms, outbox, privacy retention)
- Long-lived worker for outbox processing
- Postmark for lead notification
- Backup primitives (PITR via WAL-G + logical pg_dump)
- Privacy retention
- Launch and deploy gates

### Optional per-client add-ons

- n8n (paid automation layer)
- Webhook automation provider
- Future automation providers

### Email delivery policy

| Environment | Postmark     | Console provider                          |
| ----------- | ------------ | ----------------------------------------- |
| local / dev | optional     | allowed                                   |
| test        | optional     | allowed                                   |
| production  | **required** | not launch-ready unless explicitly waived |

The waiver mechanism is an explicit env override
(`LAUNCH_ALLOW_CONSOLE_EMAIL=1`). It is not the default and is not
documented as a normal launch path. It exists so that a site under
repair or a non-lead-gen variant can pass gates without lying about
its state.

### Automation provider policy

- `AUTOMATION_PROVIDER` unset or `noop`: the worker runs, logs outbox
  events, takes no external delivery action. This is a valid
  production configuration.
- `AUTOMATION_PROVIDER=n8n`: the n8n webhook URL and shared secret
  become required at launch.
- `AUTOMATION_PROVIDER=webhook`: the generic webhook URL and secret
  become required at launch.
- The worker itself is required regardless of provider. Durable outbox
  processing is part of the reliability story even when the delivery
  is a noop.

### CMS

- Default CMS is Sveltia, git-backed.
- A DB-backed CMS mode is a future extension if a real client
  requires it. No `CMS_MODE` toggle is added until a second mode
  exists.

### Per-site Postgres

- Each client site bundle stays a dedicated per-site Postgres.
- No multi-tenant DB topology in this template.
- Revisit only if operating a fleet makes per-site overhead
  untenable.

## Consequences

- `scripts/check-launch.ts` and `scripts/deploy-preflight.ts` enforce
  Postmark in production unless explicitly waived, accept `noop` as a
  valid automation provider, and require provider-specific secrets
  only when their provider is selected.
- The README has a "Reliability surface" table that names this
  contract as the source of truth.
- Any future "optional infrastructure" claim is checked against this
  ADR before merging.
- A site without Postmark cannot pass `bun run check:launch` for
  production without an explicit waiver env.

## Out of scope (intentional)

The following are downstream slices that consume this contract; they
are not decided here:

- Rollback CLI and migration safety classification
- OpsResult / ops-status convergence
- Unified live health surface
- Multi-site fleet view
- Restore drill scheduling and evidence persistence
- E2E smoke through Postmark sandbox

Each will land in its own pass under `docs/planning/passes/` and may
introduce its own ADR.
