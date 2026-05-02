#!/usr/bin/env bun
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
	type Dirent,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type BootErrorCode } from './lib/errors';
import { parseEnv } from './lib/env-file';
import { detectContainerRuntime, type ContainerRuntime } from './lib/preflight';
import { postgresIdentifiers, sanitizeProjectSlug } from './lib/postgres-dev';
import { redactSecrets, run, type RunResult } from './lib/run';

type CliOptions = {
	keep: boolean;
};

type Labels = Record<string, string>;

type SmokeState = {
	runtime: ContainerRuntime | null;
	tempDir: string | null;
	container: string;
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const FIXTURE_DIR = join(ROOT_DIR, 'tests/fixtures/bootstrap/fresh-template');
const TEMP_PREFIX = 'check-bootstrap-podman-';
const SMOKE_SLUG = 'tmpl-bootstrap-smoke';
const SMOKE_SITE_NAME = 'Bootstrap Smoke';
const SMOKE_CONTAINER = postgresIdentifiers(SMOKE_SLUG).container;
const REQUIRED_TABLES = [
	'automation_dead_letters',
	'automation_events',
	'contact_submissions',
] as const;

const BOOTSTRAP_ANSWERS = {
	BOOTSTRAP_PACKAGE_NAME: SMOKE_SLUG,
	BOOTSTRAP_SITE_NAME: SMOKE_SITE_NAME,
	BOOTSTRAP_PRODUCTION_URL: 'https://bootstrap-smoke.example',
	BOOTSTRAP_META_DESCRIPTION: 'Bootstrap smoke test site.',
	BOOTSTRAP_GITHUB_OWNER: 'example-owner',
	BOOTSTRAP_GITHUB_REPO: SMOKE_SLUG,
	BOOTSTRAP_SUPPORT_EMAIL: 'support@bootstrap-smoke.example',
	BOOTSTRAP_PROJECT_SLUG: SMOKE_SLUG,
	BOOTSTRAP_PRODUCTION_DOMAIN: 'bootstrap-smoke.example',
	BOOTSTRAP_PWA_SHORT_NAME: 'Smoke',
} as const;

const COPY_PATHS = [
	'.env.example',
	'.gitignore',
	'bootstrap',
	'bun.lock',
	'content',
	'deploy',
	'drizzle',
	'drizzle.config.ts',
	'package.json',
	'README.md',
	'scripts',
	'src',
	'static',
	'svelte.config.js',
	'tsconfig.json',
	'vite.config.ts',
] as const;

const state: SmokeState = {
	runtime: null,
	tempDir: null,
	container: SMOKE_CONTAINER,
};

class CheckBootstrapPodmanError extends Error {
	code: BootErrorCode;
	hint: string;

	constructor(code: BootErrorCode, message: string, hint: string) {
		super(message);
		this.name = 'CheckBootstrapPodmanError';
		this.code = code;
		this.hint = hint;
	}
}

function outputOf(result: RunResult): string {
	return `${result.stdout}${result.stderr}`;
}

function fail(code: BootErrorCode, message: string, hint: string): never {
	throw new CheckBootstrapPodmanError(code, message, hint);
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) {
		fail('BOOT-INIT-001', message, 'NEXT: Inspect the check:bootstrap:podman output above.');
	}
}

function parseArgs(argv: readonly string[]): CliOptions {
	if (argv.includes('--help') || argv.includes('-h')) {
		process.stdout.write(
			'Usage: bun run check:bootstrap:podman [--keep]\n\n' +
				'Requires BOOTSTRAP_PODMAN=1. Uses Podman when available, then Docker.\n' +
				'--keep preserves the smoke container and tempdir for inspection.\n'
		);
		process.exit(0);
	}

	const unknown = argv.filter((arg) => arg !== '--keep');
	if (unknown.length) {
		fail(
			'BOOT-INIT-001',
			`Unknown check:bootstrap:podman option: ${unknown.join(', ')}`,
			'NEXT: Use bun run check:bootstrap:podman [--keep].'
		);
	}

	return { keep: argv.includes('--keep') };
}

async function commandWorks(command: string): Promise<boolean> {
	const result = await run(command, ['--version'], { capture: true });
	return result.code === 0;
}

async function selectRuntime(): Promise<ContainerRuntime> {
	if (process.env.BOOTSTRAP_PODMAN !== '1') {
		fail(
			'BOOT-PG-001',
			'check:bootstrap:podman is gated behind BOOTSTRAP_PODMAN=1.',
			'NEXT: Run via `bun run check:bootstrap:podman` or set BOOTSTRAP_PODMAN=1 explicitly.'
		);
	}

	const requested = process.env.BOOTSTRAP_CONTAINER_RUNTIME?.trim();
	if (requested === 'podman' || requested === 'docker') {
		if (await commandWorks(requested)) return requested;
		fail(
			'BOOT-PG-001',
			`Requested container runtime ${requested} is not available.`,
			'NEXT: Install the requested runtime, set BOOTSTRAP_CONTAINER_RUNTIME=auto, or use the available runtime.'
		);
	}

	if (requested && requested !== 'auto') {
		fail(
			'BOOT-PG-001',
			`Unsupported BOOTSTRAP_CONTAINER_RUNTIME value: ${requested}`,
			'NEXT: Use BOOTSTRAP_CONTAINER_RUNTIME=auto, podman, or docker.'
		);
	}

	const runtime = await detectContainerRuntime({
		env: { ...process.env, BOOTSTRAP_CONTAINER_RUNTIME: 'auto' },
	});
	if (runtime) return runtime;

	fail(
		'BOOT-PG-001',
		'No Podman or Docker runtime detected.',
		'NEXT: Install Podman or Docker before running the real bootstrap smoke.'
	);
}

async function inspectLabels(runtime: ContainerRuntime, container: string): Promise<Labels | null> {
	const result = await run(runtime, ['inspect', container, '--format', '{{json .Config.Labels}}'], {
		capture: true,
	});
	if (result.code !== 0) return null;
	try {
		return JSON.parse(result.stdout.trim()) as Labels;
	} catch {
		return null;
	}
}

function hasSmokeLabels(labels: Labels | null): boolean {
	if (!labels) return false;
	return (
		labels['tmpl-svelte-app.bootstrap'] === 'true' &&
		labels['tmpl-svelte-app.project-slug'] === sanitizeProjectSlug(SMOKE_SLUG) &&
		labels['tmpl-svelte-app.contract-version'] === '1'
	);
}

async function assertSmokeLabels(runtime: ContainerRuntime): Promise<void> {
	const labels = await inspectLabels(runtime, SMOKE_CONTAINER);
	if (!hasSmokeLabels(labels)) {
		fail(
			'BOOT-PG-002',
			`Container ${SMOKE_CONTAINER} is missing required bootstrap labels.`,
			'NEXT: Inspect the container labels and scripts/lib/postgres-dev.ts.'
		);
	}
}

async function removeSmokeContainer(runtime: ContainerRuntime): Promise<void> {
	const labels = await inspectLabels(runtime, SMOKE_CONTAINER);
	if (!labels) return;

	if (!hasSmokeLabels(labels)) {
		fail(
			'BOOT-PG-002',
			`Refusing to remove ${SMOKE_CONTAINER}; labels do not match this smoke test.`,
			'NEXT: Remove or rename the non-bootstrap container manually before retrying.'
		);
	}

	const result = await run(runtime, ['rm', '-f', SMOKE_CONTAINER], { capture: true });
	if (result.code !== 0) {
		fail(
			'BOOT-PG-002',
			`Failed to remove smoke container ${SMOKE_CONTAINER}.\n${outputOf(result)}`,
			'NEXT: Inspect the container runtime output and remove the labeled smoke container.'
		);
	}
}

function copyRepoPath(rootDir: string, path: string): void {
	const source = join(ROOT_DIR, path);
	const destination = join(rootDir, path);
	assert(existsSync(source), `Missing template source path: ${path}`);
	mkdirSync(dirname(destination), { recursive: true });
	cpSync(source, destination, { recursive: true, force: true, verbatimSymlinks: true });
}

function copyFixtureOverrides(rootDir: string): void {
	if (!existsSync(FIXTURE_DIR)) {
		fail(
			'BOOT-INIT-001',
			`Missing fresh-template fixture directory: ${FIXTURE_DIR}`,
			'NEXT: Restore tests/fixtures/bootstrap/fresh-template before retrying.'
		);
	}

	for (const entry of readdirSync(FIXTURE_DIR, { withFileTypes: true })) {
		if (entry.name === 'fixture.json') continue;
		const source = join(FIXTURE_DIR, entry.name);
		const destination = join(rootDir, entry.name);
		mkdirSync(dirname(destination), { recursive: true });
		cpSync(source, destination, { recursive: true, force: true, verbatimSymlinks: true });
	}
}

function symlinkNodeModules(rootDir: string): void {
	const source = join(ROOT_DIR, 'node_modules');
	assert(
		existsSync(source),
		'node_modules is missing; run bun install before check:bootstrap:podman.'
	);
	symlinkSync(source, join(rootDir, 'node_modules'), 'dir');
}

function prepareFreshTemplate(): string {
	const tempDir = mkdtempSync(join(tmpdir(), TEMP_PREFIX));
	state.tempDir = tempDir;

	for (const path of COPY_PATHS) copyRepoPath(tempDir, path);
	copyFixtureOverrides(tempDir);
	symlinkNodeModules(tempDir);
	return tempDir;
}

function bootstrapEnv(runtime: ContainerRuntime): NodeJS.ProcessEnv {
	const env = {
		...process.env,
		...BOOTSTRAP_ANSWERS,
		BOOTSTRAP_CONTAINER_RUNTIME: runtime,
	};
	delete env.BOOTSTRAP_PROVISIONER;
	delete env.BOOTSTRAP_MOCK_FAILURE;
	delete env.BOOTSTRAP_TEST_GUARD_WRITE;
	delete env.DATABASE_URL;
	return env;
}

async function runBootstrap(rootDir: string, runtime: ContainerRuntime): Promise<RunResult> {
	return await run('bun', ['scripts/bootstrap.ts', '--ci'], {
		cwd: rootDir,
		env: bootstrapEnv(runtime),
		capture: true,
	});
}

async function assertTables(runtime: ContainerRuntime): Promise<void> {
	const { database, user } = postgresIdentifiers(SMOKE_SLUG);
	const result = await run(
		runtime,
		['exec', SMOKE_CONTAINER, 'psql', '-U', user, '-d', database, '-Atc', '\\dt'],
		{ capture: true }
	);

	if (result.code !== 0) {
		fail(
			'BOOT-DB-001',
			`Could not inspect migrated tables.\n${outputOf(result)}`,
			'NEXT: Inspect Postgres container logs and the drizzle migration output.'
		);
	}

	const missing = REQUIRED_TABLES.filter((table) => !result.stdout.includes(`|${table}|`));
	if (missing.length) {
		fail(
			'BOOT-MIG-001',
			`Missing migrated tables: ${missing.join(', ')}`,
			'NEXT: Inspect drizzle migrations and rerun bun run check:bootstrap:podman.'
		);
	}
}

async function assertCheckDb(rootDir: string): Promise<void> {
	const env = { ...process.env };
	delete env.DATABASE_URL;

	const result = await run('bun', ['run', 'check:db'], {
		cwd: rootDir,
		env,
		capture: true,
	});

	if (result.code !== 0) {
		fail(
			'BOOT-DB-001',
			`Generated .env failed bun run check:db.\n${outputOf(result)}`,
			'NEXT: Inspect the generated .env and database health output.'
		);
	}
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

async function git(rootDir: string, args: readonly string[]): Promise<RunResult> {
	return await run('git', args, { cwd: rootDir, env: { ...process.env }, capture: true });
}

async function snapshotPostFirstRun(rootDir: string): Promise<Map<string, string>> {
	let result = await git(rootDir, ['init', '-q']);
	assert(result.code === 0, `git init failed:\n${outputOf(result)}`);
	result = await git(rootDir, ['add', '-A']);
	assert(result.code === 0, `git add failed:\n${outputOf(result)}`);
	result = await git(rootDir, ['add', '-f', '.env', '.bootstrap.state.json']);
	assert(result.code === 0, `git add ignored bootstrap outputs failed:\n${outputOf(result)}`);
	result = await git(rootDir, [
		'-c',
		'user.name=check-bootstrap-podman',
		'-c',
		'user.email=check-bootstrap-podman@example.invalid',
		'commit',
		'-q',
		'-m',
		'post-first-bootstrap',
	]);
	assert(result.code === 0, `git commit failed:\n${outputOf(result)}`);
	return treeSnapshot(rootDir);
}

async function assertGitDiffEmpty(rootDir: string): Promise<void> {
	const diff = await git(rootDir, ['diff', '--exit-code', '--']);
	assert(diff.code === 0, `Second bootstrap changed tracked files:\n${outputOf(diff)}`);
	const status = await git(rootDir, ['status', '--porcelain', '--untracked-files=all']);
	assert(status.code === 0, `git status failed:\n${outputOf(status)}`);
	assert(status.stdout.trim() === '', `Second bootstrap left worktree changes:\n${status.stdout}`);
}

function assertStateMatchesContainer(rootDir: string): void {
	const statePath = join(rootDir, '.bootstrap.state.json');
	assert(existsSync(statePath), 'Bootstrap did not create .bootstrap.state.json.');
	const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as {
		createdContainer?: string;
		createdContainerPort?: number;
	};
	assert(parsed.createdContainer === SMOKE_CONTAINER, `State should record ${SMOKE_CONTAINER}.`);
	assert(
		typeof parsed.createdContainerPort === 'number' && parsed.createdContainerPort > 0,
		'State should record the allocated Postgres port.'
	);
}

function assertEnvMatchesContainer(rootDir: string): void {
	const envPath = join(rootDir, '.env');
	assert(existsSync(envPath), 'Bootstrap did not create .env.');
	const env = parseEnv(readFileSync(envPath, 'utf8'));
	const databaseUrl = env.DATABASE_URL?.trim();
	assert(databaseUrl, 'Generated .env is missing DATABASE_URL.');
	const parsed = new URL(databaseUrl);
	const { database, user } = postgresIdentifiers(SMOKE_SLUG);
	assert(decodeURIComponent(parsed.username) === user, `DATABASE_URL user should be ${user}.`);
	assert(
		decodeURIComponent(parsed.pathname.replace(/^\/+/u, '')) === database,
		`DATABASE_URL database should be ${database}.`
	);
}

async function runSmoke(options: CliOptions): Promise<void> {
	const runtime = await selectRuntime();
	state.runtime = runtime;
	process.stdout.write(`RUN real bootstrap smoke with ${runtime}\n`);

	await removeSmokeContainer(runtime);
	const tempDir = prepareFreshTemplate();
	process.stdout.write(`RUN temp fixture ${tempDir}\n`);

	const first = await runBootstrap(tempDir, runtime);
	if (first.code !== 0) {
		fail(
			'BOOT-INIT-001',
			`First bootstrap run failed.\n${outputOf(first)}`,
			'NEXT: Inspect the bootstrap output above and rerun bun run check:bootstrap:podman.'
		);
	}

	assertStateMatchesContainer(tempDir);
	assertEnvMatchesContainer(tempDir);
	await assertSmokeLabels(runtime);
	await assertTables(runtime);
	await assertCheckDb(tempDir);
	const firstSnapshot = await snapshotPostFirstRun(tempDir);

	const second = await runBootstrap(tempDir, runtime);
	if (second.code !== 0) {
		fail(
			'BOOT-INIT-001',
			`Second bootstrap run failed.\n${outputOf(second)}`,
			'NEXT: Inspect the bootstrap output above; idempotency must exit 0.'
		);
	}

	assert(
		JSON.stringify([...firstSnapshot]) === JSON.stringify([...treeSnapshot(tempDir)]),
		'Second bootstrap changed the fixture tree.'
	);
	await assertGitDiffEmpty(tempDir);

	if (options.keep) {
		process.stdout.write(`KEEP container ${SMOKE_CONTAINER}\n`);
		process.stdout.write(`KEEP tempdir ${tempDir}\n`);
	}
}

function cleanupTempDir(): void {
	if (!state.tempDir) return;
	rmSync(state.tempDir, { recursive: true, force: true });
	state.tempDir = null;
}

async function cleanup(options: CliOptions): Promise<void> {
	if (options.keep) return;
	if (state.runtime) await removeSmokeContainer(state.runtime);
	cleanupTempDir();
}

async function cleanupError(options: CliOptions): Promise<unknown | null> {
	try {
		await cleanup(options);
		return null;
	} catch (error) {
		return error;
	}
}

async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
	const options = parseArgs(argv);
	let bodyError: unknown = null;

	try {
		await runSmoke(options);
	} catch (error) {
		bodyError = error;
	}

	const cleanupFailure = await cleanupError(options);
	if (cleanupFailure) {
		const message =
			cleanupFailure instanceof Error ? cleanupFailure.message : String(cleanupFailure);
		if (bodyError) process.stderr.write(`\nCleanup also failed:\n${redactSecrets(message)}\n`);
		else throw cleanupFailure;
	}

	if (bodyError) throw bodyError;

	process.stdout.write('\ncheck:bootstrap:podman passed.\n');
	return 0;
}

try {
	process.exit(await main());
} catch (error) {
	if (error instanceof CheckBootstrapPodmanError) {
		process.stderr.write(`\nFAIL ${error.code} ${redactSecrets(error.message)}\n${error.hint}\n`);
	} else {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(
			`\nFAIL BOOT-INIT-001 ${redactSecrets(message)}\n` +
				'NEXT: Inspect the check:bootstrap:podman output above.\n'
		);
	}
	process.exit(1);
}
