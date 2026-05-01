#!/usr/bin/env bun
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { BootstrapScriptError } from './lib/errors';
import { readEnv, type EnvMap } from './lib/env-file';
import { LAUNCH_BLOCKERS, type LaunchBlocker } from './lib/launch-blockers';
import { checkBun, detectContainerRuntime, gitWorkingTreeDirty } from './lib/preflight';
import type { PrintStream } from './lib/print';
import { redactSecrets, run as runCommand, type RunOptions, type RunResult } from './lib/run';

type DoctorStatus = 'pass' | 'warn' | 'fail';
type DoctorSeverity = 'required' | 'recommended';

export type DoctorCheck = {
	id: string;
	status: DoctorStatus;
	label: string;
	detail: string;
	severity: DoctorSeverity;
	hint: string | null;
};

export type DoctorSection = {
	id: string;
	label: string;
	checks: DoctorCheck[];
};

export type DoctorReport = {
	schemaVersion: 1;
	status: DoctorStatus;
	generatedAt: string;
	sections: DoctorSection[];
};

export type DoctorCliOptions = {
	json: boolean;
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
	runner?: CommandRunner;
	runtimeProbe?: RuntimeProbe;
	now?: () => Date;
};

export type MainOptions = RunDoctorOptions & {
	stdout?: PrintStream;
	stderr?: PrintStream;
};

type DoctorResult = {
	report: DoctorReport;
	exitCode: number;
};

const ROOT_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TEMPLATE_PACKAGE_NAME = 'tmpl-svelte-app';
const OG_PLACEHOLDER_HASH = 'e0597a81489d31513a5488151287ec107ae9deabf6b0c99399643e6bdbf587ab';
const REQUIRED_TABLES = [
	'contact_submissions',
	'automation_events',
	'automation_dead_letters',
] as const;
const VALIDATION_FORECAST_COMMANDS = [
	{ id: 'doctor-check-cms', label: 'CMS config validates', args: ['run', 'check:cms'] },
	{ id: 'doctor-check-content', label: 'Content files validate', args: ['run', 'check:content'] },
	{ id: 'doctor-check-assets', label: 'Assets validate', args: ['run', 'check:assets'] },
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
	const options: DoctorCliOptions = { json: false };

	for (const arg of argv) {
		if (arg === '--json') {
			options.json = true;
		} else {
			throw new BootstrapScriptError(
				'BOOT-INIT-001',
				`Unknown doctor option: ${arg}`,
				'NEXT: Use bun run doctor [--json].'
			);
		}
	}

	return options;
}

function aggregateStatus(checks: readonly DoctorCheck[]): DoctorStatus {
	if (checks.some((check) => check.severity === 'required' && check.status === 'fail')) {
		return 'fail';
	}
	if (checks.some((check) => check.status !== 'pass')) return 'warn';
	return 'pass';
}

function isFatal(check: DoctorCheck): boolean {
	return (
		check.id === 'BOOT-ENV-001' &&
		check.status === 'fail' &&
		/malformed|parse|missing "="|invalid|not closed/iu.test(check.detail)
	);
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

function cmsRepoPlaceholder(config: string | null): boolean {
	if (!config) return false;
	return (
		/^\s*repo:\s*owner\/repo-name\b/mu.test(config) ||
		config.includes('REPLACE with your GitHub repository') ||
		config.includes('REPLACE PER PROJECT')
	);
}

function localhostUrl(value: string | undefined): boolean {
	if (!value) return false;
	try {
		const parsed = new URL(value);
		return ['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname);
	} catch {
		return false;
	}
}

function databaseUrlFrom(envFile: EnvMap | null, env: NodeJS.ProcessEnv): string | null {
	return envFile?.DATABASE_URL?.trim() || env.DATABASE_URL?.trim() || null;
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
				'No Podman or Docker runtime detected',
				'recommended',
				'Install Podman or Docker, or provide a reachable external DATABASE_URL.'
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
	} else if (cmsRepoPlaceholder(cmsConfig)) {
		checks.push(
			warn(
				'doctor-cms-placeholders',
				'CMS backend repo is launch-ready',
				'static/admin/config.yml still contains the backend.repo placeholder',
				'recommended',
				'Replace backend.repo in static/admin/config.yml before launch.'
			)
		);
	} else {
		checks.push(
			pass(
				'doctor-cms-placeholders',
				'CMS backend repo is launch-ready',
				'No CMS repo placeholder detected',
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

function ogPlaceholderCheck(rootDir: string, blocker: LaunchBlocker): DoctorCheck | null {
	const path = join(rootDir, 'static/og-default.png');
	if (!existsSync(path)) {
		return warn(
			blocker.id,
			blocker.label,
			'static/og-default.png is missing',
			blocker.severity,
			blocker.fixHint
		);
	}

	const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
	if (hash !== OG_PLACEHOLDER_HASH) return null;
	return warn(
		blocker.id,
		blocker.label,
		'static/og-default.png matches the template asset',
		blocker.severity,
		blocker.fixHint
	);
}

function envLaunchCheck(
	envFile: EnvMap | null,
	env: NodeJS.ProcessEnv,
	blocker: LaunchBlocker
): DoctorCheck | null {
	if (blocker.id === 'LAUNCH-ENV-001') {
		const value = envFile?.ORIGIN ?? env.ORIGIN;
		if (localhostUrl(value))
			return warn(blocker.id, blocker.label, `ORIGIN=${value}`, blocker.severity, blocker.fixHint);
	}
	if (blocker.id === 'LAUNCH-ENV-002') {
		const value = envFile?.PUBLIC_SITE_URL ?? env.PUBLIC_SITE_URL;
		if (localhostUrl(value))
			return warn(
				blocker.id,
				blocker.label,
				`PUBLIC_SITE_URL=${value}`,
				blocker.severity,
				blocker.fixHint
			);
	}
	return null;
}

function cmsLaunchCheck(rootDir: string, blocker: LaunchBlocker): DoctorCheck | null {
	const config = readTextIfExists(rootDir, 'static/admin/config.yml');
	if (!cmsRepoPlaceholder(config)) return null;
	return warn(
		blocker.id,
		blocker.label,
		'backend.repo still points to owner/repo-name',
		blocker.severity,
		blocker.fixHint
	);
}

async function launchBlockersSection(
	rootDir: string,
	envFile: EnvMap | null,
	env: NodeJS.ProcessEnv
): Promise<DoctorSection> {
	const checks: DoctorCheck[] = [];

	for (const blocker of LAUNCH_BLOCKERS) {
		const observed =
			(blocker.id === 'LAUNCH-OG-001' && ogPlaceholderCheck(rootDir, blocker)) ||
			envLaunchCheck(envFile, env, blocker) ||
			(blocker.id === 'LAUNCH-CMS-001' && cmsLaunchCheck(rootDir, blocker));

		if (observed) {
			checks.push(observed);
			continue;
		}

		const result = await blocker.check();
		checks.push({
			id: blocker.id,
			status: result.status,
			label: blocker.label,
			detail: result.detail ?? 'No blocker detected',
			severity: blocker.severity,
			hint: result.status === 'pass' ? null : normalizeHint(blocker.fixHint),
		});
	}

	return { id: 'launch-blockers', label: 'Launch Blockers', checks };
}

export async function runDoctor(options: RunDoctorOptions = {}): Promise<DoctorResult> {
	const rootDir = options.rootDir ?? ROOT_DIR;
	const env = options.env ?? process.env;
	const runner = options.runner ?? runCommand;
	const runtimeProbe = options.runtimeProbe ?? defaultRuntimeProbe;
	const now = options.now ?? (() => new Date());

	const environment = await environmentSection(rootDir, env, runner);
	const configuration = configurationSection(rootDir, env);
	const runtime = await runtimeSection(
		rootDir,
		env,
		configuration.databaseUrl,
		runner,
		runtimeProbe
	);
	const validation = await validationForecastSection(rootDir, env, runner);
	const launchBlockers = await launchBlockersSection(rootDir, configuration.envFile, env);

	const sections = [environment, configuration.section, runtime, validation, launchBlockers];
	const checks = sections.flatMap((section) => section.checks);
	const status = aggregateStatus(checks);

	return {
		report: {
			schemaVersion: 1,
			status,
			generatedAt: now().toISOString(),
			sections,
		},
		exitCode: checks.some(isFatal) ? 2 : status === 'fail' ? 1 : 0,
	};
}

function renderHuman(report: DoctorReport): string {
	const lines = [`Doctor status: ${report.status}`, `Generated: ${report.generatedAt}`, ''];

	for (const section of report.sections) {
		lines.push(section.label);
		for (const check of section.checks) {
			lines.push(`  ${check.status.toUpperCase().padEnd(4)} ${check.id} ${check.label}`);
			lines.push(`       ${check.detail}`);
			if (check.hint) lines.push(`       ${check.hint}`);
		}
		lines.push('');
	}

	return lines.join('\n');
}

export async function main(
	argv: readonly string[] = process.argv.slice(2),
	options: MainOptions = {}
): Promise<number> {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;

	try {
		const cli = parseArgs(argv);
		const result = await runDoctor(options);
		if (cli.json) {
			stdout.write(`${JSON.stringify(result.report, null, '\t')}\n`);
		} else {
			stdout.write(renderHuman(result.report));
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
