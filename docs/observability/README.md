# Observability — Overview

This template ships a single, opinionated observability baseline that every site
built from it inherits. The baseline is enough to run a database-backed lead-gen
site responsibly. Optional extensions exist for projects that genuinely need
them — they are dormant until configured, not a tiered upgrade path you have to
choose between up front.

---

## Baseline (always present)

| Capability                     | File / system                                  |
| ------------------------------ | ---------------------------------------------- |
| Friendly error page            | `src/routes/+error.svelte`                     |
| Liveness endpoint (`/healthz`) | `src/routes/healthz/+server.ts`                |
| Readiness endpoint (`/readyz`) | `src/routes/readyz/+server.ts`                 |
| Structured server logging      | `src/lib/server/logger.ts`                     |
| Request ID propagation         | `src/lib/server/request-id.ts`                 |
| Safe error normalization       | `src/lib/server/safe-error.ts`                 |
| Observability types            | `src/lib/observability/types.ts`               |
| Centralized error handling     | `src/hooks.server.ts`                          |
| Durable automation diagnostics | `automation_events`, `automation_dead_letters` |
| Caddy access logs              | `deploy/Caddyfile.example`                     |
| Application stdout via journal | Podman + systemd                               |

These run for every site without configuration. They never go away.

---

## What this baseline gives you

- A user-facing error page that does not leak stack traces.
- Two distinct health probes — `/healthz` for process liveness (used by the
  Caddy upstream check and the container `HEALTHCHECK`), `/readyz` for database
  readiness (returns 503 if Postgres is unreachable; appropriate for orchestrator
  readiness gates).
- A structured JSON log line for every server request, with a `requestId` that
  propagates through hooks, server actions, and the friendly error page so a
  user can quote the ID in a support email and you can find the exact request
  in `journalctl`.
- A durable record of every automation attempt in `automation_events` — what
  was sent, what came back, how many retries, whether it ended up
  dead-lettered. The form action saves the lead to the database first, so you
  never lose a lead because n8n was down.
- Caddy access logs and the SvelteKit app's stdout both flow into journald
  via Podman; `journalctl --user -u <project>-web -f` gets you a live tail.

For most lead-gen sites, this is the complete observability story. You do not
need to add anything.

---

## Optional extensions (activate per project)

The baseline is intentionally not extended in the base template. The seams
below exist so a project can opt into a specific extension when it has a
specific need — not because every "important" project should add all of them.

### Error tracking — Sentry or equivalent

When to add: you want stack traces, breadcrumbs, and release tracking for a
project where production exceptions matter enough to triage individually.
Common triggers: paid customer flow, auth, a form that drives revenue, a
client who expects an error report.

How: install `@sentry/sveltekit` per project, instrument `src/hooks.server.ts`
and `src/hooks.client.ts`. The baseline `safe-error.ts` already produces clean
error objects suitable for breadcrumbs.

Do not install Sentry in the base template — it is per-project, and the
free tier ceiling is project-specific.

### n8n error workflow

When to add: any time you have an automation workflow that handles leads,
payments, or notifications. n8n's built-in **Error Workflow** feature catches
unhandled failures from any other workflow and routes them to a Slack channel
or email list.

How: build one error workflow per n8n instance, set it as the global error
workflow in n8n settings. The baseline `automation_dead_letters` table is the
last-resort backstop on the website side; the n8n error workflow catches
failures inside n8n itself.

### Distributed tracing — OpenTelemetry

When to add: the site is one of several services in a request path, and you
need to follow a request across service boundaries. Rare for a lead-gen site,
common for a SaaS product.

How: instrument `hooks.server.ts` to start a span per request and use the
existing `event.locals.requestId` as a span attribute. The baseline already
propagates `requestId` end-to-end, so OpenTelemetry slots in cleanly without
changing how server actions log.

### External uptime monitor

When to add: every production site, basically. The template does not bundle
one because the choice is preference: UptimeRobot (free), Better Uptime,
Healthchecks.io, Cronitor, etc. Point any of them at `https://<domain>/healthz`.
Platform backup/restore pings are configured from `web-data-platform`.

### Metrics dashboards — Grafana / Prometheus

When to add: rare for a single-host lead-gen site. Justified when you are
running enough sites or enough traffic that you need aggregate visibility
across them, or when a client requires a dashboard.

How: out of scope for the base template; install per project against your
monitoring stack of choice.

---

## What is intentionally rejected for the baseline

| Feature                             | Reason                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| OpenTelemetry in the base template  | Overhead and config burden not justified for a lead-gen baseline                 |
| Sentry in the base template         | Paid SaaS; install per project so usage tracking and quota live with the project |
| Grafana/Prometheus/Loki as defaults | Requires separate infrastructure; install per project when the need is real      |
| n8n required for every site         | n8n is enabled when a project actually has automations; sites work without it    |
| Logging raw form payloads           | Privacy risk — PII must never be logged                                          |
| Logging full request bodies         | Security risk — credentials may appear in request bodies                         |

---

## Further reading

- [error-handling.md](error-handling.md) — friendly errors, structured logging, request IDs, form handling
- [n8n-workflows.md](n8n-workflows.md) — n8n naming conventions, payload shape, failure policy
- [runbook.md](runbook.md) — practical operator runbook for common failure scenarios
