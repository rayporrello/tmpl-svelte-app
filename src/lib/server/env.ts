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

const positiveIntegerEnv = (name: string) =>
	v.pipe(
		v.string(),
		v.regex(/^\d+$/u, `${name} must be a positive integer.`),
		v.check((value) => Number(value) >= 1, `${name} must be at least 1.`)
	);

const publicSchema = v.object({
	ORIGIN: v.pipe(v.string(), v.minLength(1, 'ORIGIN must not be empty')),
	PUBLIC_SITE_URL: v.pipe(v.string(), v.minLength(1, 'PUBLIC_SITE_URL must not be empty')),
});

const privateSchema = v.object({
	DATABASE_URL: v.pipe(v.string(), v.minLength(1, 'DATABASE_URL must not be empty')),
	DATABASE_DIRECT_URL: v.optional(v.string()),
	POSTGRES_DB: v.optional(v.string()),
	POSTGRES_USER: v.optional(v.string()),
	POSTGRES_PASSWORD: v.optional(v.string()),
	SESSION_SECRET: v.optional(v.string()),
	SHUTDOWN_TIMEOUT_MS: v.optional(v.string()),
	POSTMARK_SERVER_TOKEN: v.optional(v.string()),
	POSTMARK_API_TEST: v.optional(v.string()),
	SMOKE_TEST_SECRET: v.optional(v.string()),
	SMOKE_TEST_RATE_LIMIT_PER_HOUR: v.optional(positiveIntegerEnv('SMOKE_TEST_RATE_LIMIT_PER_HOUR')),
	SMOKE_TEST_BACKLOG_THRESHOLD: v.optional(positiveIntegerEnv('SMOKE_TEST_BACKLOG_THRESHOLD')),
	CONTACT_TO_EMAIL: v.optional(v.string()),
	CONTACT_FROM_EMAIL: v.optional(v.string()),
	AUTOMATION_PROVIDER: v.optional(
		v.union([
			v.literal(''),
			v.literal('n8n'),
			v.literal('webhook'),
			v.literal('console'),
			v.literal('noop'),
		])
	),
	AUTOMATION_WEBHOOK_URL: v.optional(v.string()),
	AUTOMATION_WEBHOOK_SECRET: v.optional(v.string()),
	AUTOMATION_WEBHOOK_AUTH_MODE: v.optional(
		v.union([v.literal(''), v.literal('header'), v.literal('hmac')])
	),
	AUTOMATION_WEBHOOK_AUTH_HEADER: v.optional(v.string()),
	// External n8n endpoint config for AUTOMATION_PROVIDER=n8n (n8n.cloud or a
	// separately hosted n8n instance, not a bundled site container).
	N8N_WEBHOOK_URL: v.optional(v.string()),
	N8N_WEBHOOK_SECRET: v.optional(v.string()),
	N8N_WEBHOOK_AUTH_MODE: v.optional(
		v.union([v.literal(''), v.literal('header'), v.literal('hmac')])
	),
	N8N_WEBHOOK_AUTH_HEADER: v.optional(v.string()),
	// Legacy self-hosted n8n bundle names remain parseable for older clones and
	// rendered env files. The current template does not consume them.
	N8N_ENABLED: v.optional(v.string()),
	N8N_ENCRYPTION_KEY: v.optional(v.string()),
	N8N_HOST: v.optional(v.string()),
	N8N_PROTOCOL: v.optional(v.string()),
	DB_POSTGRESDB_PASSWORD: v.optional(v.string()),
	// PITR / WAL-G backup target (Cloudflare R2 by default).
	R2_ACCESS_KEY_ID: v.optional(v.string()),
	R2_SECRET_ACCESS_KEY: v.optional(v.string()),
	R2_ENDPOINT: v.optional(v.string()),
	R2_BUCKET: v.optional(v.string()),
	R2_PREFIX: v.optional(v.string()),
	PITR_RETENTION_DAYS: v.optional(v.string()),
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

export const REQUIRED_PRIVATE_ENV_VARS: ReadonlyArray<string> = ['DATABASE_URL'];

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
		DATABASE_DIRECT_URL: process.env.DATABASE_DIRECT_URL,
		POSTGRES_DB: process.env.POSTGRES_DB,
		POSTGRES_USER: process.env.POSTGRES_USER,
		POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
		SESSION_SECRET: process.env.SESSION_SECRET,
		SHUTDOWN_TIMEOUT_MS: process.env.SHUTDOWN_TIMEOUT_MS,
		POSTMARK_SERVER_TOKEN: process.env.POSTMARK_SERVER_TOKEN,
		POSTMARK_API_TEST: process.env.POSTMARK_API_TEST,
		SMOKE_TEST_SECRET: process.env.SMOKE_TEST_SECRET,
		SMOKE_TEST_RATE_LIMIT_PER_HOUR: process.env.SMOKE_TEST_RATE_LIMIT_PER_HOUR,
		SMOKE_TEST_BACKLOG_THRESHOLD: process.env.SMOKE_TEST_BACKLOG_THRESHOLD,
		CONTACT_TO_EMAIL: process.env.CONTACT_TO_EMAIL,
		CONTACT_FROM_EMAIL: process.env.CONTACT_FROM_EMAIL,
		AUTOMATION_PROVIDER: process.env.AUTOMATION_PROVIDER,
		AUTOMATION_WEBHOOK_URL: process.env.AUTOMATION_WEBHOOK_URL,
		AUTOMATION_WEBHOOK_SECRET: process.env.AUTOMATION_WEBHOOK_SECRET,
		AUTOMATION_WEBHOOK_AUTH_MODE: process.env.AUTOMATION_WEBHOOK_AUTH_MODE,
		AUTOMATION_WEBHOOK_AUTH_HEADER: process.env.AUTOMATION_WEBHOOK_AUTH_HEADER,
		N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL,
		N8N_WEBHOOK_SECRET: process.env.N8N_WEBHOOK_SECRET,
		N8N_WEBHOOK_AUTH_MODE: process.env.N8N_WEBHOOK_AUTH_MODE,
		N8N_WEBHOOK_AUTH_HEADER: process.env.N8N_WEBHOOK_AUTH_HEADER,
		N8N_ENABLED: process.env.N8N_ENABLED,
		N8N_ENCRYPTION_KEY: process.env.N8N_ENCRYPTION_KEY,
		N8N_HOST: process.env.N8N_HOST,
		N8N_PROTOCOL: process.env.N8N_PROTOCOL,
		DB_POSTGRESDB_PASSWORD: process.env.DB_POSTGRESDB_PASSWORD,
		R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
		R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
		R2_ENDPOINT: process.env.R2_ENDPOINT,
		R2_BUCKET: process.env.R2_BUCKET,
		R2_PREFIX: process.env.R2_PREFIX,
		PITR_RETENTION_DAYS: process.env.PITR_RETENTION_DAYS,
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

	if (privateResult.success) {
		const smokeSecret = privateResult.output.SMOKE_TEST_SECRET?.trim();
		if (smokeSecret) {
			if (!/^[a-f0-9]{32,}$/iu.test(smokeSecret)) {
				errors.push(
					'SMOKE_TEST_SECRET: must be at least 32 hex characters. Generate with `openssl rand -hex 32`.'
				);
			}
			if (!privateResult.output.POSTMARK_API_TEST?.trim()) {
				errors.push('POSTMARK_API_TEST: required when SMOKE_TEST_SECRET is set.');
			}
		}
	}

	if (errors.length > 0) {
		throw new Error(
			`[env] Environment validation failed:\n${errors.map((e) => `  • ${e}`).join('\n')}\n\nSee deploy/env.example for the complete list of required variables.`
		);
	}

	// Container shape guard. Inside a container, DATABASE_URL must reach Postgres
	// via the container hostname (e.g. <project>-postgres), not 127.0.0.1. The
	// loopback variant is DATABASE_DIRECT_URL, which is for host-side tooling
	// (migrations, backups, Drizzle Studio). Mixing the two is the most common
	// production footgun this template can prevent at boot.
	if (process.env.IN_CONTAINER === '1') {
		const containerError = checkContainerDatabaseUrl(process.env.DATABASE_URL ?? '');
		if (containerError) {
			throw new Error(
				`[env] ${containerError}\n\nSee .env.example for the DATABASE_URL / DATABASE_DIRECT_URL contract.`
			);
		}
	}

	// TypeScript cannot narrow publicResult.output through the errors.length guard;
	// the cast is safe because we throw above when !publicResult.success.
	_publicEnv = publicResult.output as PublicEnv;
	_privateEnv = privateResult.output as PrivateEnv;
}

/**
 * Container-runtime check for DATABASE_URL. Returns null when the URL is
 * acceptable inside a container; returns an error string otherwise. Exported
 * for tests; runtime use goes through initEnv().
 */
export function checkContainerDatabaseUrl(databaseUrl: string): string | null {
	let parsed: URL;
	try {
		parsed = new URL(databaseUrl);
	} catch {
		return 'DATABASE_URL is not a valid URL.';
	}
	const host = parsed.hostname.toLowerCase();
	if (host === '127.0.0.1' || host === 'localhost' || host === '::1') {
		return `DATABASE_URL host is "${parsed.hostname}" inside a container. Containers must reach Postgres via the container hostname (e.g. <project>-postgres). Use DATABASE_DIRECT_URL for host-side migrations, backups, and Drizzle Studio.`;
	}
	return null;
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
