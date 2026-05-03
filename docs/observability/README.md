# Observability — Overview

This template ships a **lean default observability spine** for small websites. Medium and large sites can extend it without changing the baseline.

---

## What is included by default

| Feature                        | File / system                                  |
| ------------------------------ | ---------------------------------------------- |
| Friendly error page            | `src/routes/+error.svelte`                     |
| Liveness endpoint              | `src/routes/healthz/+server.ts`                |
| Readiness endpoint             | `src/routes/readyz/+server.ts`                 |
| Structured server logging      | `src/lib/server/logger.ts`                     |
| Request ID propagation         | `src/lib/server/request-id.ts`                 |
| Safe error normalization       | `src/lib/server/safe-error.ts`                 |
| Observability types            | `src/lib/observability/types.ts`               |
| Centralized error handling     | `src/hooks.server.ts`                          |
| Durable automation diagnostics | `automation_events`, `automation_dead_letters` |

These are the minimum viable safety tools for any website built from this template.

---

## What is optional

Nothing in the base template requires an external observability service. The following are documented for medium and large sites but are **not installed by default**:

- **Sentry** or equivalent frontend/backend error tracking
- **OpenTelemetry** distributed traces and correlation IDs
- **Grafana + Prometheus + Loki** metrics and log aggregation
- **n8n Error Workflow** for automated failure alerts
- **Uptime monitor** (UptimeRobot, Better Uptime, etc.)

---

## Why tiered observability?

Not every website needs the same tooling. A simple landing site and a revenue-critical SaaS product have different needs, but both should have basic error visibility and operational docs.

This template uses three official tiers:

| Tier       | Site type                     | Core tools                                                             |
| ---------- | ----------------------------- | ---------------------------------------------------------------------- |
| **Small**  | Public content/landing        | Error page, `/healthz`, `/readyz`, structured logs, outbox diagnostics |
| **Medium** | CMS/forms/n8n lead generation | + Sentry, n8n Error Workflow, backup verification, worker monitoring   |
| **Large**  | Revenue-critical/auth/payment | + OpenTelemetry, SLOs, incident runbooks, alert escalation             |

See [docs/observability/tiers.md](tiers.md) for the complete tier model.

Installing the full enterprise observability stack in a landing-page template is overengineering. Instead, the template creates **seams** — request IDs, typed log context, and provider-neutral automation envelopes — so medium/large features can be added cleanly later.

---

## Further reading

- [tiers.md](tiers.md) — the official tier model with upgrade paths
- [error-handling.md](error-handling.md) — friendly errors, structured logging, request IDs, form handling
- [n8n-workflows.md](n8n-workflows.md) — n8n naming conventions, payload shape, failure policy
- [runbook.md](runbook.md) — practical operator runbook for common failure scenarios
