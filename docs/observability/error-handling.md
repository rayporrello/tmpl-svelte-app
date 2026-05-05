# Error Handling

---

## Friendly user-facing errors

`src/routes/+error.svelte` renders a clean, accessible error page for all unhandled SvelteKit errors.

**Rules:**

- Never display stack traces, internal error messages, or database errors to the browser.
- Use calm, human language. "Something went wrong. Please try again." is better than "Internal Server Error."
- Include a link back to `/`.
- Mark the page `noindex, nofollow`.
- Use semantic HTML — one `<h1>`, appropriate `aria-label`.

The error page receives `page.status` and `page.error.message` through SvelteKit's `$app/state`. Only `status` is displayed publicly. `error.message` is the `publicMessage` from `toSafeError()` — never a raw stack trace.

---

## Server-side structured logging

`src/lib/server/logger.ts` provides a small structured logger with three levels:

```ts
import { logger } from '$lib/server/logger';

logger.info('Form submitted', { requestId, route: '/contact' });
logger.warn('Webhook delivery failed', { requestId, url: webhookUrl });
logger.error('Database query failed', {
	requestId,
	route: '/api/leads',
	errorType: 'ConnectionError',
	errorMessage: 'timeout',
});
```

All output is JSON. Example:

```json
{
	"timestamp": "2026-04-27T12:00:00.000Z",
	"level": "info",
	"message": "Form submitted",
	"requestId": "550e8400-e29b-41d4-a716-446655440000",
	"route": "/contact"
}
```

**What not to log:**

- Passwords, tokens, secrets, authorization headers, cookies — automatically redacted by the logger
- Raw request bodies
- Full form submission payloads (log only sanitized summaries or outcome)
- Database rows containing PII

The logger redacts these keys case-insensitively: `password`, `token`, `secret`, `authorization`, `cookie`, `apiKey`, `accessToken`, `refreshToken`, `clientSecret`, `privateKey`.

---

## Request IDs

`src/lib/server/request-id.ts` reads `x-request-id` from incoming request headers and falls back to `crypto.randomUUID()`.

`src/hooks.server.ts` attaches the request ID to `event.locals.requestId` on every request. Pass it to the logger and to outbound automation payloads:

```ts
// In a +page.server.ts or API route
export const POST: RequestHandler = async ({ request, locals }) => {
	const { requestId } = locals;
	// ... handle request
	logger.info('Lead created', { requestId, route: '/contact' });
};
```

When an HTTP automation provider is enabled, include `request_id` in the webhook payload so that a Tier 2/3 site can correlate receiver logs with server logs.

---

## Safe error messages

`src/lib/server/safe-error.ts` normalizes thrown errors into two parts:

| Part            | Purpose                                                   |
| --------------- | --------------------------------------------------------- |
| `publicMessage` | Safe, generic string returned to the browser              |
| `diagnostic`    | `errorType` + `errorMessage` for server-side logging only |

```ts
import { toSafeError } from '$lib/server/safe-error';

try {
	await doSomething();
} catch (err) {
	const safe = toSafeError(err);
	logger.error('Operation failed', { requestId, ...safe.diagnostic });
	return fail(500, { message: safe.publicMessage });
}
```

Never pass `safe.diagnostic` to the browser. Never pass raw `error.message` to the browser.

---

## Form error handling conventions

When using Superforms:

1. Use `fail()` from `@sveltejs/kit` to return form errors.
2. Use `safe.publicMessage` for the generic server error message.
3. Log the full error server-side with request ID.
4. Do not log form field values that contain PII (email, name, phone, message).

```ts
// In a +page.server.ts form action
const { requestId } = event.locals;
try {
	await processForm(data);
} catch (err) {
	const safe = toSafeError(err);
	logger.error('Form action failed', { requestId, route: event.url.pathname, ...safe.diagnostic });
	return fail(500, { message: safe.publicMessage });
}
```

---

## /healthz vs /readyz

| Endpoint   | Checks                | Purpose                                   |
| ---------- | --------------------- | ----------------------------------------- |
| `/healthz` | Process is alive      | Container liveness probe; uptime monitors |
| `/readyz`  | Postgres connectivity | Container readiness probe; load balancer  |

**`/healthz`** is included in the base template. It returns immediately with a JSON response indicating that the app process is running.

**`/readyz`** is included because Postgres is part of the template baseline. If a project adds more required runtime dependencies, extend `/readyz` with real checks for those dependencies. Do not add always-true readiness checks — they create false confidence.

---

## Future correlation IDs

If a project ever activates OpenTelemetry, the `requestId` in `event.locals.requestId` can become a root span attribute. The seam is already in place — no changes to `hooks.server.ts` are needed when adding OpenTelemetry instrumentation.
