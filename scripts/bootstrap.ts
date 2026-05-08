#!/usr/bin/env bun
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BootstrapScriptError, ERRORS, type BootErrorCode } from './lib/errors';
import { readEnv, serializeEnv, type EnvMap } from './lib/env-file';
import {
	checkBun,
	detectContainerRuntime,
	gitWorkingTreeDirty,
	type ContainerRuntime,
} from './lib/preflight';
import { fail, ok, run as printRun, skip } from './lib/print';
import {
	postgresIdentifiers,
	provisionLocalPostgres,
	sanitizeProjectSlug,
} from './lib/postgres-dev';
import { INIT_SITE_OWNED_FILES, isAllowed, normalizeRepoPath } from './lib/protected-files';
import { redactSecrets, run as runCommand, type RunResult } from './lib/run';
import { inspectRepo } from './lib/site-state';

type CliOptions = {
	dryRun: boolean;
	ci: boolean;
	yes: boolean;
	answersFile: string | null;
};

type StepStatus = 'ok' | 'skip';

type StepRecord = {
	status: StepStatus;
	summary: string;
};

type BootstrapState = {
	createdAt: string;
	createdContainer: string | null;
	createdContainerPort: number | null;
	createdEnvKeys: string[];
	bootstrapContractVersion: 1;
};

type TemplateProjectJson = {
	$schema: string;
	template: string;
	templateVersion: string;
	bootstrapContract: 1;
	createdFromTemplateAt: string | null;
	projectSlug: string | null;
};

type EnvPlan = {
	envPath: string;
	existing: EnvMap;
	missingKeys: string[];
	defaults: EnvMap;
};

type DatabaseCheckResult =
	| { ok: true; output: string }
	| { ok: false; code: BootErrorCode; hint: string; output: string };

type PostgresStepResult = {
	record: StepRecord;
	databaseUrl: string;
	container: string | null;
	port: number | null;
	runtime: ContainerRuntime | 'external' | 'mock';
};

const TEMPLATE_PACKAGE_NAME = 'tmpl-svelte-app';
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const REQUIRED_ENV_KEYS = ['DATABASE_URL', 'ORIGIN', 'PUBLIC_SITE_URL', 'SESSION_SECRET'] as const;
const MOCK_POSTGRES_PORT = 55432;
const MOCK_POSTGRES_PASSWORD = 'mock-local-password';

const CI_ANSWER_ENV = [
	'BOOTSTRAP_PACKAGE_NAME',
	'BOOTSTRAP_SITE_NAME',
	'BOOTSTRAP_PRODUCTION_URL',
	'BOOTSTRAP_META_DESCRIPTION',
	'BOOTSTRAP_GITHUB_OWNER',
	'BOOTSTRAP_GITHUB_REPO',
	'BOOTSTRAP_SUPPORT_EMAIL',
	'BOOTSTRAP_PROJECT_SLUG',
	'BOOTSTRAP_PRODUCTION_DOMAIN',
	'BOOTSTRAP_PWA_SHORT_NAME',
] as const;

function usageHint(): string {
	return 'NEXT: Use ./bootstrap [--dry-run] [--yes] [--ci] [--answers-file path].';
}

export function parseArgs(argv: readonly string[]): CliOptions {
	const options: CliOptions = {
		dryRun: false,
		ci: false,
		yes: false,
		answersFile: null,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === '--dry-run') {
			options.dryRun = true;
		} else if (arg === '--ci') {
			options.ci = true;
		} else if (arg === '--yes') {
			options.yes = true;
		} else if (arg === '--answers-file') {
			const value = argv[index + 1];
			if (!value || value.startsWith('--')) {
				throw new BootstrapScriptError(
					'BOOT-INIT-001',
					'--answers-file requires a path.',
					usageHint()
				);
			}
			options.answersFile = value;
			index += 1;
		} else {
			throw new BootstrapScriptError(
				'BOOT-INIT-001',
				`Unknown bootstrap option: ${arg}`,
				usageHint()
			);
		}
	}

	return options;
}

function repoPath(rootDir: string, path: string): string {
	return isAbsolute(path) ? path : join(rootDir, path);
}

export function guardedWriteText(rootDir: string, path: string, content: string): void {
	const normalized = normalizeRepoPath(path, rootDir);
	if (!isAllowed(normalized)) {
		throw new BootstrapScriptError(
			'BOOT-GUARD-001',
			`Refusing to write ${normalized}.`,
			'NEXT: Add the path to scripts/lib/protected-files.ts only if bootstrap must own it.'
		);
	}

	const absolutePath = repoPath(rootDir, normalized);
	mkdirSync(dirname(absolutePath), { recursive: true });
	writeFileSync(absolutePath, content, 'utf8');
}

function readPackageName(rootDir: string): string {
	try {
		const raw = readFileSync(join(rootDir, 'package.json'), 'utf8');
		const parsed = JSON.parse(raw) as { name?: unknown };
		return typeof parsed.name === 'string' && parsed.name.trim()
			? parsed.name.trim()
			: TEMPLATE_PACKAGE_NAME;
	} catch {
		return TEMPLATE_PACKAGE_NAME;
	}
}

function readProjectSlug(rootDir: string, fallback: string): string {
	const quadletPath = join(rootDir, 'deploy/quadlets/web.container');
	if (existsSync(quadletPath)) {
		const content = readFileSync(quadletPath, 'utf8');
		const match = content.match(/^EnvironmentFile=%h\/secrets\/([^.]+)\.prod\.env/m);
		if (match?.[1]) return sanitizeProjectSlug(match[1]);
	}
	return sanitizeProjectSlug(fallback);
}

export function materializeTemplateProjectJson(
	rootDir: string,
	projectSlug: string,
	now: () => Date = () => new Date()
): boolean {
	const path = join(rootDir, '.template/project.json');
	if (!existsSync(path)) return false;

	const parsed = JSON.parse(readFileSync(path, 'utf8')) as TemplateProjectJson;
	let changed = false;
	const next: TemplateProjectJson = { ...parsed };

	if (next.createdFromTemplateAt === null) {
		next.createdFromTemplateAt = now().toISOString();
		changed = true;
	}
	if (next.projectSlug === null) {
		next.projectSlug = sanitizeProjectSlug(projectSlug);
		changed = true;
	}

	if (!changed) return false;
	guardedWriteText(rootDir, '.template/project.json', JSON.stringify(next, null, '\t') + '\n');
	return true;
}

function statePath(rootDir: string): string {
	return join(rootDir, '.bootstrap.state.json');
}

function readBootstrapState(rootDir: string): BootstrapState | null {
	const path = statePath(rootDir);
	if (!existsSync(path)) return null;

	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<BootstrapState>;
		if (parsed.bootstrapContractVersion !== 1) return null;
		return {
			createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
			createdContainer:
				typeof parsed.createdContainer === 'string' ? parsed.createdContainer : null,
			createdContainerPort:
				typeof parsed.createdContainerPort === 'number' ? parsed.createdContainerPort : null,
			createdEnvKeys: Array.isArray(parsed.createdEnvKeys)
				? parsed.createdEnvKeys.filter((key): key is string => typeof key === 'string')
				: [],
			bootstrapContractVersion: 1,
		};
	} catch {
		return null;
	}
}

function sameStateFile(rootDir: string, state: BootstrapState): boolean {
	const path = statePath(rootDir);
	if (!existsSync(path)) return false;
	const next = JSON.stringify(state, null, '\t') + '\n';
	return readFileSync(path, 'utf8') === next;
}

function writeBootstrapState(rootDir: string, state: BootstrapState): boolean {
	if (sameStateFile(rootDir, state)) return false;
	guardedWriteText(rootDir, '.bootstrap.state.json', JSON.stringify(state, null, '\t') + '\n');
	return true;
}

function mergeState(
	rootDir: string,
	{
		envKeys,
		container,
		port,
	}: {
		envKeys: readonly string[];
		container?: string | null;
		port?: number | null;
	}
): BootstrapState {
	const existing = readBootstrapState(rootDir);
	const createdEnvKeys = Array.from(
		new Set([...(existing?.createdEnvKeys ?? []), ...envKeys])
	).sort();

	return {
		createdAt: existing?.createdAt ?? new Date().toISOString(),
		createdContainer: container ?? existing?.createdContainer ?? null,
		createdContainerPort: port ?? existing?.createdContainerPort ?? null,
		createdEnvKeys,
		bootstrapContractVersion: 1,
	};
}

function readAnswersFile(rootDir: string, path: string, requireComplete: boolean): string {
	const absolutePath = isAbsolute(path) ? path : join(rootDir, path);
	const content = readFileSync(absolutePath, 'utf8');
	if (!requireComplete) return content.endsWith('\n') ? content : `${content}\n`;

	const lines = content.replace(/\r\n/gu, '\n').split('\n');
	if (lines.at(-1) === '') lines.pop();
	if (lines.length < CI_ANSWER_ENV.length || lines.some((line) => line.trim() === '')) {
		throw new BootstrapScriptError(
			'BOOT-INIT-001',
			`--ci answers file must provide ${CI_ANSWER_ENV.length} non-empty answers.`,
			'NEXT: Fill every init:site answer, one per line, or set the BOOTSTRAP_* variables.'
		);
	}

	return `${lines.slice(0, CI_ANSWER_ENV.length).join('\n')}\n`;
}

export function ciAnswersFromEnv(env: NodeJS.ProcessEnv = process.env): string {
	const missing = CI_ANSWER_ENV.filter((key) => !env[key]?.trim());
	if (missing.length) {
		throw new BootstrapScriptError(
			'BOOT-INIT-001',
			`Missing required --ci bootstrap answers: ${missing.join(', ')}.`,
			'NEXT: Set all BOOTSTRAP_* init answers or pass --answers-file.'
		);
	}

	return `${CI_ANSWER_ENV.map((key) => env[key]?.trim() ?? '').join('\n')}\n`;
}

function initInputForOptions(rootDir: string, options: CliOptions): string | undefined {
	if (options.answersFile) return readAnswersFile(rootDir, options.answersFile, options.ci);
	if (options.ci) return ciAnswersFromEnv();
	if (options.yes) return `${Array.from({ length: CI_ANSWER_ENV.length }, () => '').join('\n')}\n`;
	return undefined;
}

async function runInteractive(
	command: string,
	args: readonly string[],
	cwd: string
): Promise<number> {
	return await new Promise((resolvePromise, reject) => {
		const child = spawn(command, [...args], {
			cwd,
			stdio: 'inherit',
		});
		child.on('error', reject);
		child.on('close', (code) => resolvePromise(code ?? 1));
	});
}

async function runInitSite(rootDir: string, input: string | undefined): Promise<RunResult> {
	for (const file of INIT_SITE_OWNED_FILES) {
		if (!isAllowed(file)) {
			throw new BootstrapScriptError(
				'BOOT-GUARD-001',
				`init:site target ${file} is not in the protected-file allowlist.`,
				'NEXT: Keep scripts/lib/protected-files.ts aligned with scripts/init-site.ts.'
			);
		}
	}

	if (input === undefined) {
		const code = await runInteractive('bun', ['run', 'init:site'], rootDir);
		return { code, stdout: '', stderr: '', durationMs: 0 };
	}

	return await runCommand('bun', ['run', 'init:site'], {
		cwd: rootDir,
		stdin: input,
	});
}

function isBootCode(value: string): value is BootErrorCode {
	return value.startsWith('BOOT-') && value in ERRORS;
}

function isMockProvisioner(): boolean {
	return process.env.BOOTSTRAP_PROVISIONER === 'mock';
}

function mockFailureCode(): BootErrorCode | null {
	const value = process.env.BOOTSTRAP_MOCK_FAILURE?.trim();
	if (!value) return null;
	if (isBootCode(value)) return value;
	throw new BootstrapScriptError(
		'BOOT-INIT-001',
		`Unsupported BOOTSTRAP_MOCK_FAILURE value: ${value}`,
		'NEXT: Use a documented BOOT-* code or unset BOOTSTRAP_MOCK_FAILURE.'
	);
}

function mockHint(code: BootErrorCode): string {
	return `NEXT: check:bootstrap intentionally triggered ${code}; inspect bootstrap handling for that failure.`;
}

function mockFailureOutput(code: BootErrorCode): string {
	return `FAIL ${code} ${ERRORS[code]}\n${mockHint(code)}\n`;
}

function throwMockFailure(code: BootErrorCode): never {
	throw new BootstrapScriptError(code, `Mock bootstrap failure for ${code}.`, mockHint(code));
}

function recordMockAction(action: string): void {
	process.stdout.write(`MOCK ${action}\n`);
}

function parseFailure(
	output: string,
	fallback: BootErrorCode
): Pick<DatabaseCheckResult & { ok: false }, 'code' | 'hint'> {
	const codeMatch = output.match(/FAIL\s+(BOOT-[A-Z0-9-]+)/u);
	const nextMatch = output.match(/^NEXT:\s*.+$/mu);
	const code = codeMatch && isBootCode(codeMatch[1]) ? codeMatch[1] : fallback;
	return {
		code,
		hint: nextMatch?.[0] ?? 'NEXT: Inspect the command output above and retry.',
	};
}

async function checkDatabaseUrl(
	rootDir: string,
	databaseUrl: string
): Promise<DatabaseCheckResult> {
	if (isMockProvisioner()) {
		recordMockAction('bun run check:db');
		const failure = mockFailureCode();
		if (failure && ['BOOT-DB-001', 'BOOT-DB-002', 'BOOT-DB-003', 'BOOT-DB-004'].includes(failure)) {
			const output = mockFailureOutput(failure);
			return { ok: false, code: failure, hint: mockHint(failure), output };
		}

		return {
			ok: true,
			output:
				'OK   Database connectivity verified\n' +
				`     host: 127.0.0.1:${MOCK_POSTGRES_PORT}\n` +
				'     db:   mock\n',
		};
	}

	const result = await runCommand('bun', ['run', 'check:db'], {
		cwd: rootDir,
		env: { ...process.env, DATABASE_URL: databaseUrl },
		capture: true,
	});
	const output = `${result.stdout}${result.stderr}`;
	if (result.code === 0) return { ok: true, output };
	return { ok: false, output, ...parseFailure(output, 'BOOT-DB-001') };
}

function parsedDatabaseUrl(value: string): URL | null {
	try {
		const parsed = new URL(value);
		if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) return null;
		return parsed;
	} catch {
		return null;
	}
}

function databaseUrlMatchesBootstrapState(
	databaseUrl: string,
	projectSlug: string,
	state: BootstrapState | null
): boolean {
	if (!state?.createdContainer || !state.createdContainerPort) return false;

	const parsed = parsedDatabaseUrl(databaseUrl);
	if (!parsed) return false;

	const ids = postgresIdentifiers(projectSlug);
	return (
		state.createdContainer === ids.container &&
		(parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
		Number.parseInt(parsed.port || '5432', 10) === state.createdContainerPort &&
		decodeURIComponent(parsed.username) === ids.user &&
		decodeURIComponent(parsed.pathname.replace(/^\/+/u, '')) === ids.database
	);
}

function envDefaults(): EnvMap {
	return {
		ORIGIN: 'http://127.0.0.1:5173',
		PUBLIC_SITE_URL: 'http://127.0.0.1:5173',
		SESSION_SECRET: randomBytes(32).toString('hex'),
	};
}

function planEnv(rootDir: string): EnvPlan {
	const envPath = join(rootDir, '.env');
	const existing = readEnv(envPath);
	const missingKeys = REQUIRED_ENV_KEYS.filter((key) => !existing[key]?.trim());
	const defaults = envDefaults();
	return { envPath, existing, missingKeys, defaults };
}

function materializeEnv(
	rootDir: string,
	plan: EnvPlan,
	databaseUrl: string | null,
	options: CliOptions
): string[] {
	const additions: EnvMap = {};
	for (const key of REQUIRED_ENV_KEYS) {
		if (!plan.missingKeys.includes(key)) continue;
		if (key === 'DATABASE_URL') {
			if (databaseUrl) additions.DATABASE_URL = databaseUrl;
		} else {
			additions[key] = plan.defaults[key];
		}
	}

	const createdKeys = REQUIRED_ENV_KEYS.filter((key) => key in additions);
	if (createdKeys.length === 0) return [];

	if (options.dryRun) return createdKeys;

	const merged: EnvMap = { ...plan.existing };
	for (const key of REQUIRED_ENV_KEYS) {
		if (key in additions) merged[key] = additions[key];
	}

	guardedWriteText(rootDir, '.env', serializeEnv(merged));
	return createdKeys;
}

async function stepPreflight(rootDir: string): Promise<StepRecord> {
	printRun('Preflight');
	const bun = checkBun();
	if (!bun.ok) {
		throw new BootstrapScriptError('BOOT-BUN-001', bun.reason, 'NEXT: Install Bun 1.1 or newer.');
	}

	if (await gitWorkingTreeDirty({ cwd: rootDir })) {
		process.stderr.write(
			'WARN Working tree has uncommitted changes; bootstrap will continue without reverting them.\n'
		);
	}

	ok('Preflight complete');
	return { status: 'ok', summary: 'Preflight complete' };
}

async function stepSiteInit(rootDir: string, options: CliOptions): Promise<StepRecord> {
	printRun('Site init');

	const before = await inspectRepo({ rootDir });
	const packageName = readPackageName(rootDir);
	if (packageName !== TEMPLATE_PACKAGE_NAME && before.initSiteDone) {
		skip('Site initialized', 'already customized');
		return { status: 'skip', summary: 'Site initialized' };
	}

	if (options.dryRun) {
		if (options.ci || options.answersFile) initInputForOptions(rootDir, options);
		ok('Site initialization planned');
		process.stdout.write('DRY-RUN WOULD run: bun run init:site\n');
		return { status: 'ok', summary: 'Site initialization planned' };
	}

	const result = await runInitSite(rootDir, initInputForOptions(rootDir, options));
	if (result.code !== 0) {
		throw new BootstrapScriptError(
			'BOOT-INIT-001',
			'init:site failed.',
			'NEXT: Re-run bun run init:site, fix the reported issue, then re-run ./bootstrap.'
		);
	}

	const after = await inspectRepo({ rootDir });
	const afterPackageName = readPackageName(rootDir);
	if (afterPackageName === TEMPLATE_PACKAGE_NAME || !after.initSiteDone) {
		const files = Object.keys(after.placeholdersByFile).slice(0, 4).join(', ');
		throw new BootstrapScriptError(
			'BOOT-INIT-001',
			files ? `init:site left placeholders in ${files}.` : 'init:site left template placeholders.',
			'NEXT: Provide project-specific init answers and re-run ./bootstrap.'
		);
	}

	ok('Site initialized');
	return { status: 'ok', summary: 'Site initialized' };
}

function stepEnvMaterialize(plan: EnvPlan, options: CliOptions): StepRecord {
	printRun('.env materialize');

	if (plan.missingKeys.length === 0) {
		skip('.env materialized', 'required keys present');
		return { status: 'skip', summary: '.env already has required keys' };
	}

	if (options.dryRun) {
		ok('.env materialization planned');
		process.stdout.write(`DRY-RUN WOULD add ${plan.missingKeys.length} missing local .env keys.\n`);
		return { status: 'ok', summary: '.env materialization planned' };
	}

	ok('.env materialization prepared');
	return { status: 'ok', summary: `.env will add ${plan.missingKeys.join(', ')}` };
}

async function stepPostgres(
	rootDir: string,
	projectSlug: string,
	envPlan: EnvPlan,
	options: CliOptions
): Promise<PostgresStepResult> {
	printRun('Postgres provision');

	const existingDatabaseUrl = envPlan.existing.DATABASE_URL?.trim();

	if (options.dryRun) {
		if (existingDatabaseUrl) {
			ok('Postgres verification planned');
			process.stdout.write(
				'DRY-RUN WOULD verify existing DATABASE_URL and would not overwrite it if unreachable.\n'
			);
			return {
				record: { status: 'ok', summary: 'Postgres verification planned' },
				databaseUrl: existingDatabaseUrl,
				container: null,
				port: null,
				runtime: 'external',
			};
		}

		ok('Postgres provisioning planned');
		process.stdout.write('DRY-RUN WOULD provision local project Postgres with Podman.\n');
		return {
			record: { status: 'ok', summary: 'Postgres provisioning planned' },
			databaseUrl: '',
			container: `${projectSlug}-pg`,
			port: null,
			runtime: 'external',
		};
	}

	if (existingDatabaseUrl) {
		const databaseCheck = await checkDatabaseUrl(rootDir, existingDatabaseUrl);
		if (databaseCheck.ok) {
			skip('Postgres provision', 'existing DATABASE_URL reachable');
			return {
				record: { status: 'skip', summary: 'Postgres already reachable' },
				databaseUrl: existingDatabaseUrl,
				container: null,
				port: null,
				runtime: 'external',
			};
		}

		const state = readBootstrapState(rootDir);
		if (!databaseUrlMatchesBootstrapState(existingDatabaseUrl, projectSlug, state)) {
			throw new BootstrapScriptError(
				databaseCheck.code,
				'Existing DATABASE_URL is not reachable and is not bootstrap-owned.',
				databaseCheck.hint
			);
		}

		const runtime = await detectContainerRuntime();
		const result = await provisionLocalPostgres({
			projectSlug,
			existingDatabaseUrl,
			runtime,
			isDatabaseReachable: async () => false,
		});

		skip('Postgres provision', 'bootstrap-owned container already exists');
		return {
			record: { status: 'skip', summary: `Postgres container ${result.container} already running` },
			databaseUrl: result.databaseUrl,
			container: result.container,
			port: result.port,
			runtime: result.runtime,
		};
	}

	if (isMockProvisioner()) {
		const failure = mockFailureCode();
		if (failure && ['BOOT-PG-001', 'BOOT-PG-002', 'BOOT-PG-003'].includes(failure)) {
			throwMockFailure(failure);
		}

		recordMockAction('provision local Postgres');
		const { database, user, container } = postgresIdentifiers(projectSlug);
		const databaseUrl = `postgres://${user}:${encodeURIComponent(
			MOCK_POSTGRES_PASSWORD
		)}@127.0.0.1:${MOCK_POSTGRES_PORT}/${database}`;
		ok(`Mock Postgres ${container} provisioned on 127.0.0.1:${MOCK_POSTGRES_PORT}`);
		return {
			record: {
				status: 'ok',
				summary: `Mock Postgres ${container} provisioned on 127.0.0.1:${MOCK_POSTGRES_PORT}`,
			},
			databaseUrl,
			container,
			port: MOCK_POSTGRES_PORT,
			runtime: 'mock',
		};
	}

	const result = await provisionLocalPostgres({
		projectSlug,
		isDatabaseReachable: async (databaseUrl) => (await checkDatabaseUrl(rootDir, databaseUrl)).ok,
	});

	ok(
		result.container && result.port
			? `Postgres container ${result.container} running on 127.0.0.1:${result.port}`
			: 'Postgres database reachable'
	);

	return {
		record: {
			status: 'ok',
			summary:
				result.container && result.port
					? `Postgres container ${result.container} running on 127.0.0.1:${result.port}`
					: 'Postgres database reachable',
		},
		databaseUrl: result.databaseUrl,
		container: result.container,
		port: result.port,
		runtime: result.runtime,
	};
}

async function stepMigrate(
	rootDir: string,
	databaseUrl: string,
	options: CliOptions
): Promise<StepRecord> {
	printRun('Migrate');
	if (options.dryRun) {
		ok('Migrations planned');
		process.stdout.write('DRY-RUN WOULD run: bun run db:migrate\n');
		return { status: 'ok', summary: 'Migrations planned' };
	}

	if (isMockProvisioner()) {
		recordMockAction('bun run db:migrate');
		if (mockFailureCode() === 'BOOT-MIG-001') {
			throwMockFailure('BOOT-MIG-001');
		}
		ok('Migrations simulated');
		return { status: 'ok', summary: 'Migrations simulated' };
	}

	const result = await runCommand('bun', ['run', 'db:migrate'], {
		cwd: rootDir,
		env: { ...process.env, DATABASE_URL: databaseUrl },
	});
	if (result.code !== 0) {
		throw new BootstrapScriptError(
			'BOOT-MIG-001',
			'drizzle-kit migrate failed.',
			'NEXT: Fix the migration error above, then re-run ./bootstrap.'
		);
	}

	ok('Migrations applied');
	return { status: 'ok', summary: 'Migrations applied' };
}

async function stepHealthVerify(
	rootDir: string,
	databaseUrl: string,
	options: CliOptions
): Promise<StepRecord> {
	printRun('Health verify');
	if (options.dryRun) {
		ok('Database connectivity check planned');
		process.stdout.write('DRY-RUN WOULD run: bun run check:db\n');
		return { status: 'ok', summary: 'Database connectivity check planned' };
	}

	const result = await checkDatabaseUrl(rootDir, databaseUrl);
	if (!result.ok) {
		throw new BootstrapScriptError(result.code, ERRORS[result.code], result.hint);
	}

	process.stdout.write(redactSecrets(result.output));
	return { status: 'ok', summary: 'Database connectivity verified' };
}

function summarizeStatus(record: StepRecord): string {
	return record.status === 'skip' ? 'SKIP' : 'OK  ';
}

function printSummary(records: {
	dependencies: StepRecord;
	site: StepRecord;
	env: StepRecord;
	postgres: StepRecord;
	migrate: StepRecord;
	health: StepRecord;
	dryRun: boolean;
}): void {
	process.stdout.write('\nWhat just happened:\n');
	for (const record of [
		records.dependencies,
		records.site,
		records.env,
		records.postgres,
		records.migrate,
		records.health,
	]) {
		process.stdout.write(`  ${summarizeStatus(record)} ${record.summary}\n`);
	}

	process.stdout.write('\nNext:\n');
	process.stdout.write('  bun run dev          # start dev server at http://127.0.0.1:5173\n');
	process.stdout.write('  bun run seed:dev     # optional demo content for styling passes\n');
	process.stdout.write('  edit src/lib/styles/tokens.css       # brand colors / fonts\n');
	process.stdout.write('  edit content/pages/home.yml          # homepage content\n');

	process.stdout.write('\nCMS local editing:\n');
	process.stdout.write('  1. Run: bun run dev\n');
	process.stdout.write('  2. Open: http://127.0.0.1:5173/admin/index.html in a Chromium browser\n');
	process.stdout.write('  3. Click "Work with Local Repository"\n');
	process.stdout.write('  4. Select this project folder\n');
	process.stdout.write('  5. Edit content; commit changes with Git as usual\n');

	process.stdout.write('\nLaunch blockers (run `bun run doctor` for detail):\n');
	process.stdout.write(
		'  WARN static/og-default.png is still the template asset       (LAUNCH-OG-001)\n'
	);
	process.stdout.write(
		'  WARN ORIGIN and PUBLIC_SITE_URL still point to localhost     (LAUNCH-ENV-001/002)\n'
	);
	process.stdout.write(
		'  WARN static/admin/config.yml backend.repo still placeholder  (LAUNCH-CMS-001)\n'
	);

	if (records.dryRun) {
		process.stdout.write(
			'\nDry run complete. No files, dependencies, or containers were changed.\n'
		);
	} else {
		process.stdout.write(
			'\nBootstrap is safe to re-run. State recorded at .bootstrap.state.json.\n'
		);
	}
}

async function mainWithOptions(rootDir: string, options: CliOptions): Promise<number> {
	const dependencies: StepRecord = options.dryRun
		? { status: 'skip', summary: 'Dependencies not installed in dry-run' }
		: { status: 'ok', summary: 'Dependencies installed' };

	await stepPreflight(rootDir);
	if (process.env.BOOTSTRAP_TEST_GUARD_WRITE === '1') {
		guardedWriteText(rootDir, 'src/routes/+page.svelte', '<h1>not allowed</h1>\n');
	}

	const site = await stepSiteInit(rootDir, options);
	const packageName = readPackageName(rootDir);
	const projectSlug = readProjectSlug(rootDir, packageName);
	if (!options.dryRun) materializeTemplateProjectJson(rootDir, projectSlug);
	const envPlan = planEnv(rootDir);
	const env = stepEnvMaterialize(envPlan, options);
	const postgres = await stepPostgres(rootDir, projectSlug, envPlan, options);
	const createdEnvKeys = materializeEnv(rootDir, envPlan, postgres.databaseUrl || null, options);

	if (!options.dryRun && createdEnvKeys.length) {
		const state = mergeState(rootDir, {
			envKeys: createdEnvKeys,
			container: postgres.container,
			port: postgres.port,
		});
		writeBootstrapState(rootDir, state);
	}

	const effectiveDatabaseUrl = postgres.databaseUrl || envPlan.existing.DATABASE_URL;
	if (!effectiveDatabaseUrl && !options.dryRun) {
		throw new BootstrapScriptError(
			'BOOT-ENV-001',
			'DATABASE_URL could not be materialized.',
			'NEXT: Remove the malformed .env and re-run ./bootstrap.'
		);
	}

	const migrate = await stepMigrate(rootDir, effectiveDatabaseUrl, options);
	const health = await stepHealthVerify(rootDir, effectiveDatabaseUrl, options);

	printSummary({
		dependencies,
		site,
		env:
			createdEnvKeys.length > 0
				? {
						status: 'ok',
						summary: options.dryRun
							? `.env would update at ${normalizeRepoPath(envPlan.envPath, rootDir)}`
							: `.env updated at ${normalizeRepoPath(envPlan.envPath, rootDir)}`,
					}
				: env,
		postgres: postgres.record,
		migrate,
		health,
		dryRun: options.dryRun,
	});

	return 0;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
	try {
		return await mainWithOptions(ROOT_DIR, parseArgs(argv));
	} catch (error) {
		if (error instanceof BootstrapScriptError) {
			fail(error.code, error.message, error.hint);
			return 1;
		}

		const message = error instanceof Error ? error.message : String(error);
		fail(
			'BOOT-INIT-001',
			`Bootstrap failed unexpectedly: ${message}`,
			'NEXT: Inspect the output above and re-run ./bootstrap after fixing the issue.'
		);
		return 1;
	}
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
	process.exit(await main());
}
