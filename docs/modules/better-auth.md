# Better Auth

Better Auth is a TypeScript auth library with native SvelteKit support. It is an **optional module** — not every website needs user authentication.

---

## When to use Better Auth

**Use it when the site needs any of:**

- User accounts and login (email/password, magic link, social OAuth)
- Member-gated content or pages
- An admin portal or protected back-office area
- Customer accounts (orders, subscriptions, preferences)
- Role-based access (admin vs. member vs. visitor)

**Skip it when:**

- The site is entirely public-facing with no user accounts
- CMS access only — Sveltia handles its own auth via GitHub OAuth, no Better Auth needed
- The only "user" is you, the site owner — use a simple environment-gated admin route instead

---

## Architecture fit

Better Auth layers on top of the existing Postgres + Drizzle foundation:

```
Postgres + Drizzle (core — always on)
       ↓
Better Auth (session management, user table, OAuth adapters)
       ↓
src/hooks.server.ts (session validated per request, attached to event.locals)
       ↓
Route/page guards (redirect to /login if session absent)
```

The starter schema adds `contact_submissions`, `automation_events`, `automation_dead_letters`. Better Auth adds its own tables (`user`, `session`, `account`, `verification`) via its migration tooling, using the same Drizzle connection.

---

## Files Better Auth would add

| File                                  | Purpose                                                    |
| ------------------------------------- | ---------------------------------------------------------- |
| `src/lib/server/auth.ts`              | Better Auth instance — providers, adapters, session config |
| `src/routes/auth/[...all]/+server.ts` | Better Auth API route handler (handles all auth endpoints) |
| `src/routes/login/+page.svelte`       | Login UI                                                   |
| `src/routes/signup/+page.svelte`      | Signup UI (if using email/password)                        |
| `src/routes/account/+page.svelte`     | Account management UI (optional)                           |

**Files to update:**

| File                  | Change                                                             |
| --------------------- | ------------------------------------------------------------------ |
| `src/hooks.server.ts` | Call `auth.api.getSession()` per request, attach to `event.locals` |
| `src/app.d.ts`        | Add `session` and `user` to `App.Locals` interface                 |

---

## Installation steps (per-project only)

Do **not** install Better Auth in the base template. Activate per-project when auth is a stated requirement.

### 1. Install

```bash
bun add better-auth
```

### 2. Create `src/lib/server/auth.ts`

```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '$lib/server/db';

export const auth = betterAuth({
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailAndPassword: { enabled: true },
	// Optional — add social providers:
	// socialProviders: { google: { clientId: '...', clientSecret: '...' } },
});
```

### 3. Add the API route

```ts
// src/routes/auth/[...all]/+server.ts
import { auth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) => auth.handler(request);
export const POST: RequestHandler = ({ request }) => auth.handler(request);
```

### 4. Wire session into `hooks.server.ts`

```ts
import { auth } from '$lib/server/auth';
import type { Handle } from '@sveltejs/kit';

const handleAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.session = session;
	return resolve(event);
};
```

Compose with the existing `handle` export using SvelteKit's `sequence()`.

### 5. Update `src/app.d.ts`

```ts
import type { Session } from 'better-auth';

declare global {
	namespace App {
		interface Locals {
			requestId: string;
			session: Session | null;
		}
	}
}
```

### 6. Run the migration

Better Auth generates its schema via its own CLI:

```bash
bunx better-auth migrate   # generates and applies auth tables
```

Or integrate with the Drizzle workflow:

```bash
bun run db:generate   # picks up Better Auth's schema additions
bun run db:migrate    # applies
```

### 7. Add required env vars

| Variable             | Purpose                                     |
| -------------------- | ------------------------------------------- |
| `BETTER_AUTH_SECRET` | 32+ character secret for session signing    |
| `BETTER_AUTH_URL`    | Site origin (e.g. `https://yourdomain.com`) |

Add to `secrets.yaml` (SOPS) and document in `.env.example`.

---

## Client-side usage

Better Auth provides a typed client:

```ts
// src/lib/auth-client.ts
import { createAuthClient } from 'better-auth/svelte';

export const authClient = createAuthClient({ baseURL: '/auth' });
```

Use in Svelte pages:

```ts
// Reactive session state:
const session = authClient.useSession();

// Sign in:
await authClient.signIn.email({ email, password, callbackURL: '/account' });

// Sign out:
await authClient.signOut();
```

---

## Route protection

Protect routes in `+page.server.ts`:

```ts
// src/routes/account/+page.server.ts
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session?.user) {
		redirect(302, '/login');
	}
	return { user: locals.session.user };
};
```

Or in `hooks.server.ts` for broader path protection:

```ts
const PROTECTED_PATHS = ['/account', '/admin'];

const handleAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.session = session;

	if (PROTECTED_PATHS.some((p) => event.url.pathname.startsWith(p)) && !session) {
		redirect(302, '/login');
	}

	return resolve(event);
};
```

---

## What not to do

- **Do not install Better Auth in the base template.** Activate per-project only.
- **Do not build custom session middleware.** Use `auth.api.getSession()`.
- **Do not store `BETTER_AUTH_SECRET` in plaintext.** Use SOPS secrets management.
- **Do not use SQLite.** This template is Postgres-only; use the Drizzle adapter with `provider: 'pg'`.
- **Do not add auth routes to `src/lib/seo/routes.ts` as indexable.** Auth routes should be `indexable: false`.

---

## References

- Better Auth docs: [better-auth.com](https://www.better-auth.com)
- SvelteKit integration: [better-auth.com/docs/integrations/svelte-kit](https://www.better-auth.com/docs/integrations/svelte-kit)
- Drizzle adapter: [better-auth.com/docs/adapters/drizzle](https://www.better-auth.com/docs/adapters/drizzle)
- Core/module boundary: [ADR-002](../planning/adrs/ADR-002-core-plus-dormant-modules.md)
- Module registry: [docs/modules/README.md](README.md)
