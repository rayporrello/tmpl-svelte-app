# Privacy and Data Retention

This document is operational guidance, not legal advice. It gives projects a practical default for small business websites that collect contact form leads and optionally emit automation webhooks.

The code source of truth for default retention windows is `src/lib/server/privacy/retention.ts`. If those constants change, update this document in the same change.

---

## Data inventory

| Store                                         | Personal data risk                                                  | Purpose                                                  | Default retention                    |
| --------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------ |
| `contact_submissions`                         | Name, email, free-text message, source path, user agent, request ID | Respond to contact requests and diagnose delivery issues | `contactSubmissions`: 90 days        |
| `automation_events` with `status='completed'` | Outbox record with source record reference and delivery metadata    | Confirm outbound webhook delivery                        | `automationEventsCompleted`: 30 days |
| `automation_events` with `status='failed'`    | Exhausted outbox record with source record reference and error text | Investigate failed webhook delivery                      | `automationEventsFailed`: 60 days    |
| `automation_dead_letters`                     | Event type, source event reference, and error text only             | Diagnose webhook failures after delivery attempts fail   | `automationDeadLetters`: 30 days     |

Reasonable alternatives for `contact_submissions` are 30 days for simple inquiry sites, 180 days for longer sales cycles, and 365 days when the business has a documented follow-up or dispute-handling reason. Do not retain contact submissions indefinitely "just in case."

---

## Dead-letter PII policy

`automation_dead_letters` must not store full webhook payloads. The migration drops the `payload` column and keeps only:

- `event_id` — nullable source event reference with `ON DELETE SET NULL`
- `event_type`
- `error`
- `created_at`

The live webhook payload may include contact data because downstream tools may need it to notify the business. The persisted dead-letter record does not need a second copy of that data.

---

## Cleanup command

Run a dry-run first:

```bash
bun run privacy:prune
```

Apply deletion only when the counts look right:

```bash
bun run privacy:prune -- --apply
```

Override windows when a project has a documented reason:

```bash
bun run privacy:prune -- --contact-days=180 --automation-failed-days=90
```

Pending and processing automation events are excluded by default. To prune stale stuck records, pass an explicit age:

```bash
bun run privacy:prune -- --include-stale-pending-days=14 --apply
```

The command prints cutoff dates, matching counts, and deleted counts. It has no JSON output in v1.

---

## Backup ordering

Scheduled production maintenance should run pruning before creating a fresh database backup:

```bash
bun run privacy:prune -- --apply
bun run backup:db
```

The backup script does not auto-prune because retention is a project/operator decision. Existing backups may still contain rows that have since been deleted from the live database. Keep backup retention short enough to support recovery without preserving old PII longer than needed.

If a user deletion request is fulfilled in the live database, old backups should be treated as recovery-only copies until they age out. Do not restore a backup containing deleted personal data into production without re-applying the deletion or re-running the retention prune.

---

## Analytics separation

Analytics events must not contain names, emails, phone numbers, IP addresses, free-text messages, or raw contact payloads. Use opaque event IDs and aggregation-safe metadata only.

Contact form persistence and automation delivery records are operational data in Postgres. Browser analytics and server conversion events are separate systems and have their own controls and retention settings. If GA4 is enabled, review the GA4 property's user-level and event-level retention settings during launch.

---

## Logs and stdout

The default console email provider is for development and logs only routing metadata plus the message length, but its `subject` and `replyTo` can include contact form name/email. Production projects should configure a real email provider, restrict log access, and set host-level log rotation/retention appropriate to the site.

Do not log raw message bodies, cookies, authorization headers, API tokens, or rendered `.env` values.

---

## User deletion requests

For a deletion request, use a documented manual process:

1. Verify the requester enough to avoid deleting the wrong person's data.
2. Search `contact_submissions` by email address and any provided request context.
3. Delete matching live rows from `contact_submissions`.
4. Delete or review related `automation_events` rows by `submission_id` if the project stores that value in event payloads.
5. Review `automation_dead_letters` by `event_id` if a related source event is known.
6. Document whether backup copies will age out on the normal backup schedule.

Do not expose deletion as a public app endpoint in the base template. Small sites are better served by a careful operator-run process than by an unauthenticated or under-designed deletion API.
