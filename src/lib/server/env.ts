/**
 * Server-side environment validation using Valibot.
 *
 * Import paths:
 *   $lib/env/public  — validated public vars (ORIGIN, PUBLIC_SITE_URL, …)
 *   $lib/env/private — validated private vars (DATABASE_URL, secrets, …)
 *
 * check:launch imports only REQUIRED_PUBLIC_ENV_VARS / REQUIRED_PRIVATE_ENV_VARS
 * without triggering validation. Validation runs when initEnv() is called in
 * hooks.server.ts, which throws at startup if required vars are missing.
 */
import * as v from 'valibot';

// ── Schemas ───────────────────────────────────────────────────────────────────

const publicSchema = v.object({
	ORIGIN: v.pipe(v.string(), v.minLength(1, 'ORIGIN must not be empty')),
	PUBLIC_SITE_URL: v.pipe(v.string(), v.minLength(1, 'PUBLIC_SITE_URL must not be empty')),
});

const privateSchema = v.object({
	DATABASE_URL: v.optional(v.string()),
	SESSION_SECRET: v.optional(v.string()),
	POSTMARK_SERVER_TOKEN: v.optional(v.string()),
	CONTACT_TO_EMAIL: v.optional(v.string()),
	CONTACT_FROM_EMAIL: v.optional(v.string()),
	N8N_WEBHOOK_URL: v.optional(v.string()),
	N8N_WEBHOOK_SECRET: v.optional(v.string()),
	// Forms — set to "true" to enable in-process rate limiting on form endpoints.
	// This is a single-node guard; buckets reset on restart. See rate-limit.ts.
	RATE_LIMIT_ENABLED: v.optional(v.string()),
	// Analytics — server-side conversion events (dormant by default).
	// Set to "true" only after configuring a real ServerAnalyticsProvider.
	// See docs/analytics/server-conversions.md.
	ANALYTICS_SERVER_EVENTS_ENABLED: v.optional(v.string()),
	GA4_MEASUREMENT_ID: v.optional(v.string()),
	GA4_MEASUREMENT_PROTOCOL_API_SECRET: v.optional(v.string()),
});

export type PublicEnv = v.InferOutput<typeof publicSchema>;
export type PrivateEnv = v.InferOutput<typeof privateSchema>;

// ── Required variable names ────────────────────────────────────────────────────
// Imported by scripts/check-launch.ts without triggering Valibot validation.

export const REQUIRED_PUBLIC_ENV_VARS: ReadonlyArray<string> = ['ORIGIN', 'PUBLIC_SITE_URL'];

/** No private vars are required by the base template; extend per project. */
export const REQUIRED_PRIVATE_ENV_VARS: ReadonlyArray<string> = [];

// ── Validation ────────────────────────────────────────────────────────────────

let _publicEnv: PublicEnv | undefined;
let _privateEnv: PrivateEnv | undefined;

/**
 * Validate all environment variables. Throws with a clear message if any
 * required variable is missing or malformed.
 *
 * Call once at server startup from hooks.server.ts. Subsequent calls are no-ops.
 */
export function initEnv(): void {
	if (_publicEnv && _privateEnv) return;

	const publicResult = v.safeParse(publicSchema, {
		ORIGIN: process.env.ORIGIN,
		PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL,
	});

	const privateResult = v.safeParse(privateSchema, {
		DATABASE_URL: process.env.DATABASE_URL,
		SESSION_SECRET: process.env.SESSION_SECRET,
		POSTMARK_SERVER_TOKEN: process.env.POSTMARK_SERVER_TOKEN,
		CONTACT_TO_EMAIL: process.env.CONTACT_TO_EMAIL,
		CONTACT_FROM_EMAIL: process.env.CONTACT_FROM_EMAIL,
		N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL,
		N8N_WEBHOOK_SECRET: process.env.N8N_WEBHOOK_SECRET,
		RATE_LIMIT_ENABLED: process.env.RATE_LIMIT_ENABLED,
		ANALYTICS_SERVER_EVENTS_ENABLED: process.env.ANALYTICS_SERVER_EVENTS_ENABLED,
		GA4_MEASUREMENT_ID: process.env.GA4_MEASUREMENT_ID,
		GA4_MEASUREMENT_PROTOCOL_API_SECRET: process.env.GA4_MEASUREMENT_PROTOCOL_API_SECRET,
	});

	const errors: string[] = [];

	if (!publicResult.success) {
		for (const issue of publicResult.issues) {
			const key = issue.path?.map((p) => String((p as { key: string }).key)).join('.') ?? 'unknown';
			errors.push(`${key}: ${issue.message}`);
		}
	}

	if (!privateResult.success) {
		for (const issue of privateResult.issues) {
			const key = issue.path?.map((p) => String((p as { key: string }).key)).join('.') ?? 'unknown';
			errors.push(`${key}: ${issue.message}`);
		}
	}

	if (errors.length > 0) {
		throw new Error(
			`[env] Environment validation failed:\n${errors.map((e) => `  • ${e}`).join('\n')}\n\nSee deploy/env.example for the complete list of required variables.`
		);
	}

	// TypeScript cannot narrow publicResult.output through the errors.length guard;
	// the cast is safe because we throw above when !publicResult.success.
	_publicEnv = publicResult.output as PublicEnv;
	_privateEnv = privateResult.output as PrivateEnv;
}

// ── Lazy accessors ────────────────────────────────────────────────────────────
// Validation is deferred until first property access. initEnv() in hooks.server.ts
// forces eager validation at startup so errors surface immediately.

export const publicEnv: PublicEnv = new Proxy({} as PublicEnv, {
	get(_, prop: string) {
		if (!_publicEnv) initEnv();
		return _publicEnv![prop as keyof PublicEnv];
	},
});

export const privateEnv: PrivateEnv = new Proxy({} as PrivateEnv, {
	get(_, prop: string) {
		if (!_privateEnv) initEnv();
		return _privateEnv![prop as keyof PrivateEnv];
	},
});
