export const ERRORS = {
	'BOOT-BUN-001': 'Bun missing or below 1.1',
	'BOOT-ENV-001': '.env exists but malformed',
	'BOOT-INIT-001': 'init:site failed or left placeholders in init-owned files',
	'BOOT-PG-001': 'no reachable Postgres and no container runtime',
	'BOOT-PG-002': 'bootstrap-owned container exists but unhealthy or labels mismatch',
	'BOOT-PG-003': 'port collision; could not allocate within 50000-55000',
	'BOOT-DB-001': 'DATABASE_URL parse failed',
	'BOOT-DB-002': 'DB auth failed (Postgres SQLSTATE 28P01)',
	'BOOT-DB-003': 'database missing (Postgres SQLSTATE 3D000)',
	'BOOT-DB-004': 'schema privilege error (Postgres SQLSTATE 42501)',
	'BOOT-MIG-001': 'drizzle-kit migrate failed',
	'BOOT-GUARD-001': 'bootstrap attempted to mutate a non-allowlisted file',
	'LAUNCH-PROJECT-001': 'site.project.json invalid or generated files drifted',
	'LAUNCH-ROUTES-001': 'route policy coverage incomplete',
	'LAUNCH-OG-001': 'static/og-default.png is still the template asset',
	'LAUNCH-SEO-001': 'site.defaultTitle still placeholder',
	'LAUNCH-CMS-001': 'static/admin/config.yml backend.repo still placeholder',
	'LAUNCH-ENV-001': 'ORIGIN points to localhost',
	'LAUNCH-ENV-002': 'PUBLIC_SITE_URL points to localhost',
	'LAUNCH-APPHTML-001': 'src/app.html title still template fallback',
	'LAUNCH-BACKUP-001': 'production backup config missing',
	'LAUNCH-EMAIL-001': 'contact form still console-only (POSTMARK_SERVER_TOKEN unset)',
	'LAUNCH-AUTOMATION-001': 'automation provider config incomplete for production',
} as const;

export type ErrorCode = keyof typeof ERRORS;
export type BootErrorCode = Extract<ErrorCode, `BOOT-${string}`>;
export type LaunchErrorCode = Extract<ErrorCode, `LAUNCH-${string}`>;

export class BootstrapScriptError extends Error {
	readonly code: ErrorCode;
	readonly hint: string;

	constructor(code: ErrorCode, message?: string, hint = 'NEXT: Re-run with details enabled.') {
		super(message ?? ERRORS[code]);
		this.name = 'BootstrapScriptError';
		this.code = code;
		this.hint = hint.startsWith('NEXT') ? hint : `NEXT: ${hint}`;
	}
}

export function getErrorMessage(code: ErrorCode): string {
	return ERRORS[code];
}
