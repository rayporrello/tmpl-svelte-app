# Observability Tiers

The template uses three official observability tiers. Choose based on the site type and operational requirements.

---

## Tier 1 — Small

**Use for:** Public content sites, landing pages, and basic lead-generation sites on the template baseline.

**Risk profile:** Low. Postgres and contact capture are present, but there are no payments, auth, or revenue-critical workflows.

### Build / include

- `src/routes/+error.svelte` — friendly user-facing error page
- `src/routes/healthz/+server.ts` — process liveness check
- `src/routes/readyz/+server.ts` — Postgres readiness check
- `src/hooks.server.ts` — centralized error handling with structured logging
- `src/lib/server/logger.ts` — structured JSON logs with request ID and redaction
- `src/lib/server/request-id.ts` — request ID propagation
- `src/lib/server/safe-error.ts` — prevents stack traces from reaching the browser
- `automation_events` / `automation_dead_letters` — durable runtime automation diagnostics
- Application logs via stdout (captured by container runtime or Caddy)
- Caddy access logs (included in the deployment template)
- Basic uptime monitor (UptimeRobot free tier, Better Uptime, or equivalent)
- SSL certificate expiry alert
- Simple manual post-deploy review

### Do not include by default

- OpenTelemetry
- Dashboards
- Complex alert routing
- Sentry or equivalent error tracking SaaS

---

## Tier 2 — Medium

**Use for:** CMS-heavy sites, lead generation, forms, Postgres, n8n automations, email delivery.

**Risk profile:** Medium. Form submissions and CMS edits have business impact. Workflow failures lose leads.

### Add on top of Tier 1

- **Sentry** (or equivalent): frontend + backend error tracking
  - Install per project: `bun add @sentry/sveltekit`
  - Do not add to the base template
- **Scheduled automation worker monitoring**: confirm `bun run automation:worker` runs and failed/dead-letter counts are reviewed
- **n8n Error Workflow**: catch-all that alerts via Slack or email on unhandled workflow failures
- **Scheduled workflow heartbeat checks**: a monitor workflow that fires on a cron and alerts when it stops
- **Workflow failure alert channel**: Slack channel or email list for failed workflow notifications
- **Backup verification**: periodic check that backups complete and restore correctly
- **Form submission audit trail**: log to Postgres when appropriate for lead recovery

---

## Tier 3 — Large

**Use for:** Revenue-critical sites, auth, payments, important integrations, multi-step workflows.

**Risk profile:** High. Failures have direct financial or compliance impact.

### Add on top of Tier 2

- **OpenTelemetry-ready correlation IDs**: attach trace IDs to all server requests
  - The base template already propagates `requestId` via `event.locals.requestId`; OpenTelemetry can use this as a root span attribute
- **Alert severity levels**: P1 (revenue/auth down), P2 (degraded), P3 (minor anomaly)
- **Incident runbook per critical path**: what to do when checkout fails, auth fails, email delivery fails
- **Idempotency keys for workflow-triggering actions**: prevent double-processing on retries
- **Deployment rollback docs**: step-by-step for rolling back a bad deploy
- **SLOs**: define and track uptime, latency, error rate targets
- **Post-incident review template**: structured doc for retrospectives

---

## What is rejected for any tier

| Feature                            | Reason                                                          |
| ---------------------------------- | --------------------------------------------------------------- |
| OpenTelemetry in base template     | Overengineering for landing pages                               |
| Sentry in base template            | Paid service; install per project                               |
| Grafana/Prometheus/Loki as default | Requires separate infrastructure; not justified for small sites |
| n8n required for all sites         | n8n is optional; site must work without it                      |
| Logging raw form payloads          | Privacy risk; PII must never be logged                          |
| Logging full request bodies        | Security risk; credentials may be in request bodies             |

---

## Upgrade path

When a site grows from Tier 1 to Tier 2:

1. Install Sentry or an equivalent error tracker per the project `CLAUDE.md`
2. Schedule and monitor `bun run automation:worker`
3. Create an n8n Error Workflow before creating any automation that handles leads or payments
4. Set up a workflow heartbeat check
5. Document backup verification and restore testing

When a site grows from Tier 2 to Tier 3:

1. Enable OpenTelemetry (instrument `hooks.server.ts` and key server actions)
2. Attach `requestId` from `event.locals` to all critical outbound events
3. Define SLOs and a monitoring dashboard
4. Write incident runbooks for each critical user path
5. Add alert severity and escalation routing
