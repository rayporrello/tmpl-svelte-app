# n8n Workflow Contract

The wire-level contract between a site built from this template and the n8n
instance that serves as its automation operator. This is what an n8n workflow
author needs to know to receive events safely and reliably.

The companion docs:

- [README.md](README.md) — when to use n8n vs other providers, and the reliability principle.
- [runtime-event-contract.md](runtime-event-contract.md) — the TypeScript event contract.
- [n8n-patterns.md](n8n-patterns.md) — concrete workflow examples (lead routing, content sync, error workflows).

---

## External n8n endpoint

n8n is optional and external to the website appliance. When a site uses n8n,
provision it separately (n8n.cloud, a shared self-hosted n8n, or a dedicated
n8n host) and set `AUTOMATION_PROVIDER=n8n` with `N8N_WEBHOOK_URL` and
`N8N_WEBHOOK_SECRET` pointing at that endpoint.

The site bundle still owns only web, Postgres, and worker. n8n owns its own
runtime, data, upgrades, and backups outside this repo.

## What the site sends

Every event is a single HTTP request:

```
POST <N8N_WEBHOOK_URL>
Content-Type: application/json
X-Site-Auth: <N8N_WEBHOOK_SECRET>           ← default; see Auth modes below
X-Site-Event-Id: <idempotency-key>          ← e.g. "lead.created:sub-abc123"
X-Site-Event-Type: <event-name>             ← e.g. "lead.created"
X-Site-Timestamp: <ISO-8601 UTC>            ← when the source record was committed

{
  "event": "lead.created",
  "version": 1,
  "occurred_at": "2026-05-05T12:00:00.000Z",
  "idempotency_key": "lead.created:sub-abc123",
  "data": {
    "submission_id": "sub-abc123",
    "name": "Alice Example",
    "email": "alice@example.com",
    "source_path": "/contact",
    "request_id": "req-xyz"
  }
}
```

The event types currently emitted are `lead.created` (from the contact form)
and `business_form.submitted` (from scaffolded business forms). The site
sends the same envelope shape for every event type; only the `event` and
`data` fields vary.

---

## Auth modes

Two auth modes are supported. Pick one per site (n8n can't validate both at
once on the same Webhook node), and **configure it on both sides**.

### Header auth (default — recommended)

Site-side env:

```env
N8N_WEBHOOK_AUTH_MODE=header              # default
N8N_WEBHOOK_AUTH_HEADER=X-Site-Auth       # default
N8N_WEBHOOK_SECRET=<long random string>
```

Site sends:

```
X-Site-Auth: <secret>
```

n8n side: in the Webhook node, set **Authentication → Header Auth**, and
create a Header Auth credential whose **Name** is `X-Site-Auth` and whose
**Value** matches `N8N_WEBHOOK_SECRET`. n8n returns 401 on mismatch
automatically — no Code node needed.

This is the default because it is the simplest correct configuration. It
does not authenticate the body, only the request, but TLS protects the body
in transit and webhook URLs are unguessable per workflow.

### HMAC body signing (stronger — opt-in)

Site-side env:

```env
N8N_WEBHOOK_AUTH_MODE=hmac
N8N_WEBHOOK_SECRET=<long random string>
```

Site sends:

```
X-Webhook-Signature: <hex(HMAC-SHA256(body, secret))>
```

n8n side: the Webhook node's built-in auth options do not include HMAC, so
add a Code node immediately after the Webhook node that computes the same
HMAC over the raw body and compares it to the header. Reject mismatches.

Use HMAC when the request body itself must be authenticated (e.g., the
webhook URL is broadcast or logged where it could be replayed).

---

## Idempotency

Every request carries `X-Site-Event-Id` (also in the body as `idempotency_key`).
The site always uses the same key for the same source record, so a workflow
that retries a request will see the same key. Use it to deduplicate.

In an n8n workflow, the simplest deduplication pattern:

1. **Set** node: extract `X-Site-Event-Id` into a variable.
2. **Postgres / Airtable / Sheets** node: try to write a row keyed by event ID
   with `ON CONFLICT DO NOTHING` (Postgres) or equivalent.
3. **If** node: branch on whether the row was new — only run the Slack /
   email steps if it was. Otherwise return 200 quickly.

If your destination has no natural unique constraint, store seen event IDs
in a small n8n Postgres table or in Redis with a TTL of a few days.

---

## Standard "lead → Slack → email" workflow shape

A minimum-viable lead-routing workflow:

1. **Webhook trigger** (Header auth → `X-Site-Auth`).
2. **Set** node: extract `data.name`, `data.email`, `data.source_path`, `idempotency_key`.
3. **Postgres** node (deduplication): `INSERT ... ON CONFLICT DO NOTHING` keyed by event ID.
4. **If** node: continue only if the dedup insert was new.
5. **Slack** node: post to `#leads` with name, email, source path, link to `/admin` for full submission.
6. **Send Email** node: notify the studio's intake address with the same fields.
7. **Respond to Webhook** node: 200 OK.

Latency budget: the site request times out the worker after 5 seconds. n8n
should respond well under that — fan-out work that takes longer (calls to
slow external APIs, AI summarization) belongs in a follow-on workflow
triggered by your dedup table or by an n8n queue.

---

## What happens when n8n is down

The worker's outbox does the work:

- The form action is unaffected — the source record committed before the
  worker ran. The user gets the success page.
- The worker's HTTP send fails with `network`, `http`, or `timeout`. The
  event row goes back to `pending` with an exponentially-backed-off
  `next_attempt_at` (60s, 120s, 240s, … capped at 1h).
- Once n8n is reachable again, the next worker tick picks up the backlog.
- After 5 attempts (`max_attempts` default), the row is marked `failed`
  and a record is inserted into `automation_dead_letters` with the error.

What the operator sees:

- `journalctl --user -u <project>-worker -f` shows each batch's
  delivery counts (`delivered`, `retried`, `dead-lettered`).
- A dead letter is the loud signal: it means a workflow has been failing
  for ~30+ minutes (5 attempts × backoff) and the lead has not reached
  Slack/email/CRM.

---

## Replay and dead-letter handling

To replay dead-lettered events:

```sql
-- Inspect what's in the dead-letter table:
select event_id, event_type, error, created_at
  from automation_dead_letters
  order by created_at desc
  limit 50;

-- Move the original row back into the pending queue (idempotency_key prevents
-- double-delivery on the receiver side):
update automation_events
   set status = 'pending',
       attempt_count = 0,
       last_error = null,
       next_attempt_at = now()
 where id = '<event-id>';
```

The next worker tick will re-attempt delivery. Because n8n receives the same
`X-Site-Event-Id` it received before, the dedup step in the workflow keeps
this safe — the lead does not get notified twice.

For bulk replay (e.g., after fixing a long n8n outage), an operator script in
`scripts/automation-replay.ts` is a future addition; for now, the SQL above
is the documented runbook step. The worker is intentionally not "self-healing"
beyond its retry budget, because automatic resurrection of `failed` rows
would mask a stuck workflow.

---

## What the site never sends

- Full contact form bodies in the outbox row payload. The worker joins back
  to `contact_submissions` at delivery time so the outbox carries
  `submission_id` only. PII lives in one place; deletion is one DELETE.
- Stack traces or error strings to the receiver. The receiver only sees
  successful events.
- Authentication state, session cookies, or anything ambient.

The dead-letter table stores `event_id`, `event_type`, and `error` — never
full payloads — so a corrupt event cannot leak PII into operations data.

---

## n8n editor exposure

The n8n editor UI lets anyone with access view stored credentials, change
workflows, and see execution history (which contains payloads — i.e., lead
data). Lock it down:

- Bind n8n behind Caddy basic auth (or your VPN), not the public internet.
- Rotate `N8N_WEBHOOK_SECRET` if you suspect leakage; update both the site's
  env and the n8n Header Auth credential in lockstep.
- Use n8n's own access controls and credential boundaries. If one n8n instance
  serves multiple clients, isolate workflows and credentials deliberately and
  document that boundary outside this template.

The webhook endpoint can be public (it's just an HTTP endpoint with auth);
the editor UI must not be.
