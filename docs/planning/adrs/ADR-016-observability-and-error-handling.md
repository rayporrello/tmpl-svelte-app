# ADR-016 — Tiered Observability and Error Handling

**Status:** Accepted  
**Date:** 2026-04-27  
**Supersedes:** None  
**Related:** ADR-001, ADR-007 (Podman/Caddy), ADR-015 (n8n automation bridge)

---

## Context

The template must provide error visibility and operational safety for every website built from it — from a simple landing page to a revenue-critical product site. These sites have different needs:

- A landing page needs a friendly error page and a health endpoint. It does not need dashboards, OpenTelemetry, or complex alerting.
- A CMS-heavy lead-gen site needs Sentry, a readiness check, n8n failure alerts, and backup verification.
- A revenue-critical site with auth and payments needs distributed tracing, SLOs, incident runbooks, and dead-letter handling.

Installing the full enterprise observability stack in every site from this template would:

- Add unnecessary cost and maintenance burden to small sites.
- Create false confidence (an always-healthy `/readyz` with no real checks).
- Introduce dependencies that require separate infrastructure to operate.

At the same time, installing nothing would mean silent failures, invisible errors, and no operational playbooks.

---

## Decision

Adopt a **tiered observability model** with a lean default base spine.

### What is locked in the base template

| Feature                                  | File                             |
| ---------------------------------------- | -------------------------------- |
| Friendly error page                      | `src/routes/+error.svelte`       |
| Health endpoint (process liveness only)  | `src/routes/healthz/+server.ts`  |
| Structured server logging with redaction | `src/lib/server/logger.ts`       |
| Request ID propagation                   | `src/lib/server/request-id.ts`   |
| Safe error normalization                 | `src/lib/server/safe-error.ts`   |
| Shared observability types               | `src/lib/observability/types.ts` |
| Centralized error handler                | `src/hooks.server.ts`            |

These are included in every site built from the template, regardless of tier.

### The three official tiers

| Tier       | Site type                        | Additional tooling                                         |
| ---------- | -------------------------------- | ---------------------------------------------------------- |
| **Small**  | Static, content, landing         | (Base template only)                                       |
| **Medium** | CMS, forms, Postgres, n8n        | Sentry, `/readyz`, n8n Error Workflow, backup verification |
| **Large**  | Revenue-critical, auth, payments | OpenTelemetry, SLOs, incident runbooks, dead-letter tables |

See [docs/observability/tiers.md](../../../docs/observability/tiers.md) for the complete tier model.

### n8n conventions

n8n workflow naming, payload shape, failure policy, and security posture are documented in [docs/observability/n8n-workflows.md](../../../docs/observability/n8n-workflows.md). These conventions apply to any site that enables n8n.

---

## Consequences

**Positive:**

- Every site has a minimal safety spine from day one.
- Small sites do not carry infrastructure they do not need.
- The seams (request IDs in `event.locals`, typed `WorkflowEventPayload`, structured log context) make it clean to add Tier 2/3 features later.
- Agent rules prevent ad hoc `console.error` sprawl and secret leakage in logs.

**Negative:**

- Tier 2/3 features require deliberate per-project installation. There is no automatic upgrade.
- A solo operator who does not read the tiers doc may miss that Sentry is needed on a Tier 2 site.

---

## Alternatives considered

**Install Sentry in the base template**  
Rejected. Sentry is a paid external service. It should be a per-project decision, not a template default.

**Install OpenTelemetry in the base template**  
Rejected. OpenTelemetry requires an OTLP endpoint (Jaeger, Tempo, etc.) to be useful. That infrastructure does not exist in the base template. The request ID seam provides the correlation anchor needed to add OpenTelemetry later.

**Use a logging library (pino, winston)**  
Rejected for this pass. The built-in structured logger using `console.log` + JSON is dependency-free and sufficient for Tier 1. A production Tier 2/3 site may swap it for pino — the API is compatible.

**No observability defaults**  
Rejected. Silent failures and invisible errors are not acceptable even on small sites.

---

## What remains configurable

- Error tracking provider (Sentry, Highlight, or custom)
- Uptime monitoring provider (UptimeRobot, Better Uptime, etc.)
- Alert channel (Slack, email, PagerDuty)
- Whether n8n is used and which workflows are enabled
- Whether workflow events are logged to Postgres
- Log retention policy and destination

---

## Deferred

- OpenTelemetry implementation (Tier 3 only; seam is in place via `event.locals.requestId`)
- Full dashboards and metrics aggregation
- Pager-style escalation and on-call rotation
- Dead-letter / failed-event tables (deferred until Postgres is active in Phase 5)
- `/readyz` implementation (deferred until runtime dependencies exist in Phase 5)

---

## Rejected as overengineering

- Full enterprise observability stack in the base template
- OpenTelemetry by default
- Logging raw form payloads
- Treating n8n as required for all sites
- Adding Grafana/Prometheus/Loki to the template infrastructure
