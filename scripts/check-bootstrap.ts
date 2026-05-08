#!/usr/bin/env bun
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	readlinkSync,
	rmSync,
	symlinkSync,
	writeFileSync,
	type Dirent,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type BootErrorCode } from './lib/errors';
import { parseEnv, serializeEnv, type EnvMap } from './lib/env-file';
import { PROTECTED_FILES } from './lib/protected-files';

type CheckSelection = {
	dryRun: boolean;
	mock: boolean;
	failures: boolean;
};

type RawRunResult = {
	code: number;
	stdout: string;
	stderr: string;
};

type FixtureEnv = EnvMap | { __raw: string };

type FixtureState = {
	createdAt: string;
	createdContainer: string | null;
	createdContainerPort: number | null;
	createdEnvKeys: string[];
	bootstrapContractVersion: 1;
};

type FixtureConfig = {
	initialized?: boolean;
	env?: FixtureEnv;
	state?: FixtureState;
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const FIXTURE_ROOT = join(ROOT_DIR, 'tests/fixtures/bootstrap');
const TEMP_PREFIX = 'check-bootstrap-';
const TEMPLATE_PACKAGE_NAME = 'tmpl-svelte-app';
const MOCK_PORT = 55432;
const MOCK_SLUG = 'phase-five-smoke';
const MOCK_CONTAINER = `${MOCK_SLUG}-postgres`;
const REQUIRED_ENV_KEYS = ['DATABASE_URL', 'ORIGIN', 'PUBLIC_SITE_URL', 'SESSION_SECRET'] as const;
const HEX_32_BYTE_SECRET = /\b[a-f0-9]{64}\b/giu;
const PROTECTED_FILE_SET = new Set<string>(PROTECTED_FILES);

const BASE_COPY_PATHS = [
	'.env.example',
	'.gitignore',
	'bootstrap',
	'content/pages/home.yml',
	'deploy/Caddyfile.example',
	'deploy/env.example',
	'deploy/quadlets/web.container',
	'package.json',
	'README.md',
	'scripts',
	'site.project.json',
	'src/app.html',
	'src/lib/config/site.ts',
	'static/admin/config.yml',
	'static/site.webmanifest',
] as const;

const BOOTSTRAP_ANSWERS = {
	BOOTSTRAP_PACKAGE_NAME: MOCK_SLUG,
	BOOTSTRAP_SITE_NAME: 'Phase Five Smoke',
	BOOTSTRAP_PRODUCTION_URL: 'https://phase-five.example',
	BOOTSTRAP_META_DESCRIPTION: 'Phase five bootstrap smoke site.',
	BOOTSTRAP_GITHUB_OWNER: 'example-owner',
	BOOTSTRAP_GITHUB_REPO: 'phase-five-smoke',
	BOOTSTRAP_SUPPORT_EMAIL: 'support@phase-five.example',
	BOOTSTRAP_PROJECT_SLUG: MOCK_SLUG,
	BOOTSTRAP_PRODUCTION_DOMAIN: 'phase-five.example',
	BOOTSTRAP_PWA_SHORT_NAME: 'Phase5',
} as const;

const BOOTSTRAP_ANSWER_VALUES = [
	BOOTSTRAP_ANSWERS.BOOTSTRAP_PACKAGE_NAME,
	BOOTSTRAP_ANSWERS.BOOTSTRAP_SITE_NAME,
	BOOTSTRAP_ANSWERS.BOOTSTRAP_PRODUCTION_URL,
	BOOTSTRAP_ANSWERS.BOOTSTRAP_META_DESCRIPTION,
	BOOTSTRAP_ANSWERS.BOOTSTRAP_GITHUB_OWNER,
	BOOTSTRAP_ANSWERS.BOOTSTRAP_GITHUB_REPO,
	BOOTSTRAP_ANSWERS.BOOTSTRAP_SUPPORT_EMAIL,
	BOOTSTRAP_ANSWERS.BOOTSTRAP_PROJECT_SLUG,
	BOOTSTRAP_ANSWERS.BOOTSTRAP_PRODUCTION_DOMAIN,
	BOOTSTRAP_ANSWERS.BOOTSTRAP_PWA_SHORT_NAME,
] as const;

const FAILURE_CASES: Array<{
	code: BootErrorCode;
	fixture: string;
	env?: Record<string, string>;
	mutate?: (rootDir: string) => void;
}> = [
	{
		code: 'BOOT-ENV-001',
		fixture: 'fresh-template',
		mutate: (rootDir) => writeFileSync(join(rootDir, '.env'), 'DATABASE_URL\n', 'utf8'),
	},
	{
		code: 'BOOT-INIT-001',
		fixture: 'fresh-template',
		env: { BOOTSTRAP_PACKAGE_NAME: '' },
	},
	{
		code: 'BOOT-PG-001',
		fixture: 'fresh-template',
		env: { BOOTSTRAP_MOCK_FAILURE: 'BOOT-PG-001' },
	},
	{
		code: 'BOOT-PG-002',
		fixture: 'fresh-template',
		env: { BOOTSTRAP_MOCK_FAILURE: 'BOOT-PG-002' },
	},
	{
		code: 'BOOT-PG-003',
		fixture: 'fresh-template',
		env: { BOOTSTRAP_MOCK_FAILURE: 'BOOT-PG-003' },
	},
	{ code: 'BOOT-DB-001', fixture: 'broken-env', env: { BOOTSTRAP_MOCK_FAILURE: 'BOOT-DB-001' } },
	{ code: 'BOOT-DB-002', fixture: 'broken-env', env: { BOOTSTRAP_MOCK_FAILURE: 'BOOT-DB-002' } },
	{ code: 'BOOT-DB-003', fixture: 'broken-env', env: { BOOTSTRAP_MOCK_FAILURE: 'BOOT-DB-003' } },
	{ code: 'BOOT-DB-004', fixture: 'broken-env', env: { BOOTSTRAP_MOCK_FAILURE: 'BOOT-DB-004' } },
	{
		code: 'BOOT-MIG-001',
		fixture: 'fresh-template',
		env: { BOOTSTRAP_MOCK_FAILURE: 'BOOT-MIG-001' },
	},
	{
		code: 'BOOT-GUARD-001',
		fixture: 'fresh-template',
		env: { BOOTSTRAP_TEST_GUARD_WRITE: '1' },
	},
];

const tempDirs: string[] = [];
let tempDirsCleaned = false;

class CheckBootstrapError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CheckBootstrapError';
	}
}

function parseArgs(argv: readonly string[]): CheckSelection {
	if (argv.includes('--help') || argv.includes('-h')) {
		process.stdout.write(
			'Usage: bun run check:bootstrap [--dry-run] [--mock]\n\n' +
				'No flags runs dry-run mode, mock-provisioner mode, and failure-mode coverage.\n'
		);
		process.exit(0);
	}

	const unknown = argv.filter((arg) => arg !== '--dry-run' && arg !== '--mock');
	if (unknown.length) {
		throw new CheckBootstrapError(`Unknown check:bootstrap option: ${unknown.join(', ')}`);
	}

	const focused = argv.includes('--dry-run') || argv.includes('--mock');
	return {
		dryRun: !focused || argv.includes('--dry-run'),
		mock: !focused || argv.includes('--mock'),
		failures: !focused,
	};
}

function outputOf(result: RawRunResult): string {
	return `${result.stdout}${result.stderr}`;
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new CheckBootstrapError(message);
}

function assertIncludes(output: string, expected: string, label: string): void {
	assert(output.includes(expected), `${label} missing expected output: ${expected}`);
}

function runRaw(
	command: string,
	args: readonly string[],
	options: { cwd: string; env?: NodeJS.ProcessEnv; stdin?: string }
): Promise<RawRunResult> {
	if (options.stdin !== undefined) {
		const result = spawnSync(command, [...args], {
			cwd: options.cwd,
			env: options.env,
			input: options.stdin,
			encoding: 'utf8',
		});
		if (result.error) return Promise.reject(result.error);
		return Promise.resolve({
			code: result.status ?? 1,
			stdout: result.stdout ?? '',
			stderr: result.stderr ?? '',
		});
	}

	return new Promise((resolvePromise, reject) => {
		const child = spawn(command, [...args], {
			cwd: options.cwd,
			env: options.env,
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		let stdout = '';
		let stderr = '';

		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on('data', (chunk: string) => {
			stderr += chunk;
		});
		child.on('error', reject);
		child.on('close', (code) => resolvePromise({ code: code ?? 1, stdout, stderr }));

		child.stdin.end();
	});
}

function fixtureConfig(name: string): FixtureConfig {
	const path = join(FIXTURE_ROOT, name, 'fixture.json');
	if (!existsSync(path)) {
		throw new CheckBootstrapError(`Missing bootstrap fixture config: ${path}`);
	}
	return JSON.parse(readFileSync(path, 'utf8')) as FixtureConfig;
}

function copyRepoPath(rootDir: string, path: string): void {
	const source = join(ROOT_DIR, path);
	const destination = join(rootDir, path);
	if (!existsSync(source)) throw new CheckBootstrapError(`Missing template source path: ${path}`);
	mkdirSync(dirname(destination), { recursive: true });
	cpSync(source, destination, { recursive: true, force: true, verbatimSymlinks: true });
}

function symlinkNodeModules(rootDir: string): void {
	const source = join(ROOT_DIR, 'node_modules');
	assert(existsSync(source), 'node_modules is missing; run bun install before check:bootstrap.');
	symlinkSync(source, join(rootDir, 'node_modules'), 'dir');
}

function writeFixtureEnv(rootDir: string, env: FixtureEnv): void {
	if ('__raw' in env) {
		const content = env.__raw.endsWith('\n') ? env.__raw : `${env.__raw}\n`;
		writeFileSync(join(rootDir, '.env'), content, 'utf8');
		return;
	}

	writeFileSync(join(rootDir, '.env'), serializeEnv(env), 'utf8');
}

async function prepareFixture(name: string): Promise<string> {
	const rootDir = mkdtempSync(join(tmpdir(), `${TEMP_PREFIX}${name}-`));
	tempDirs.push(rootDir);

	for (const path of BASE_COPY_PATHS) copyRepoPath(rootDir, path);
	symlinkNodeModules(rootDir);

	const config = fixtureConfig(name);
	if (config.initialized) {
		const result = await runRaw('bun', ['scripts/init-site.ts'], {
			cwd: rootDir,
			stdin: `${BOOTSTRAP_ANSWER_VALUES.join('\n')}\n`,
			env: { ...process.env },
		});
		assert(result.code === 0, `Fixture ${name} failed to initialize:\n${outputOf(result)}`);
	}

	if (config.env) writeFixtureEnv(rootDir, config.env);
	if (config.state) {
		writeFileSync(
			join(rootDir, '.bootstrap.state.json'),
			`${JSON.stringify(config.state, null, '\t')}\n`,
			'utf8'
		);
	}

	return rootDir;
}

function bootstrapEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
	return {
		...process.env,
		...BOOTSTRAP_ANSWERS,
		BOOTSTRAP_PROVISIONER: 'mock',
		...overrides,
	};
}

function runBootstrap(
	rootDir: string,
	args: readonly string[],
	env: Record<string, string> = {}
): Promise<RawRunResult> {
	return runRaw('bun', ['scripts/bootstrap.ts', ...args], {
		cwd: rootDir,
		env: bootstrapEnv(env),
	});
}

function shouldSkipTreeEntry(entry: Dirent): boolean {
	return entry.name === '.git' || entry.name === 'node_modules';
}

function walkFiles(rootDir: string, currentDir = rootDir): string[] {
	return readdirSync(currentDir, { withFileTypes: true }).flatMap((entry) => {
		if (shouldSkipTreeEntry(entry)) return [];
		const absolutePath = join(currentDir, entry.name);
		const repoPath = relative(rootDir, absolutePath).replace(/\\/g, '/');
		if (entry.isDirectory()) return walkFiles(rootDir, absolutePath);
		return [repoPath];
	});
}

function fileFingerprint(path: string): string {
	const stat = lstatSync(path);
	const hash = createHash('sha256');
	hash.update(stat.isSymbolicLink() ? 'symlink' : 'file');
	hash.update('\0');
	hash.update(stat.isSymbolicLink() ? readlinkSync(path) : readFileSync(path));
	return hash.digest('hex');
}

function treeSnapshot(rootDir: string): Map<string, string> {
	const snapshot = new Map<string, string>();
	for (const file of walkFiles(rootDir).sort()) {
		snapshot.set(file, fileFingerprint(join(rootDir, file)));
	}
	return snapshot;
}

function changedFiles(before: Map<string, string>, after: Map<string, string>): string[] {
	const files = new Set([...before.keys(), ...after.keys()]);
	return [...files].filter((file) => before.get(file) !== after.get(file)).sort();
}

function assertOnlyProtectedFilesChanged(files: readonly string[]): void {
	const unexpected = files.filter((file) => !PROTECTED_FILE_SET.has(file));
	assert(
		unexpected.length === 0,
		`Bootstrap mutated non-allowlisted paths:\n${unexpected.join('\n')}`
	);
}

function assertEnvShape(rootDir: string): EnvMap {
	const path = join(rootDir, '.env');
	assert(existsSync(path), 'Mock bootstrap did not create .env.');
	const env = parseEnv(readFileSync(path, 'utf8'));
	const keys = Object.keys(env).sort();
	assert(
		JSON.stringify(keys) === JSON.stringify([...REQUIRED_ENV_KEYS].sort()),
		`.env should contain exactly ${REQUIRED_ENV_KEYS.join(', ')}; got ${keys.join(', ')}`
	);
	return env;
}

function assertStateShape(rootDir: string): string {
	const path = join(rootDir, '.bootstrap.state.json');
	assert(existsSync(path), 'Mock bootstrap did not create .bootstrap.state.json.');
	const content = readFileSync(path, 'utf8');
	const state = JSON.parse(content) as FixtureState;
	assert(
		typeof state.createdAt === 'string' && state.createdAt.length > 0,
		'State missing createdAt.'
	);
	assert(
		state.createdContainer === MOCK_CONTAINER,
		`State createdContainer should be ${MOCK_CONTAINER}.`
	);
	assert(
		state.createdContainerPort === MOCK_PORT,
		`State createdContainerPort should be ${MOCK_PORT}.`
	);
	assert(state.bootstrapContractVersion === 1, 'State bootstrapContractVersion should be 1.');
	assert(
		JSON.stringify([...state.createdEnvKeys].sort()) ===
			JSON.stringify([...REQUIRED_ENV_KEYS].sort()),
		`State createdEnvKeys should be ${REQUIRED_ENV_KEYS.join(', ')}.`
	);
	return content;
}

function secretValues(env: EnvMap): string[] {
	const values = [env.SESSION_SECRET];
	const parsed = new URL(env.DATABASE_URL);
	if (parsed.password) values.push(decodeURIComponent(parsed.password));
	return values.filter((value): value is string => Boolean(value));
}

function assertNoSecretLeak(result: RawRunResult, env: EnvMap): void {
	const output = outputOf(result);
	for (const secret of secretValues(env)) {
		assert(!output.includes(secret), 'Generated secret leaked into bootstrap stdout/stderr.');
	}

	HEX_32_BYTE_SECRET.lastIndex = 0;
	assert(
		!HEX_32_BYTE_SECRET.test(output),
		'Bootstrap stdout/stderr contained a 32-byte hex secret-shaped value.'
	);
}

async function git(rootDir: string, args: readonly string[]): Promise<RawRunResult> {
	return await runRaw('git', args, { cwd: rootDir, env: { ...process.env } });
}

async function snapshotPostFirstRun(rootDir: string): Promise<void> {
	let result = await git(rootDir, ['init', '-q']);
	assert(result.code === 0, `git init failed:\n${outputOf(result)}`);
	result = await git(rootDir, ['add', '-A']);
	assert(result.code === 0, `git add failed:\n${outputOf(result)}`);
	result = await git(rootDir, ['add', '-f', '.env', '.bootstrap.state.json']);
	assert(result.code === 0, `git add ignored bootstrap outputs failed:\n${outputOf(result)}`);
	result = await git(rootDir, [
		'-c',
		'user.name=check-bootstrap',
		'-c',
		'user.email=check-bootstrap@example.invalid',
		'commit',
		'-q',
		'-m',
		'post-first-bootstrap',
	]);
	assert(result.code === 0, `git commit failed:\n${outputOf(result)}`);
}

async function assertGitDiffEmpty(rootDir: string): Promise<void> {
	const diff = await git(rootDir, ['diff', '--exit-code', '--']);
	assert(diff.code === 0, `Second mock bootstrap changed tracked files:\n${outputOf(diff)}`);
	const status = await git(rootDir, ['status', '--porcelain', '--untracked-files=all']);
	assert(status.code === 0, `git status failed:\n${outputOf(status)}`);
	assert(
		status.stdout.trim() === '',
		`Second mock bootstrap left worktree changes:\n${status.stdout}`
	);
}

async function assertHalfDoneFixtureConverges(): Promise<void> {
	const rootDir = await prepareFixture('half-done');
	const before = treeSnapshot(rootDir);
	const result = await runBootstrap(rootDir, ['--ci']);
	assert(result.code === 0, `Half-done fixture did not converge:\n${outputOf(result)}`);
	const mutations = changedFiles(before, treeSnapshot(rootDir));
	assertOnlyProtectedFilesChanged(mutations);
	assert(
		JSON.stringify(mutations) === JSON.stringify(['.bootstrap.state.json', '.env']),
		`Half-done fixture should only create .env and state; got:\n${mutations.join('\n')}`
	);
	const env = assertEnvShape(rootDir);
	assertStateShape(rootDir);
	assertNoSecretLeak(result, env);
}

async function assertAlreadyBootstrappedFixtureNoops(): Promise<void> {
	const rootDir = await prepareFixture('already-bootstrapped');
	const before = treeSnapshot(rootDir);
	const result = await runBootstrap(rootDir, ['--ci']);
	assert(result.code === 0, `Already-bootstrapped fixture failed:\n${outputOf(result)}`);
	assert(
		changedFiles(before, treeSnapshot(rootDir)).length === 0,
		'Already-bootstrapped fixture should not mutate files.'
	);
	assertNoSecretLeak(result, assertEnvShape(rootDir));
}

async function runDryRunMode(): Promise<void> {
	process.stdout.write('RUN dry-run mode\n');
	const rootDir = await prepareFixture('fresh-template');
	const before = treeSnapshot(rootDir);
	const result = await runBootstrap(rootDir, ['--dry-run', '--ci']);
	const output = outputOf(result);

	assert(result.code === 0, `Dry-run bootstrap failed:\n${output}`);
	assert(
		changedFiles(before, treeSnapshot(rootDir)).length === 0,
		'Dry-run mutated fixture files.'
	);
	for (const expected of [
		'DRY-RUN WOULD run: bun run init:site',
		'DRY-RUN WOULD add 4 missing local .env keys',
		'DRY-RUN WOULD provision local project Postgres with Podman',
		'DRY-RUN WOULD run: bun run db:migrate',
		'DRY-RUN WOULD run: bun run check:db',
	]) {
		assertIncludes(output, expected, 'Dry-run bootstrap');
	}

	process.stdout.write('OK  dry-run mode\n');
}

async function runMockMode(): Promise<void> {
	process.stdout.write('RUN mock-provisioner mode\n');
	const rootDir = await prepareFixture('fresh-template');
	const before = treeSnapshot(rootDir);
	const first = await runBootstrap(rootDir, ['--ci']);
	const firstOutput = outputOf(first);

	assert(first.code === 0, `Mock bootstrap first run failed:\n${firstOutput}`);
	for (const expected of [
		'MOCK provision local Postgres',
		'MOCK bun run db:migrate',
		'MOCK bun run check:db',
	]) {
		assertIncludes(firstOutput, expected, 'Mock bootstrap');
	}

	const env = assertEnvShape(rootDir);
	const firstState = assertStateShape(rootDir);
	assertNoSecretLeak(first, env);
	const mutations = changedFiles(before, treeSnapshot(rootDir));
	assertOnlyProtectedFilesChanged(mutations);
	assert(mutations.includes('.env'), 'Mock mutation set did not include .env.');
	assert(
		mutations.includes('.bootstrap.state.json'),
		'Mock mutation set did not include .bootstrap.state.json.'
	);

	await snapshotPostFirstRun(rootDir);
	const second = await runBootstrap(rootDir, ['--ci']);
	assert(second.code === 0, `Mock bootstrap second run failed:\n${outputOf(second)}`);
	assert(
		readFileSync(join(rootDir, '.bootstrap.state.json'), 'utf8') === firstState,
		'State file changed on second mock run.'
	);
	assertNoSecretLeak(second, env);
	await assertGitDiffEmpty(rootDir);

	await assertHalfDoneFixtureConverges();
	await assertAlreadyBootstrappedFixtureNoops();

	process.stdout.write('OK  mock-provisioner mode\n');
}

async function runFailureModes(): Promise<void> {
	process.stdout.write('RUN failure-mode coverage\n');
	process.stdout.write('SKIP BOOT-BUN-001 requires shell-level command -v bun mocking.\n');

	for (const testCase of FAILURE_CASES) {
		const rootDir = await prepareFixture(testCase.fixture);
		testCase.mutate?.(rootDir);
		const result = await runBootstrap(rootDir, ['--ci'], testCase.env);
		const output = outputOf(result);
		assert(result.code !== 0, `${testCase.code} fixture unexpectedly exited 0.`);
		assertIncludes(output, testCase.code, `${testCase.code} failure`);
		assertIncludes(output, 'NEXT:', `${testCase.code} failure`);
		process.stdout.write(`OK  ${testCase.code}\n`);
	}

	process.stdout.write('OK  failure-mode coverage\n');
}

function cleanupTempDirs(): void {
	if (tempDirsCleaned) return;
	tempDirsCleaned = true;

	if (process.env.BOOTSTRAP_KEEP_TEMP === '1') {
		process.stdout.write(`Keeping ${tempDirs.length} temp dirs because BOOTSTRAP_KEEP_TEMP=1.\n`);
		return;
	}

	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
}

function sourcePackageName(): string | null {
	try {
		const raw = readFileSync(join(ROOT_DIR, 'package.json'), 'utf8');
		const parsed = JSON.parse(raw) as { name?: unknown };
		return typeof parsed.name === 'string' ? parsed.name : null;
	} catch {
		return null;
	}
}

async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
	const selection = parseArgs(argv);
	const pkgName = sourcePackageName();
	if (pkgName !== TEMPLATE_PACKAGE_NAME) {
		process.stdout.write(
			`SKIP check:bootstrap — source package.json name is "${pkgName ?? '<unreadable>'}", not "${TEMPLATE_PACKAGE_NAME}".\n` +
				'check:bootstrap is a template self-test; it only runs against an unmodified template repo.\n'
		);
		return 0;
	}
	try {
		if (selection.dryRun) await runDryRunMode();
		if (selection.mock) await runMockMode();
		if (selection.failures) await runFailureModes();
		process.stdout.write('\ncheck:bootstrap passed.\n');
		return 0;
	} finally {
		cleanupTempDirs();
	}
}

try {
	process.exit(await main());
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`\ncheck:bootstrap FAILED\n${message}\n`);
	cleanupTempDirs();
	process.exit(1);
}
