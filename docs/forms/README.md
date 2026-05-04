# Business Forms

This template treats business forms as durable lead-capture systems, not as
webhook buttons.

The professional default is:

1. Validate with Superforms + Valibot.
2. Save the source record in a typed Postgres table.
3. Insert a minimized outbox event in the same DB transaction.
4. Return success after the transaction commits.
5. Let `bun run automation:worker` deliver the event to n8n/webhook/console/noop
   with retries, backoff, locking, idempotency, and dead letters.

The app owns reliable capture. n8n owns workflow orchestration.

For new projects, start with the scaffold and then edit the generated source:

```bash
bun run scaffold:form -- --slug=idea-box --title="Idea Box" --description="Send a small project idea."
```

The scaffold writes ordinary files. It is not a runtime form builder. Review the
generated fields, then run `bun run db:generate` and apply the migration.

---

## Source Of Truth

| Contract                        | File                                                  | Purpose                                                       |
| ------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| Form registry                   | `src/lib/server/forms/registry.ts`                    | Lists business forms, source tables, PII, retention, commands |
| Form scaffold                   | `scripts/scaffold-form.ts`, `scripts/lib/scaffold.ts` | Generates the boring starter files for a typed form           |
| Operator CLI                    | `scripts/form-ops.ts`, `scripts/lib/form-ops.ts`      | Redacted submission/outbox/dead-letter inspection             |
| Form schemas                    | `src/lib/forms/*.schema.ts`                           | Valibot validation contracts                                  |
| Source tables                   | `src/lib/server/db/schema.ts`                         | Typed Postgres tables for submitted business data             |
| Automation event types          | `src/lib/server/automation/automation-provider.ts`    | Provider envelope TypeScript contract                         |
| Outbox payload/envelope helpers | `src/lib/server/automation/envelopes.ts`              | PII-minimized outbox payloads and provider envelope builders  |
| Enqueue helpers                 | `src/lib/server/automation/events.ts`                 | Insert pending outbox rows from server actions                |
| Automation handler registry     | `src/lib/server/automation/registry.ts`               | Maps outbox `event_type` values to worker delivery handlers   |
| Worker                          | `scripts/automation-worker.ts`                        | Claims, delivers, retries, and dead-letters automation events |
| Runtime event docs              | `docs/automations/runtime-event-contract.md`          | JSON envelope contract for n8n/webhook receivers              |
| Visual form rules               | `docs/design-system/forms-guide.md`                   | Markup, CSS classes, accessibility, Superforms integration    |
| Privacy rules                   | `docs/privacy/data-retention.md`                      | Retention and pruning expectations for submitted data         |

Run this whenever forms or automation contracts change:

```bash
bun run forms:check
bun run check
bun run test
```

`bun run validate:core` includes `forms:check`.

---

## Table Strategy

Use one typed source table per meaningful business workflow.

Good:

| Form                 | Source table            | Outbox event              |
| -------------------- | ----------------------- | ------------------------- |
| Contact form         | `contact_submissions`   | `lead.created`            |
| Quote request        | `quote_requests`        | `quote.requested`         |
| Consultation booking | `consultation_requests` | `consultation.requested`  |
| Newsletter signup    | `newsletter_signups`    | `newsletter.subscribed`   |
| Job application      | `job_applications`      | `job_application.created` |

Avoid one giant generic `form_submissions` JSON table for important workflows.
It looks flexible at first, but it makes reporting, retention, privacy review,
exports, and CRM mapping harder.

The shared table is the outbox:

| Table                      | Role                                                                 |
| -------------------------- | -------------------------------------------------------------------- |
| Form-specific source table | Owns the submitted business data                                     |
| `automation_events`        | Durable queue of external/internal work to do                        |
| `automation_dead_letters`  | Exhausted delivery failures with minimal diagnostics and no full PII |

---

## Add A New Business Form

Use this checklist for every form that mutates business data or starts a
workflow. The fast path is:

```bash
bun run scaffold:form -- --slug=quote-request --title="Quote Request" --description="Tell me what you want to build."
```

The generated starter includes:

- `src/lib/forms/{slug}.schema.ts`
- `src/routes/{slug}/+page.server.ts`
- `src/routes/{slug}/+page.svelte`
- a typed Drizzle source table in `src/lib/server/db/schema.ts`
- a registry entry in `src/lib/server/forms/registry.ts`
- a public route entry in `src/lib/seo/routes.ts`
- the generic `business_form.submitted` outbox event

It refuses to overwrite generated route/schema files unless `--force` is
passed. It does not generate migrations for you; after reviewing the table
shape, run:

```bash
bun run db:generate
bun run db:migrate
```

Manual form recipe:

### 1. Name The Workflow

Choose stable names before writing code:

| Thing           | Pattern           | Example                |
| --------------- | ----------------- | ---------------------- |
| Form id         | kebab-case        | `quote-request`        |
| Source table    | snake_case plural | `quote_requests`       |
| Outbox event    | domain verb       | `quote.requested`      |
| Idempotency key | event + source id | `quote.requested:{id}` |
| Route           | user-facing path  | `/quote`               |

Use past-tense event names when the source record has already committed:
`quote.requested`, `newsletter.subscribed`, `job_application.created`.

### 2. Add A Valibot Schema

Create `src/lib/forms/{form}.schema.ts`.

Rules:

- Keep browser-safe validation here.
- Do not put DB writes, env reads, email sends, or provider calls in schemas.
- Include a honeypot field for public lead forms unless there is a reason not to.
- Keep field names stable. Renames require DB, docs, n8n, and privacy updates.

### 3. Add The Source Table

Add a typed table in `src/lib/server/db/schema.ts`, then generate a migration:

```bash
bun run db:generate
```

Every lead-like table should usually include:

- `id`
- `created_at`
- core submitted fields
- `source_path`
- `user_agent`
- `request_id`

Only store what the business needs. Avoid "just in case" fields.

### 4. Add The Outbox Event Contract

New scaffolds default to the generic `business_form.submitted` event. That event
stores only:

- `form_id`
- `submission_id`
- `source_table`
- `source_path`
- `request_id`

Use it when the worker only needs to notify a generic receiver that a source
record exists, or while you are still shaping the project.

When a project needs a bespoke provider payload, update these files together:

1. `src/lib/server/automation/automation-provider.ts`
   - Add a data interface.
   - Add the event to `AutomationEventDataMap`.
2. `src/lib/server/automation/envelopes.ts`
   - Add a minimized outbox payload type.
   - Add an idempotency key helper.
   - Add a provider envelope builder.
3. `src/lib/server/automation/events.ts`
   - Add an enqueue helper that inserts a pending row into `automation_events`.
   - Store only source record IDs and operational metadata in `payload`.
4. `src/lib/server/automation/registry.ts`
   - Register a handler for the event type.
   - The handler should join back to the source table and build the provider envelope.
5. `docs/automations/runtime-event-contract.md`
   - Document the new JSON envelope.

Outbox payloads should reference source records. They should not duplicate names,
emails, phone numbers, messages, budgets, or other submitted PII.

### 5. Register The Form

Add an entry to `businessFormRegistry` in `src/lib/server/forms/registry.ts`.

The registry entry must identify:

- form id
- route
- schema path
- `+page.server.ts`
- `+page.svelte`
- source table
- outbox event, or `null` if no automation event exists
- PII fields
- PII classification
- retention policy
- retention days
- docs link or description
- inspection commands

Then run:

```bash
bun run forms:check
```

### 6. Build The Server Action

Use the contact form as the reference pattern:

1. `superValidate(event.request, valibot(schema))`
2. Return `fail(400, { form })` for invalid input.
3. Handle honeypot silently.
4. Apply rate limiting if public.
5. Collect `requestId`, `sourcePath`, and `userAgent`.
6. Open `db.transaction(...)`.
7. Insert the source record.
8. Insert the outbox event with the transaction client.
9. Commit.
10. Send any non-critical email notification after commit.
11. Return a calm success message.

Do not call n8n directly from the request lifecycle.

### 7. Build The Svelte Form

Use the markup rules in `docs/design-system/forms-guide.md`.

Required behavior:

- Use Superforms `superForm`.
- Use `.form`, `.field`, `.input`, `.field-error`, `.field-help`, and `.form-message`
  primitives.
- Keep labels visible.
- Preserve `aria-invalid` behavior.
- Use a hidden/offscreen honeypot for public lead forms.
- Never put validation logic in CSS.

### 8. Test It

Add focused tests for:

- schema validation
- successful DB transaction inserts source row and outbox row
- invalid form does not write
- honeypot returns success but does not write
- outbox payload does not duplicate PII
- envelope builder includes expected provider data
- worker handler rejects invalid payloads and missing source records

---

## Inspect Submissions

There is intentionally no built-in "view all submissions" page in the base
template. Submitted forms contain personal and business-sensitive data. A UI for
that data requires real authentication, authorization, audit expectations, and
route policy hardening.

Professional default:

1. Capture reliably in Postgres.
2. Deliver to n8n/CRM/email/Slack/etc. through the outbox worker.
3. Inspect directly through operator tools when needed.
4. Add a protected admin UI only for projects that truly need it.

Common inspection options:

```bash
bun run forms:ops -- list --form=contact
```

```bash
bun run forms:ops -- inspect --form=contact --id=<submission-id>
```

```bash
bun run forms:ops -- automation:pending
```

```bash
bun run forms:ops -- dead-letters
```

```bash
bun run forms:ops -- dead-letter:requeue --id=<dead-letter-id> --confirm
```

`forms:ops` redacts PII by default. Pass `--show-pii` only when you
intentionally need submitted values.

If a project needs an admin submissions page, add it as a separate authenticated
feature:

- protected route, never public
- `private` route policy
- noindex SEO
- real auth
- least-privilege access
- pagination
- redaction where possible
- no raw message rendering as HTML
- audit-friendly operator docs

Do not add an unauthenticated submissions dashboard to the base template.

---

## Worker Operations

Run one batch:

```bash
bun run automation:worker
```

Useful options:

```bash
bun run automation:worker -- --batch-size=25
bun run automation:worker -- --stale-after-seconds=900
bun run automation:worker -- --worker-id=worker-a
```

Production should run the worker on a timer or as a small supervised service.
Multiple workers can run safely because rows are claimed with Postgres locking
and `FOR UPDATE SKIP LOCKED`.

Worker outcomes:

| Outcome       | Meaning                                                               |
| ------------- | --------------------------------------------------------------------- |
| `delivered`   | Provider accepted the event                                           |
| `skipped`     | Provider intentionally did not deliver, usually disabled/unconfigured |
| `retried`     | Delivery failed and `next_attempt_at` was moved forward               |
| `dead-letter` | Max attempts exhausted; minimal failure row inserted                  |

---

## When A Form Does Not Need The Outbox

Some forms do not mutate important business data:

- search/filter forms
- calculators with no saved result
- local UI preference forms
- client-only estimators

Those may not need Superforms, a source table, or the outbox.

If a form captures a lead, sends a notification, creates a CRM record, changes
content, or starts a follow-up workflow, use the full pattern.
