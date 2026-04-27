# Automations — n8n as Optional External Operator

This template is **automation-ready by default**. n8n is a first-class automation layer — but it is entirely optional. The site builds, deploys, and serves content without it.

---

## Design principle

n8n is an **external operator**, not an embedded dependency. It lives outside the SvelteKit application and interacts with it through well-defined interfaces:

1. **Content automations** — n8n writes Git-backed files to `content/` via the GitHub API
2. **Runtime automations** (Phase 5) — n8n receives typed webhook events from form/action code running against Postgres

The website must work correctly when n8n is unavailable, unreachable, or not configured.

---

## What n8n is not

- Not a package installed in this repo
- Not required for `bun run build` or `bun run dev`
- Not embedded in SvelteKit server routes
- Not a replacement for the CMS — it is a complementary interface over the same content files

---

## Two automation categories

### 1. Content automations

n8n reads and writes files in `content/` through the GitHub API. The files follow the same schema as Sveltia CMS.

Examples of content automations:

- HR system creates `content/team/{slug}.yml` when a new employee is onboarded
- Review platform creates `content/testimonials/{slug}.yml` when a new review is collected
- ATS creates `content/jobs/{slug}.md` (if a jobs collection is added)
- Broken-link monitor crawls `/sitemap.xml` and sends an alert

See [docs/automations/n8n-patterns.md](n8n-patterns.md) for workflow patterns.
See [docs/automations/content-automation-contract.md](content-automation-contract.md) for the rules n8n must follow.

### 2. Runtime automations (Phase 5 — partially scaffolded)

Form/action code saves to Postgres, then emits a typed webhook event to n8n. n8n handles downstream tasks (email, CRM update, Slack alert, etc.).

What's already in place:

- A dormant Superforms + Valibot contact form at `src/routes/contact-example/` (rename to `/contact` to activate)
- An `EmailProvider` seam at `src/lib/server/forms/email-provider.ts` with a `console` default and a `postmark.example.ts` swap target
- An in-memory token-bucket rate limiter at `src/lib/server/forms/rate-limit.ts` (gated by `RATE_LIMIT_ENABLED`)
- Env contract for `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET` in `.env.example`

Still pending (Phase 5, after Postgres lands):

- The typed automation event emitter (`src/lib/automation/events.ts`) and HMAC signing (`src/lib/automation/signing.ts`)
- `lead.created` emission from the contact form server action
- `newsletter.subscribed` emission from a newsletter form
- Dead-letter table for failed webhook events

Example future flows:

- Contact form submitted → `lead.created` event → n8n sends notification email
- Newsletter signup → `newsletter.subscribed` event → n8n adds subscriber to mailing list
- User submits a testimonial → `testimonial.submitted` event → n8n creates a draft file in `content/testimonials/`

See [docs/planning/runtime-event-contract.md](../planning/runtime-event-contract.md) for the planned event shape (Phase 5 spec).

---

## First recommended automation

When Phase 5 forms are implemented, the first recommended automation is:

> Contact form submission → `lead.created` webhook → n8n sends notification email to the site owner

This requires:

- A contact form at `/contact` using Superforms + Valibot
- A server action that saves to Postgres and fires a non-blocking webhook
- An n8n workflow with an HTTP Trigger node listening for `lead.created` events

---

## Security

All production webhook calls to n8n should be signed using a shared secret. See [docs/automations/security-and-secrets.md](security-and-secrets.md).

---

## Further reading

- [n8n-patterns.md](n8n-patterns.md) — specific workflow patterns with examples
- [content-automation-contract.md](content-automation-contract.md) — rules for writing content files from n8n
- [docs/planning/runtime-event-contract.md](../planning/runtime-event-contract.md) — typed event design for Phase 5 (lives under planning/ until the emitter ships)
- [security-and-secrets.md](security-and-secrets.md) — secrets, signing, and env vars
- [docs/cms/README.md](../cms/README.md) — how content files work and how they relate to automations
