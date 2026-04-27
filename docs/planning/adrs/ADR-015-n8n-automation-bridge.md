# ADR-015 — n8n as Optional First-Class Automation Layer

**Status:** Accepted
**Date:** 2026-04-27

---

## Context

Sites built from this template commonly need two kinds of automation:

1. **Content automations** — external events (HR systems, review platforms, monitoring tools) that should create or update site content files
2. **Runtime automations** — form submissions and user actions that should trigger downstream tasks (emails, CRM updates, Slack alerts)

The template already adopts Postgres for runtime data (ADR-004) and Sveltia CMS for Git-backed editorial content (ADR-014). An automation layer is needed to bridge these systems with external services and trigger workflows without requiring custom code for each integration.

Requirements:

- Non-developer-friendly workflow builder (visual)
- Can operate on Git-backed content files (write to GitHub)
- Can receive webhooks from SvelteKit server actions
- Self-hostable (fits the Podman + Caddy deployment model)
- Must not be required for the website to function

## Decision

Treat **n8n** as an optional first-class automation layer for websites built from this template.

### Key constraints

1. **n8n is optional.** The website must build, deploy, and serve all content correctly whether or not n8n is installed, configured, or reachable.

2. **n8n is external.** It is not a package dependency in this repo (`package.json`). It runs as a separate Podman container. It is not imported or required by any SvelteKit module.

3. **Two categories of n8n interaction:**
   - _Content automations:_ n8n writes files to `content/` through the GitHub API. These files must follow the same schema as Sveltia CMS defines in `static/admin/config.yml`.
   - _Runtime automations (Phase 5):_ SvelteKit server actions save to Postgres, then emit a typed webhook event to n8n. n8n handles downstream tasks. The webhook call is non-blocking — user-facing flows must not fail if n8n is down.

4. **Webhook security:** Production webhook calls from SvelteKit to n8n must be signed using HMAC-SHA256 with a shared secret (`N8N_WEBHOOK_SECRET`). Unsigned production webhooks are not acceptable.

5. **AI-generated content defaults to draft.** Any n8n workflow that uses an AI node to generate content must set `draft: true` (articles) or `published: false` (testimonials) on the generated file. Direct-to-main publish of AI content requires explicit editorial configuration and review.

6. **Content automation files must match the CMS schema.** n8n writes and Sveltia CMS writes are not separate systems — they write the same files to the same paths following the same schema. A content automation that invents new fields without updating `static/admin/config.yml`, `types.ts`, loaders, and components breaks the site.

## Consequences

**Positive:**

- Editors and non-developers can build integrations without custom code
- Content automations and editorial workflows share a single source of truth (Git)
- n8n's optional nature means every site starts lean — automations are added only when needed
- The self-hosted posture fits the existing Podman + Caddy infrastructure
- Typed webhook events create a stable interface between the SvelteKit app and external workflows

**Negative / tradeoffs:**

- n8n workflow JSON is not version-controlled in this repo by default (it lives in n8n's own database); teams should export and back up workflows separately
- If n8n is unavailable and a runtime webhook call fails silently, the failure may not be noticed without logging
- Content automations that write directly to `main` carry deployment risk — a malformed file triggers a failed build

## Alternatives considered

- **Zapier / Make:** Hosted automation platforms. Not self-hostable; adds external dependencies and cost. Against the template's self-hosted posture.
- **Custom webhook handlers in SvelteKit:** Higher developer cost for each integration. Appropriate for simple one-off webhooks, not for multi-step workflows.
- **Temporal:** More suitable for long-running, code-level workflow orchestration. Higher complexity than the use cases here warrant.
- **No automation layer (pure code):** Valid for simple sites. This decision does not mandate n8n — it documents the recommended approach when automations are needed.

## Implementation notes

- n8n is not installed or required in this template's `package.json`
- Env vars `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET` are documented in `.env.example` as empty placeholders
- Docs: `docs/automations/` — README, n8n-patterns.md, content-automation-contract.md, security-and-secrets.md
- Phase 5 spec: `docs/planning/runtime-event-contract.md` (lives under planning/ until the runtime emitter ships)
- Phase 5 will implement `src/lib/automation/events.ts` (non-blocking webhook emitter) and `src/lib/automation/signing.ts` (HMAC signing)

## Revisit triggers

- If n8n's self-hosted deployment complexity outweighs its value for simpler sites
- If a project requires exactly-once delivery guarantees (consider adding the `automation_events` Postgres table with retry logic)
- If an alternative automation platform becomes more suitable for the self-hosted posture
