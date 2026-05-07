#!/usr/bin/env bun
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { BootstrapScriptError } from './lib/errors';
import { readEnv, type EnvMap } from './lib/env-file';
import { evaluateLaunchBlockers, type LaunchEnvSource } from './lib/launch-blockers';
import { readLedgerFacts, summarize } from './lib/health-engine';
import {
	printOpsResults,
	severityToExitCode,
	worstSeverity,
	type OpsResult,
	type OpsSeverity,
} from './lib/ops-result';
import { checkBun, detectContainerRuntime, gitWorkingTreeDirty } from './lib/preflight';
import { sanitizeProjectSlug } from './lib/postgres-dev';
import type { PrintStream } from './lib/print';
import { isDrillStale, readLastDrill } from './lib/restore-drill-state';
import { redactSecrets, run as runCommand, type RunOptions, type RunResult } from './lib/run';
import { REQUIRED_PRIVATE_ENV_VARS, REQUIRED_PUBLIC_ENV_VARS } from '../src/lib/server/env';

type DoctorStatus = 'pass' | 'warn' | 'fail' | 'skip';
type DoctorSeverity = 'required' | 'recommended';

type DoctorCheck = {
	id: string;
	status: DoctorStatus;
	label: string;
	detail: string;
	severity: DoctorSeverity;
	hint: string | null;
};

type DoctorSection = {
	id: string;
	label: string;
	checks: DoctorCheck[];
};

export type DoctorCliOptions = {
	json: boolean;
	noColor: boolean;
	envSource?: LaunchEnvSource;
};

type CommandRunner = (
	command: string,
	args?: readonly string[],
	options?: RunOptions
) => Promise<RunResult>;

type RuntimeProbe = (context: {
	rootDir: string;
	databaseUrl: string | null;
}) => Promise<DoctorCheck[]>;

export type RunDoctorOptions = {
	rootDir?: string;
	env?: NodeJS.ProcessEnv;
	envSource?: LaunchEnvSource;
	runner?: CommandRunner;
	runtimeProbe?: RuntimeProbe;
};

export type MainOptions = RunDoctorOptions & {
	stdout?: PrintStream;
	stderr?: PrintStream;
};

type DoctorResult = {
	results: OpsResult[];
	exitCode: number;
};

const ROOT_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TEMPLATE_PACKAGE_NAME = 'tmpl-svelte-app';
const REQUIRED_TABLES = [
	'contact_submissions',
	'automation_events',
	'automation_dead_letters',
] as const;
const VALIDATION_FORECAST_COMMANDS = [
	{
		id: 'doctor-project-check',
		label: 'Project manifest validates',
		args: ['run', 'project:check'],
	},
	{ id: 'doctor-routes-check', label: 'Route policy validates', args: ['run', 'routes:check'] },
	{ id: 'doctor-forms-check', label: 'Form registry validates', args: ['run', 'forms:check'] },
	{ id: 'doctor-check-cms', label: 'CMS config validates', args: ['run', 'check:cms'] },
	{ id: 'doctor-check-content', label: 'Content files validate', args: ['run', 'check:content'] },
	{ id: 'doctor-check-assets', label: 'Assets validate', args: ['run', 'check:assets'] },
	{
		id: 'doctor-security-headers',
		label: 'Security header policy validates',
		args: ['run', 'check:security-headers'],
	},
	{
		id: 'doctor-accessibility-source',
		label: 'Accessibility source guardrails pass',
		args: ['run', 'check:accessibility'],
	},
	{
		id: 'doctor-check-design-system',
		label: 'Design-system guardrails pass',
		args: ['run', 'check:design-system'],
	},
	{ id: 'doctor-check-seo', label: 'SEO config validates', args: ['run', 'check:seo'] },
	{ id: 'doctor-secrets-check', label: 'Secrets check passes', args: ['run', 'secrets:check'] },
] as const;

function pass(id: string, label: string, detail: string, severity: DoctorSeverity): DoctorCheck {
	return { id, status: 'pass', label, detail, severity, hint: null };
}

function warn(
	id: string,
	label: string,
	detail: string,
	severity: DoctorSeverity,
	hint: string
): DoctorCheck {
	return { id, status: 'warn', label, detail, severity, hint: normalizeHint(hint) };
}

function fail(
	id: string,
	label: string,
	detail: string,
	severity: DoctorSeverity,
	hint: string
): DoctorCheck {
	return {
		id,
		status: 'fail',
		label,
		detail: redactSecrets(detail),
		severity,
		hint: normalizeHint(hint),
	};
}

function normalizeHint(hint: string): string {
	return hint.startsWith('NEXT:') ? hint : `NEXT: ${hint}`;
}

export function parseArgs(argv: readonly string[]): DoctorCliOptions {
	const options: DoctorCliOptions = { json: false, noColor: false };

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === '--json') {
			options.json = true;
		} else if (arg === '--no-color') {
			options.noColor = true;
		} else if (arg === '--env') {
			const value = argv[index + 1];
			if (value !== 'dev' && value !== 'prod') {
				throw new BootstrapScriptError(
					'BOOT-INIT-001',
					'Unknown doctor env source; expected "dev" or "prod".',
					'NEXT: Use bun run doctor -- --env dev or bun run doctor -- --env prod.'
				);
			}
			options.envSource = value;
			index += 1;
		} else if (arg.startsWith('--env=')) {
			const value = arg.slice('--env='.length);
			if (value !== 'dev' && value !== 'prod') {
				throw new BootstrapScriptError(
					'BOOT-INIT-001',
					'Unknown doctor env source; expected "dev" or "prod".',
					'NEXT: Use bun run doctor -- --env dev or bun run doctor -- --env prod.'
				);
			}
			options.envSource = value;
		} else {
			throw new BootstrapScriptError(
				'BOOT-INIT-001',
				`Unknown doctor option: ${arg}`,
				'NEXT: Use bun run doctor [--json] [--no-color] [--env dev|prod].'
			);
		}
	}

	return options;
}

function doctorEnvSourceFrom(value: string | undefined): LaunchEnvSource | null {
	if (!value) return null;
	if (value === 'dev' || value === 'prod') return value;
	throw new BootstrapScriptError(
		'BOOT-INIT-001',
		`Unknown DOCTOR_ENV value: ${value}`,
		'NEXT: Set DOCTOR_ENV to "dev" or "prod".'
	);
}

function splitRemediation(hint: string | null): string[] | undefined {
	if (!hint) return undefined;
	const steps = hint
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.filter(Boolean);
	return steps.length > 0 ? steps : undefined;
}

function opsSeverityFor(check: DoctorCheck): OpsSeverity {
	if (check.status === 'pass') return 'pass';
	if (check.status === 'skip') return 'info';
	if (check.status === 'warn') return 'warn';
	return check.severity === 'required' ? 'fail' : 'warn';
}

function toOpsResult(section: DoctorSection, check: DoctorCheck): OpsResult {
	return {
		id: check.id,
		severity: opsSeverityFor(check),
		summary: `${section.label}: ${check.label}`,
		detail: check.detail,
		remediation: splitRemediation(check.hint),
	};
}

function readPackageName(rootDir: string): string | null {
	try {
		const parsed = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')) as {
			name?: unknown;
		};
		return typeof parsed.name === 'string' ? parsed.name.trim() : null;
	} catch {
		return null;
	}
}

function readProjectSlug(rootDir: string): string {
	try {
		const parsed = JSON.parse(readFileSync(join(rootDir, 'site.project.json'), 'utf8')) as {
			project?: { projectSlug?: unknown };
		};
		const value = parsed.project?.projectSlug;
		if (typeof value === 'string' && value.trim()) return sanitizeProjectSlug(value);
	} catch {
		// Fall back to package.json below.
	}
	return sanitizeProjectSlug(readPackageName(rootDir) ?? TEMPLATE_PACKAGE_NAME);
}

function parseDatabaseUrl(value: string): URL | null {
	try {
		const parsed = new URL(value);
		const database = decodeURIComponent(parsed.pathname.replace(/^\/+/u, ''));
		if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !database) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

function readEnvFile(rootDir: string): { env: EnvMap | null; check: DoctorCheck } {
	const envPath = join(rootDir, '.env');
	if (!existsSync(envPath)) {
		return {
			env: null,
			check: fail(
				'BOOT-ENV-001',
				'.env exists and parses',
				'.env is missing',
				'required',
				'Run ./bootstrap to generate local environment defaults.'
			),
		};
	}

	try {
		const env = readEnv(envPath);
		return {
			env,
			check: pass(
				'doctor-env-file',
				'.env exists and parses',
				'.env parsed successfully',
				'required'
			),
		};
	} catch (error) {
		return {
			env: null,
			check: fail(
				'BOOT-ENV-001',
				'.env exists and parses',
				error instanceof Error ? error.message : String(error),
				'required',
				'Fix the malformed .env line or re-run ./bootstrap after removing the broken file.'
			),
		};
	}
}

function readTextIfExists(rootDir: string, path: string): string | null {
	const absolutePath = join(rootDir, path);
	if (!existsSync(absolutePath)) return null;
	return readFileSync(absolutePath, 'utf8');
}

function containsInitPlaceholder(content: string): boolean {
	return [
		TEMPLATE_PACKAGE_NAME,
		'Your Site Name',
		'https://example.com',
		'example.com',
		'[Site Title]',
		'[Site Name]',
		'[Year]',
	].some((placeholder) => content.includes(placeholder));
}

function containsDeployPlaceholder(content: string): boolean {
	return (
		containsInitPlaceholder(content) ||
		['<project>', '<owner>', '<name>', '<sha>', '<domain>', 'replace-me'].some((placeholder) =>
			content.includes(placeholder)
		)
	);
}

function databaseUrlFrom(envFile: EnvMap | null, env: NodeJS.ProcessEnv): string | null {
	return envFile?.DATABASE_URL?.trim() || env.DATABASE_URL?.trim() || null;
}

function directDatabaseUrlFrom(envFile: EnvMap | null, env: NodeJS.ProcessEnv): string | null {
	return envFile?.DATABASE_DIRECT_URL?.trim() || env.DATABASE_DIRECT_URL?.trim() || null;
}

async function environmentSection(
	rootDir: string,
	env: NodeJS.ProcessEnv,
	runner: CommandRunner
): Promise<DoctorSection> {
	const checks: DoctorCheck[] = [];
	let bun = checkBun();
	if (!bun.ok && bun.version === null) {
		try {
			const result = await runner('bun', ['--version'], { capture: true, cwd: rootDir, env });
			if (result.code === 0) bun = checkBun(result.stdout.trim());
		} catch {
			// Fall through to the BOOT-BUN-001 result from checkBun().
		}
	}
	if (bun.ok) {
		checks.push(
			pass('BOOT-BUN-001', 'Bun is installed', `Bun ${bun.version} detected`, 'required')
		);
	} else {
		checks.push(
			fail('BOOT-BUN-001', 'Bun is installed', bun.reason, 'required', 'Install Bun 1.1 or newer.')
		);
	}

	const commandExists = async (command: string): Promise<boolean> => {
		try {
			const result = await runner(command, ['--version'], { capture: true, cwd: rootDir, env });
			return result.code === 0;
		} catch {
			return false;
		}
	};

	const runtime = await detectContainerRuntime({ env, commandExists });
	if (runtime) {
		checks.push(
			pass(
				'doctor-container-runtime',
				'Container runtime is available',
				`${runtime} detected`,
				'recommended'
			)
		);
	} else {
		checks.push(
			warn(
				'BOOT-PG-001',
				'Container runtime is available',
				'No Podman runtime detected',
				'recommended',
				'Install Podman; it is the expected local and production container runtime.'
			)
		);
	}

	const dirty = await gitWorkingTreeDirty({
		cwd: rootDir,
		runner: async (command, args, options) => {
			try {
				return await runner(command, args, options);
			} catch (error) {
				return {
					code: 1,
					stdout: '',
					stderr: error instanceof Error ? error.message : String(error),
					durationMs: 0,
				};
			}
		},
	});
	if (dirty) {
		checks.push(
			warn(
				'doctor-git-clean',
				'Working tree is clean',
				'Git reports uncommitted changes or status could not be read',
				'recommended',
				'Review git status before committing or deploying.'
			)
		);
	} else {
		checks.push(
			pass('doctor-git-clean', 'Working tree is clean', 'No uncommitted changes', 'recommended')
		);
	}

	return { id: 'environment', label: 'Environment', checks };
}

function configurationSection(
	rootDir: string,
	env: NodeJS.ProcessEnv
): { section: DoctorSection; envFile: EnvMap | null; databaseUrl: string | null } {
	const checks: DoctorCheck[] = [];
	const { env: envFile, check: envCheck } = readEnvFile(rootDir);
	checks.push(envCheck);

	const databaseUrl = databaseUrlFrom(envFile, env);
	const directDatabaseUrl = directDatabaseUrlFrom(envFile, env);
	if (!databaseUrl) {
		checks.push(
			fail(
				'BOOT-DB-001',
				'DATABASE_URL parses',
				'DATABASE_URL is missing from .env and process env',
				'required',
				'Set DATABASE_URL in .env or re-run ./bootstrap.'
			)
		);
	} else if (parseDatabaseUrl(databaseUrl)) {
		checks.push(
			pass('BOOT-DB-001', 'DATABASE_URL parses', 'DATABASE_URL uses a Postgres URL', 'required')
		);
	} else {
		checks.push(
			fail(
				'BOOT-DB-001',
				'DATABASE_URL parses',
				'DATABASE_URL must use postgres://user:pw@host:port/db',
				'required',
				'Fix DATABASE_URL in .env.'
			)
		);
	}

	if (!directDatabaseUrl) {
		checks.push(
			warn(
				'doctor-direct-db-url',
				'DATABASE_DIRECT_URL is set',
				'DATABASE_DIRECT_URL is missing from .env and process env',
				'recommended',
				'Set DATABASE_DIRECT_URL for host-side migrations, backups, restores, and Drizzle Studio.'
			)
		);
	} else if (parseDatabaseUrl(directDatabaseUrl)) {
		checks.push(
			pass(
				'doctor-direct-db-url',
				'DATABASE_DIRECT_URL is set',
				'DATABASE_DIRECT_URL uses a Postgres URL',
				'recommended'
			)
		);
	} else {
		checks.push(
			warn(
				'doctor-direct-db-url',
				'DATABASE_DIRECT_URL is set',
				'DATABASE_DIRECT_URL must use postgres://user:pw@host:port/db',
				'recommended',
				'Fix DATABASE_DIRECT_URL in .env.'
			)
		);
	}

	const packageName = readPackageName(rootDir);
	if (!packageName) {
		checks.push(
			fail(
				'BOOT-INIT-001',
				'package.json.name is customized',
				'package.json could not be read',
				'required',
				'Restore package.json and re-run bun run init:site.'
			)
		);
	} else if (packageName === TEMPLATE_PACKAGE_NAME) {
		checks.push(
			fail(
				'BOOT-INIT-001',
				'package.json.name is customized',
				`package.json.name is still ${TEMPLATE_PACKAGE_NAME}`,
				'required',
				'Run bun run init:site or ./bootstrap with project-specific answers.'
			)
		);
	} else {
		checks.push(
			pass(
				'doctor-package-name',
				'package.json.name is customized',
				`package name is ${packageName}`,
				'required'
			)
		);
	}

	const siteConfig = readTextIfExists(rootDir, 'src/lib/config/site.ts');
	if (!siteConfig) {
		checks.push(
			fail(
				'BOOT-INIT-001',
				'site config placeholders are gone',
				'src/lib/config/site.ts is missing',
				'required',
				'Restore src/lib/config/site.ts and re-run bun run init:site.'
			)
		);
	} else if (containsInitPlaceholder(siteConfig)) {
		checks.push(
			fail(
				'BOOT-INIT-001',
				'site config placeholders are gone',
				'src/lib/config/site.ts still contains template placeholders',
				'required',
				'Run bun run init:site with project-specific values.'
			)
		);
	} else {
		checks.push(
			pass(
				'doctor-site-placeholders',
				'site config placeholders are gone',
				'No site.ts placeholders detected',
				'required'
			)
		);
	}

	const cmsConfig = readTextIfExists(rootDir, 'static/admin/config.yml');
	if (!cmsConfig) {
		checks.push(
			fail(
				'BOOT-INIT-001',
				'CMS config is present',
				'static/admin/config.yml is missing',
				'required',
				'Restore static/admin/config.yml before using Sveltia CMS.'
			)
		);
	} else {
		checks.push(
			pass(
				'doctor-cms-config-present',
				'CMS config is present',
				'static/admin/config.yml exists',
				'recommended'
			)
		);
	}

	return {
		section: { id: 'configuration', label: 'Configuration', checks },
		envFile,
		databaseUrl,
	};
}

function runtimeContractSection(
	rootDir: string,
	envFile: EnvMap | null,
	env: NodeJS.ProcessEnv
): DoctorSection {
	const checks: DoctorCheck[] = [];
	const slug = readProjectSlug(rootDir);
	const safeSlug = slug.replace(/-/g, '_');
	const expected = {
		network: `${slug}.network`,
		web: `${slug}-web`,
		postgres: `${slug}-postgres`,
		worker: `${slug}-worker`,
		postgresVolume: `${slug}-postgres-data`,
		appDatabase: `${safeSlug}_app`,
		appRole: `${safeSlug}_app_user`,
		backupPrefix: `${slug}/postgres`,
		secretsPath: `~/secrets/${slug}.prod.env`,
	};
	checks.push(
		pass(
			'doctor-project-slug',
			'Project runtime names are deterministic',
			`slug=${slug}; web=${expected.web}; postgres=${expected.postgres}; worker=${expected.worker}; network=${expected.network}; app db/role=${expected.appDatabase}/${expected.appRole}; secrets=${expected.secretsPath}`,
			'required'
		)
	);

	const databaseUrl = databaseUrlFrom(envFile, env);
	const parsedRuntime = databaseUrl ? parseDatabaseUrl(databaseUrl) : null;
	if (parsedRuntime?.hostname === expected.postgres) {
		checks.push(
			pass(
				'doctor-runtime-db-url',
				'DATABASE_URL uses project-network Postgres',
				`DATABASE_URL host is ${expected.postgres}`,
				'recommended'
			)
		);
	} else {
		checks.push(
			warn(
				'doctor-runtime-db-url',
				'DATABASE_URL uses project-network Postgres',
				parsedRuntime
					? `DATABASE_URL host is ${parsedRuntime.hostname}; expected ${expected.postgres}`
					: 'DATABASE_URL is missing or unparseable',
				'recommended',
				`Use ${expected.postgres} inside web and worker containers; use DATABASE_DIRECT_URL for host access.`
			)
		);
	}

	const directUrl = directDatabaseUrlFrom(envFile, env);
	const parsedDirect = directUrl ? parseDatabaseUrl(directUrl) : null;
	if (parsedDirect && ['127.0.0.1', 'localhost'].includes(parsedDirect.hostname)) {
		checks.push(
			pass(
				'doctor-direct-db-host',
				'DATABASE_DIRECT_URL uses host access',
				`DATABASE_DIRECT_URL host is ${parsedDirect.hostname}`,
				'recommended'
			)
		);
	} else {
		checks.push(
			warn(
				'doctor-direct-db-host',
				'DATABASE_DIRECT_URL uses host access',
				parsedDirect
					? `DATABASE_DIRECT_URL host is ${parsedDirect.hostname}`
					: 'DATABASE_DIRECT_URL is missing or unparseable',
				'recommended',
				'Point DATABASE_DIRECT_URL at the loopback-published Postgres port for migrations/backups/restores.'
			)
		);
	}

	const backupEnv = [
		'R2_ACCESS_KEY_ID',
		'R2_SECRET_ACCESS_KEY',
		'R2_ENDPOINT',
		'R2_BUCKET',
		'R2_PREFIX',
	];
	const missingBackup = backupEnv.filter((key) => !(envFile?.[key]?.trim() || env[key]?.trim()));
	if (missingBackup.length) {
		checks.push(
			warn(
				'doctor-backup-env',
				'PITR backup env is present',
				`Missing: ${missingBackup.join(', ')}; expected R2_PREFIX like ${expected.backupPrefix}`,
				'recommended',
				'Configure WAL-G/R2 values before production deploy.'
			)
		);
	} else {
		checks.push(
			pass(
				'doctor-backup-env',
				'PITR backup env is present',
				'R2/WAL-G env names are set',
				'recommended'
			)
		);
	}

	return { id: 'runtime-contract', label: 'Runtime Contract', checks };
}

function parseFailure(output: string, fallback: string): Pick<DoctorCheck, 'id' | 'hint'> {
	const code = output.match(/FAIL\s+(BOOT-[A-Z0-9-]+)/u)?.[1] ?? fallback;
	const hint =
		output.match(/^NEXT:\s*.+$/mu)?.[0] ??
		'NEXT: Re-run the command above and fix the reported issue.';
	return { id: code, hint };
}

async function runCheckDb(
	rootDir: string,
	databaseUrl: string | null,
	env: NodeJS.ProcessEnv,
	runner: CommandRunner
): Promise<DoctorCheck> {
	if (!databaseUrl) {
		return fail(
			'BOOT-DB-001',
			'Database connectivity verified',
			'DATABASE_URL is missing',
			'required',
			'Set DATABASE_URL in .env or re-run ./bootstrap.'
		);
	}

	const result = await runner('bun', ['run', 'check:db'], {
		cwd: rootDir,
		env: { ...process.env, ...env, DATABASE_URL: databaseUrl },
		capture: true,
	});
	const output = `${result.stdout}${result.stderr}`;
	if (result.code === 0) {
		return pass(
			'doctor-db-reachable',
			'Database connectivity verified',
			'bun run check:db exited 0',
			'required'
		);
	}

	const failure = parseFailure(output, 'BOOT-DB-001');
	return fail(
		failure.id,
		'Database connectivity verified',
		output.trim() || `bun run check:db exited ${result.code}`,
		'required',
		failure.hint ?? 'NEXT: Fix DATABASE_URL or re-run ./bootstrap.'
	);
}

function migrationSqlCount(rootDir: string): number {
	const drizzleDir = join(rootDir, 'drizzle');
	if (!existsSync(drizzleDir)) return 0;
	return readdirSync(drizzleDir).filter((entry) => entry.endsWith('.sql')).length;
}

async function defaultRuntimeProbe({
	rootDir,
	databaseUrl,
}: {
	rootDir: string;
	databaseUrl: string | null;
}): Promise<DoctorCheck[]> {
	if (!databaseUrl) {
		return [
			fail(
				'BOOT-DB-001',
				'Migrations are applied',
				'DATABASE_URL is missing',
				'required',
				'Set DATABASE_URL in .env or re-run ./bootstrap.'
			),
			fail(
				'BOOT-DB-001',
				'Starter tables exist',
				'DATABASE_URL is missing',
				'required',
				'Set DATABASE_URL in .env or re-run ./bootstrap.'
			),
		];
	}

	let client: ReturnType<typeof postgres> | undefined;
	try {
		client = postgres(databaseUrl, { max: 1, idle_timeout: 1, connect_timeout: 2 });
		const expectedMigrations = migrationSqlCount(rootDir);
		const migrationRows = (await client`
			SELECT COUNT(*)::int AS count
			FROM drizzle.__drizzle_migrations
		`) as Array<{ count: number }>;
		const appliedMigrations = Number(migrationRows[0]?.count ?? 0);
		const migrationCheck =
			appliedMigrations >= expectedMigrations
				? pass(
						'doctor-migrations-applied',
						'Migrations are applied',
						`${appliedMigrations}/${expectedMigrations} migrations recorded`,
						'required'
					)
				: fail(
						'BOOT-MIG-001',
						'Migrations are applied',
						`${appliedMigrations}/${expectedMigrations} migrations recorded`,
						'required',
						'Run bun run db:migrate with the same DATABASE_URL.'
					);

		const tableRows = (await client`
			SELECT table_name
			FROM information_schema.tables
			WHERE table_schema = 'public'
				AND table_name IN ('contact_submissions', 'automation_events', 'automation_dead_letters')
		`) as Array<{ table_name: string }>;
		const foundTables = new Set(tableRows.map((row) => row.table_name));
		const missingTables = REQUIRED_TABLES.filter((table) => !foundTables.has(table));
		const tableCheck =
			missingTables.length === 0
				? pass(
						'doctor-starter-tables',
						'Starter tables exist',
						`${REQUIRED_TABLES.length} starter tables found`,
						'required'
					)
				: fail(
						'BOOT-MIG-001',
						'Starter tables exist',
						`Missing tables: ${missingTables.join(', ')}`,
						'required',
						'Run bun run db:migrate with the same DATABASE_URL.'
					);

		return [migrationCheck, tableCheck];
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return [
			fail(
				'BOOT-MIG-001',
				'Migrations are applied',
				detail,
				'required',
				'Run bun run db:migrate with the same DATABASE_URL.'
			),
			fail(
				'BOOT-MIG-001',
				'Starter tables exist',
				detail,
				'required',
				'Run bun run db:migrate with the same DATABASE_URL.'
			),
		];
	} finally {
		await client?.end({ timeout: 1 }).catch(() => undefined);
	}
}

async function runtimeSection(
	rootDir: string,
	env: NodeJS.ProcessEnv,
	databaseUrl: string | null,
	runner: CommandRunner,
	runtimeProbe: RuntimeProbe
): Promise<DoctorSection> {
	const dbCheck = await runCheckDb(rootDir, databaseUrl, env, runner);
	const checks = [dbCheck];
	if (dbCheck.status === 'pass') {
		checks.push(...(await runtimeProbe({ rootDir, databaseUrl })));
	} else {
		checks.push(
			warn(
				'doctor-runtime-skipped',
				'Runtime schema checks ran',
				'Skipped because database connectivity failed',
				'recommended',
				'Fix DATABASE_URL, then re-run bun run doctor.'
			)
		);
	}

	return { id: 'runtime', label: 'Runtime', checks };
}

async function validationForecastSection(
	rootDir: string,
	env: NodeJS.ProcessEnv,
	runner: CommandRunner
): Promise<DoctorSection> {
	const checks: DoctorCheck[] = [];

	for (const command of VALIDATION_FORECAST_COMMANDS) {
		const result = await runner('bun', command.args, {
			cwd: rootDir,
			env: { ...process.env, ...env },
			capture: true,
		});
		if (result.code === 0) {
			checks.push(
				pass(command.id, command.label, `${command.args.join(' ')} exited 0`, 'required')
			);
		} else {
			const output = `${result.stdout}${result.stderr}`.trim();
			checks.push(
				fail(
					command.id,
					command.label,
					output || `${command.args.join(' ')} exited ${result.code}`,
					'required',
					`Run bun ${command.args.join(' ')} and fix the reported issue.`
				)
			);
		}
	}

	return { id: 'validation', label: 'Validation Forecast', checks };
}

async function launchBlockersSection(
	rootDir: string,
	env: NodeJS.ProcessEnv,
	envSource: LaunchEnvSource
): Promise<DoctorSection> {
	const checks = (await evaluateLaunchBlockers({ rootDir, env, envSource })).map(
		(blocker): DoctorCheck => ({
			id: blocker.id,
			status: blocker.status === 'pass' ? 'pass' : 'warn',
			label: blocker.label,
			detail: blocker.detail ?? 'No blocker detected',
			severity: blocker.severity,
			hint: blocker.status === 'pass' ? null : normalizeHint(blocker.fixHint),
		})
	);

	return { id: 'launch-blockers', label: 'Launch Blockers', checks };
}

function restoreDrillSection(): DoctorSection {
	const lastDrill = readLastDrill();
	if (!lastDrill) {
		return {
			id: 'restore-drill',
			label: 'Restore Drill',
			checks: [
				warn(
					'DOCTOR-DRILL-001',
					'Restore-drill ledger channel exists',
					'restore-drill.json is missing; drill has never run',
					'recommended',
					'Drill has never run; first run is scheduled by the timer or operator can run `bun run backup:restore:drill` manually.'
				),
			],
		};
	}

	const checks: DoctorCheck[] = [
		pass(
			'DOCTOR-DRILL-001',
			'Restore-drill ledger channel exists',
			`last_attempt_at=${lastDrill.attemptedAt}; last_success_at=${lastDrill.succeededAt ?? 'never'}`,
			'recommended'
		),
	];

	if (isDrillStale()) {
		checks.push(
			warn(
				'DOCTOR-DRILL-002',
				'Last restore drill is fresh',
				`last_attempt_at=${lastDrill.attemptedAt}; last_success_at=${lastDrill.succeededAt ?? 'never'}`,
				'recommended',
				'Run `bun run backup:restore:drill` and inspect docs/operations/restore-drill.md if it fails.'
			)
		);
	} else {
		checks.push(
			pass(
				'DOCTOR-DRILL-002',
				'Last restore drill is fresh',
				`last_attempt_at=${lastDrill.attemptedAt}; last_success_at=${lastDrill.succeededAt}`,
				'recommended'
			)
		);
	}

	return { id: 'restore-drill', label: 'Restore Drill', checks };
}

function deploymentArtifactsSection(rootDir: string): DoctorSection {
	const checks: DoctorCheck[] = [];
	const deployDir = join(rootDir, 'deploy');
	if (!existsSync(deployDir)) {
		return {
			id: 'deployment',
			label: 'Deployment Artifacts',
			checks: [
				pass(
					'doctor-deploy-not-present',
					'Deployment artifacts are present',
					'deploy/ is not present in this fixture or project copy',
					'recommended'
				),
			],
		};
	}

	const requiredFiles = [
		'Containerfile',
		'deploy/Containerfile.postgres',
		'deploy/env.example',
		'deploy/Caddyfile.example',
		'deploy/quadlets/web.container',
		'deploy/quadlets/web.network',
		'deploy/quadlets/postgres.container',
		'deploy/quadlets/postgres.volume',
		'deploy/quadlets/worker.container',
		'deploy/systemd/backup-base.service',
		'deploy/systemd/backup-base.timer',
		'deploy/systemd/backup-check.service',
		'deploy/systemd/backup-check.timer',
		'deploy/systemd/restore-drill.service',
		'deploy/systemd/restore-drill.timer',
	];
	const missing = requiredFiles.filter((path) => !existsSync(join(rootDir, path)));
	if (missing.length) {
		checks.push(
			warn(
				'doctor-deploy-files',
				'Deployment artifacts are present',
				`Missing: ${missing.join(', ')}`,
				'recommended',
				'Restore deployment templates before using the self-hosted deploy path.'
			)
		);
	} else {
		checks.push(
			pass(
				'doctor-deploy-files',
				'Deployment artifacts are present',
				'All baseline deploy templates exist',
				'recommended'
			)
		);
	}

	const placeholderFiles = requiredFiles
		.filter((path) => existsSync(join(rootDir, path)))
		.filter((path) => containsDeployPlaceholder(readFileSync(join(rootDir, path), 'utf8')));
	if (placeholderFiles.length) {
		checks.push(
			warn(
				'doctor-deploy-placeholders',
				'Deployment placeholders are replaced',
				`Placeholders remain in: ${placeholderFiles.join(', ')}`,
				'recommended',
				'Run bun run init:site before installing deploy artifacts on a host.'
			)
		);
	} else {
		checks.push(
			pass(
				'doctor-deploy-placeholders',
				'Deployment placeholders are replaced',
				'No deploy placeholders detected',
				'recommended'
			)
		);
	}

	const requiredEnv = [...REQUIRED_PUBLIC_ENV_VARS, ...REQUIRED_PRIVATE_ENV_VARS];
	const envProblems: string[] = [];
	for (const path of ['.env.example', 'deploy/env.example']) {
		const content = readTextIfExists(rootDir, path);
		if (!content) {
			envProblems.push(`${path} missing`);
			continue;
		}
		for (const key of requiredEnv) {
			if (!new RegExp(`^${key}=`, 'mu').test(content)) envProblems.push(`${path} missing ${key}`);
		}
	}
	if (envProblems.length) {
		checks.push(
			warn(
				'doctor-env-examples',
				'Required env names are documented',
				envProblems.join(', '),
				'recommended',
				'Keep .env.example and deploy/env.example aligned with src/lib/server/env.ts.'
			)
		);
	} else {
		checks.push(
			pass(
				'doctor-env-examples',
				'Required env names are documented',
				`${requiredEnv.join(', ')} documented in both example env files`,
				'recommended'
			)
		);
	}

	const webContainer = readTextIfExists(rootDir, 'deploy/quadlets/web.container') ?? '';
	const caddyfile = readTextIfExists(rootDir, 'deploy/Caddyfile.example') ?? '';
	const publishPort = webContainer.match(/PublishPort=127\.0\.0\.1:(\d+):3000/u)?.[1];
	const caddyPort = caddyfile.match(/reverse_proxy\s+127\.0\.0\.1:(\d+)/u)?.[1];
	if (publishPort && caddyPort && publishPort === caddyPort) {
		checks.push(
			pass(
				'doctor-deploy-port',
				'Caddy and web Quadlet ports align',
				`Both use loopback port ${publishPort}`,
				'recommended'
			)
		);
	} else {
		checks.push(
			warn(
				'doctor-deploy-port',
				'Caddy and web Quadlet ports align',
				`PublishPort=${publishPort ?? 'missing'}, reverse_proxy=${caddyPort ?? 'missing'}`,
				'recommended',
				'Keep deploy/quadlets/web.container and deploy/Caddyfile.example on the same loopback port.'
			)
		);
	}

	return { id: 'deployment', label: 'Deployment Artifacts', checks };
}

function nextCommandsSection(): DoctorSection {
	return {
		id: 'next-commands',
		label: 'Known Next Commands',
		checks: [
			pass('doctor-next-core', 'Daily local gate', 'bun run validate:core', 'recommended'),
			pass(
				'doctor-next-launch',
				'Before shipping a copied site',
				'bun run validate:launch && bun run deploy:preflight',
				'recommended'
			),
			pass(
				'doctor-next-smoke',
				'After deployment',
				'bun run deploy:smoke -- --url https://your-domain.example',
				'recommended'
			),
		],
	};
}

export async function runDoctor(options: RunDoctorOptions = {}): Promise<DoctorResult> {
	const rootDir = options.rootDir ?? ROOT_DIR;
	const env = options.env ?? process.env;
	const envSource = options.envSource ?? doctorEnvSourceFrom(env.DOCTOR_ENV) ?? 'dev';
	const runner = options.runner ?? runCommand;
	const runtimeProbe = options.runtimeProbe ?? defaultRuntimeProbe;

	const environment = await environmentSection(rootDir, env, runner);
	const configuration = configurationSection(rootDir, env);
	const runtimeContract = runtimeContractSection(rootDir, configuration.envFile, env);
	const runtime = await runtimeSection(
		rootDir,
		env,
		configuration.databaseUrl,
		runner,
		runtimeProbe
	);
	const validation = await validationForecastSection(rootDir, env, runner);
	const launchBlockers = await launchBlockersSection(rootDir, env, envSource);
	const restoreDrill = restoreDrillSection();
	const deployment = deploymentArtifactsSection(rootDir);
	const nextCommands = nextCommandsSection();
	const liveHealthLedger = readLedgerFacts({ eventsLimit: 10 });
	const liveHealthResults = [
		...summarize(
			{
				currentRelease: liveHealthLedger.facts.currentRelease,
				previousRelease: liveHealthLedger.facts.previousRelease,
				backup: liveHealthLedger.facts.backup,
				drill: liveHealthLedger.facts.drill,
				recentEvents: liveHealthLedger.facts.recentEvents,
			},
			liveHealthLedger.results
		),
		...liveHealthLedger.results,
	].map((result) => ({ ...result, summary: `Live Health: ${result.summary}` }));

	const sections = [
		environment,
		configuration.section,
		runtimeContract,
		runtime,
		validation,
		launchBlockers,
		restoreDrill,
		deployment,
		nextCommands,
	];
	const results = sections.flatMap((section) =>
		section.checks.map((check) => toOpsResult(section, check))
	);
	results.push(...liveHealthResults);
	const worst = worstSeverity(results);

	return {
		results,
		exitCode: severityToExitCode(worst),
	};
}

export async function main(
	argv: readonly string[] = process.argv.slice(2),
	options: MainOptions = {}
): Promise<number> {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;

	try {
		const cli = parseArgs(argv);
		const result = await runDoctor({ ...options, envSource: cli.envSource ?? options.envSource });
		if (cli.json) {
			stdout.write(`${JSON.stringify(result.results, null, '\t')}\n`);
		} else {
			const stream = ['fail', 'warn'].includes(worstSeverity(result.results)) ? stderr : stdout;
			printOpsResults(result.results, { stream, noColor: cli.noColor });
		}
		return result.exitCode;
	} catch (error) {
		if (error instanceof BootstrapScriptError) {
			stderr.write(`FAIL ${error.code} ${error.message}\n${error.hint}\n`);
			return 1;
		}

		const message = error instanceof Error ? error.message : String(error);
		stderr.write(`FAIL BOOT-INIT-001 Doctor failed unexpectedly: ${redactSecrets(message)}\n`);
		stderr.write('NEXT: Inspect the error above and re-run bun run doctor.\n');
		return 1;
	}
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
	process.exit(await main());
}
