# Observability — Overview

This template ships a **lean default observability spine** for small websites. Medium and large sites can extend it without changing the baseline.

---

## What is included by default

| Feature | File |
|---------|------|
| Friendly error page | `src/routes/+error.svelte` |
| Health endpoint | `src/routes/healthz/+server.ts` |
| Structured server logging | `src/lib/server/logger.ts` |
| Request ID propagation | `src/lib/server/request-id.ts` |
| Safe error normalization | `src/lib/server/safe-error.ts` |
| Observability types | `src/lib/observability/types.ts` |
| Centralized error handling | `src/hooks.server.ts` |

These are the minimum viable safety tools for any website built from this template.

---

## What is optional

Nothing in the base template requires an external observability service. The following are documented for medium and large sites but are **not installed by default**:

- **Sentry** or equivalent frontend/backend error tracking
- **OpenTelemetry** distributed traces and correlation IDs
- **Grafana + Prometheus + Loki** metrics and log aggregation
- **n8n Error Workflow** for automated failure alerts
- **Uptime monitor** (UptimeRobot, Better Uptime, etc.)
- **Dead-letter / event tables** for failed workflow events

---

## Why tiered observability?

Not every website needs the same tooling. A simple landing site and a revenue-critical SaaS product have different needs, but both should have basic error visibility and operational docs.

This template uses three official tiers:

| Tier | Site type | Core tools |
|------|-----------|-----------|
| **Small** | Static/content/landing | Error page, `/healthz`, structured logs, uptime check |
| **Medium** | CMS, forms, Postgres, n8n | + Sentry, `/readyz`, n8n Error Workflow, backup verification |
| **Large** | Revenue-critical, auth, payments | + OpenTelemetry, SLOs, incident runbooks, dead-letter handling |

See [docs/observability/tiers.md](tiers.md) for the complete tier model.

Installing the full enterprise observability stack in a landing-page template is overengineering. Instead, the template creates **seams** — request IDs, typed log context, a `WorkflowEventPayload` shape — so medium/large features can be added cleanly later.

---

## Further reading

- [tiers.md](tiers.md) — the official tier model with upgrade paths
- [error-handling.md](error-handling.md) — friendly errors, structured logging, request IDs, form handling
- [n8n-workflows.md](n8n-workflows.md) — n8n naming conventions, payload shape, failure policy
- [runbook.md](runbook.md) — practical operator runbook for common failure scenarios
