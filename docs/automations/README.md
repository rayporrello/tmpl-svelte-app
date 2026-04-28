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

### 2. Runtime automations — live at `/contact`

Form/action code saves to Postgres, then emits a typed webhook event to n8n. n8n handles downstream tasks (email, CRM update, Slack alert, etc.).

**What ships in this template:**

- A production-ready contact form at `src/routes/contact/` (indexable, no setup needed)
- The form saves every submission to `contact_submissions` before attempting anything else
- `emitLeadCreated()` at `src/lib/server/automation/events.ts` — typed `lead.created` event with HMAC signing
- `resolveEmailProvider()` at `src/lib/server/forms/providers/index.ts` — picks Postmark or console based on env
- An in-memory token-bucket rate limiter at `src/lib/server/forms/rate-limit.ts` (gated by `RATE_LIMIT_ENABLED`)
- `automation_dead_letters` table for failed webhook events

**Failure handling:**

| Step        | If it fails                                                     |
| ----------- | --------------------------------------------------------------- |
| DB insert   | Returns error to user — submission not recorded                 |
| Email send  | Logged, user still sees success — lead is not lost              |
| n8n webhook | Dead-lettered to `automation_dead_letters` — form is unaffected |

**To activate n8n:**

```
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/YOUR_ID
N8N_WEBHOOK_SECRET=a-long-random-string
```

Set both vars and restart. The contact form starts emitting signed `lead.created` events immediately.

**Example flows (already wired):**

- Contact form submitted → `lead.created` → n8n sends notification email to owner
- n8n down → dead-letter in `automation_dead_letters` → form still works

**Future event types to add:**

- `newsletter.subscribed` — from a newsletter signup form
- `testimonial.submitted` — user submits a testimonial

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
