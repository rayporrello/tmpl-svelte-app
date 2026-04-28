# Analytics Event Taxonomy

Canonical reference for all analytics events in projects built from this template.

**Rule: do not invent one-off event names.** Add new events here, to `src/lib/analytics/events.ts`, and to `src/lib/server/analytics/types.ts` (if server-side) before using them in code.

---

## Naming conventions

- All event names are `snake_case`.
- Use GA4 recommended event names where they exist (see column below).
- No PII in any event name or parameter — no names, emails, phone numbers, or message content.
- Use `event_id` for server-side conversion events to enable future deduplication.
- Custom parameters should also be `snake_case`.

---

## Browser-side events

These are pushed to `window.dataLayer` and picked up by GTM.

| Event name              | Maps to GA4 recommended                                 | When to fire                                           | Key parameters                                                          |
| ----------------------- | ------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `page_view`             | `page_view`                                             | Every SvelteKit navigation (auto — via `pageview.ts`)  | `page_location`, `page_path`, `page_title`, `page_referrer`, `route_id` |
| `generate_lead`         | `generate_lead`                                         | After contact/lead form success (browser confirmation) | `form_name`, `event_id`                                                 |
| `newsletter_subscribed` | — (custom)                                              | After newsletter subscription success                  | `form_name`                                                             |
| `form_submitted`        | — (custom)                                              | After any form submits successfully                    | `form_name`                                                             |
| `form_error`            | — (custom)                                              | When a form fails validation or submission             | `form_name`, `error_type`                                               |
| `cta_click`             | — (custom)                                              | When a primary CTA button is clicked                   | `cta_text`, `cta_location`                                              |
| `outbound_link_click`   | `click` (GA4 auto-tracks links, but explicit is better) | When an outbound link is clicked                       | `link_url`, `link_text`                                                 |
| `file_download`         | `file_download`                                         | When a file download link is clicked                   | `file_name`, `file_extension`                                           |

---

## Server-side events

These are emitted from server actions after validation succeeds. They do not go to the browser dataLayer — they are sent directly to a backend provider (e.g. GA4 Measurement Protocol).

| Event name              | When to fire                                 | Required parameters     |
| ----------------------- | -------------------------------------------- | ----------------------- |
| `generate_lead`         | After contact form success — server action   | `event_id`, `form_name` |
| `newsletter_subscribed` | After newsletter opt-in — server action      | `event_id`              |
| `custom_conversion`     | Any other high-value server-confirmed action | `event_id`, `metadata`  |

**Never include**: `name`, `email`, `phone`, `message`, or any free-text field content in server events.

---

## How to use browser event helpers

Import from `src/lib/analytics/events.ts`:

```ts
import { trackCtaClick, trackOutboundLink, trackGenerateLead } from '$lib/analytics/events';

// In a Svelte component
function handleCta() {
	trackCtaClick({ cta_text: 'Get Started', cta_location: 'hero' });
}

function handleOutboundLink(url: string, text: string) {
	trackOutboundLink({ link_url: url, link_text: text });
}
```

Do not call helpers during SSR — they guard internally by checking `typeof window`.

---

## How to add a new event

1. Add the event name to `AnalyticsEventName` in `src/lib/analytics/events.ts`.
2. Add a typed interface (e.g. `FileDownloadEvent`) in the same file.
3. Add a helper function if the event is used in more than one place.
4. Add the event to this table.
5. If it's a server event, add it to `ServerEventName` in `src/lib/server/analytics/types.ts`.
6. Document the expected parameters and when to fire in this file.
