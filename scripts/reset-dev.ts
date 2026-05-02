#!/usr/bin/env bun
import { existsSync, readFileSync, renameSync, rmSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readEnv } from './lib/env-file';
import { postgresIdentifiers, sanitizeProjectSlug } from './lib/postgres-dev';
import { detectContainerRuntime, type ContainerRuntime } from './lib/preflight';
import { run as defaultRunner, type RunResult } from './lib/run';

export type ResetDevOptions = {
	rootDir?: string;
	env?: NodeJS.ProcessEnv;
	destroyEnv?: boolean;
	force?: boolean;
	now?: () => number;
	runner?: (
		command: string,
		args?: readonly string[],
		options?: { cwd?: string; capture?: boolean; env?: NodeJS.ProcessEnv }
	) => Promise<RunResult>;
	runtime?: ContainerRuntime | null;
	stdout?: Pick<NodeJS.WriteStream, 'write'>;
	stderr?: Pick<NodeJS.WriteStream, 'write'>;
};

export type ResetDevResult = {
	exitCode: number;
	messages: string[];
};

type BootstrapState = {
	createdContainer: string | null;
	createdContainerPort: number | null;
	bootstrapContractVersion: 1;
};

type ContainerInspection =
	| { exists: false }
	| {
			exists: true;
			owned: boolean;
			labels: Record<string, string>;
	  };

const ROOT_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EXTERNAL_DB_REFUSAL =
	'_DATABASE_URL points to an external Postgres, not the bootstrap-owned container. Refusing to proceed._';

function readPackageName(rootDir: string): string {
	try {
		const parsed = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')) as {
			name?: unknown;
		};
		return typeof parsed.name === 'string' && parsed.name.trim()
			? parsed.name.trim()
			: 'tmpl-svelte-app';
	} catch {
		return 'tmpl-svelte-app';
	}
}

function readState(rootDir: string): BootstrapState | null {
	const path = join(rootDir, '.bootstrap.state.json');
	if (!existsSync(path)) return null;
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<BootstrapState>;
		if (parsed.bootstrapContractVersion !== 1) return null;
		return {
			createdContainer:
				typeof parsed.createdContainer === 'string' ? parsed.createdContainer : null,
			createdContainerPort:
				typeof parsed.createdContainerPort === 'number' ? parsed.createdContainerPort : null,
			bootstrapContractVersion: 1,
		};
	} catch {
		return null;
	}
}

function parseDatabaseUrl(value: string): URL | null {
	try {
		const parsed = new URL(value);
		return ['postgres:', 'postgresql:'].includes(parsed.protocol) ? parsed : null;
	} catch {
		return null;
	}
}

function databaseUrlMatchesState(
	value: string,
	slug: string,
	state: BootstrapState | null
): boolean {
	if (!state?.createdContainer || !state.createdContainerPort) return false;
	const parsed = parseDatabaseUrl(value);
	if (!parsed) return false;
	const ids = postgresIdentifiers(slug);
	return (
		state.createdContainer === ids.container &&
		(parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
		Number.parseInt(parsed.port || '5432', 10) === state.createdContainerPort &&
		decodeURIComponent(parsed.username) === ids.user &&
		decodeURIComponent(parsed.pathname.replace(/^\/+/u, '')) === ids.database
	);
}

function changedPathFromStatus(line: string): string {
	const path = line.slice(3);
	const renameMatch = path.match(/ -> (.+)$/u);
	return renameMatch?.[1] ?? path;
}

function expectedResetPath(path: string): boolean {
	return path === '.env' || path === '.bootstrap.state.json' || /^\.env\.backup\.\d+$/u.test(path);
}

async function unrelatedWorkingTreeChanges(
	rootDir: string,
	runner: NonNullable<ResetDevOptions['runner']>
): Promise<string[]> {
	const result = await runner('git', ['status', '--porcelain'], { cwd: rootDir, capture: true });
	if (result.code !== 0) return [];
	return result.stdout
		.split(/\r?\n/u)
		.map((line) => line.trimEnd())
		.filter(Boolean)
		.map(changedPathFromStatus)
		.filter((path) => !expectedResetPath(path));
}

async function inspectContainer(
	runtime: ContainerRuntime,
	container: string,
	slug: string,
	runner: NonNullable<ResetDevOptions['runner']>
): Promise<ContainerInspection> {
	const result = await runner(
		runtime,
		['inspect', container, '--format', '{{json .Config.Labels}}'],
		{
			capture: true,
		}
	);
	if (result.code !== 0) return { exists: false };
	let labels: Record<string, string>;
	try {
		labels = JSON.parse(result.stdout.trim()) as Record<string, string>;
	} catch {
		labels = {};
	}
	const owned =
		labels['tmpl-svelte-app.bootstrap'] === 'true' &&
		labels['tmpl-svelte-app.project-slug'] === slug &&
		labels['tmpl-svelte-app.contract-version'] === '1';
	return { exists: true, owned, labels };
}

function parseArgs(argv: readonly string[]): Pick<ResetDevOptions, 'destroyEnv' | 'force'> {
	const options = { destroyEnv: false, force: false };
	for (const arg of argv) {
		if (arg === '--destroy-env') options.destroyEnv = true;
		else if (arg === '--force') options.force = true;
		else if (arg === '--help' || arg === '-h') {
			process.stdout.write(
				[
					'Usage: bun run reset:dev [--destroy-env] [--force]',
					'',
					'Tears down bootstrap-owned local resources only.',
					'',
					'Flags:',
					'  --destroy-env   Delete .env instead of moving it to .env.backup.<unix-ts>.',
					'  --force         Ignore unrelated working-tree changes.',
					'',
					'Note: reset:dev does not remove seed:dev rows. Run bun run seed:dev -- --reset before resetting if you seeded demo data.',
					'',
				].join('\n')
			);
			process.exit(0);
		} else {
			throw new Error(`Unknown reset:dev option: ${arg}`);
		}
	}
	return options;
}

export async function runResetDev(options: ResetDevOptions = {}): Promise<ResetDevResult> {
	const rootDir = options.rootDir ?? process.cwd();
	const runner = options.runner ?? defaultRunner;
	const env = options.env ?? process.env;
	const messages: string[] = [];
	const slug = sanitizeProjectSlug(readPackageName(rootDir));
	const state = readState(rootDir);
	const envPath = join(rootDir, '.env');
	const statePath = join(rootDir, '.bootstrap.state.json');

	if (!options.force) {
		const unrelated = await unrelatedWorkingTreeChanges(rootDir, runner);
		if (unrelated.length > 0) {
			return {
				exitCode: 1,
				messages: [
					`Working tree has uncommitted changes outside reset:dev files: ${unrelated.join(', ')}`,
					'NEXT: Commit/stash those changes or re-run with --force.',
				],
			};
		}
	}

	if (existsSync(envPath)) {
		const databaseUrl = readEnv(envPath).DATABASE_URL?.trim();
		if (databaseUrl && !databaseUrlMatchesState(databaseUrl, slug, state)) {
			return {
				exitCode: 1,
				messages: [EXTERNAL_DB_REFUSAL],
			};
		}
	}

	const runtime =
		options.runtime === undefined ? await detectContainerRuntime({ env }) : options.runtime;
	if (state?.createdContainer && runtime) {
		const inspection = await inspectContainer(runtime, state.createdContainer, slug, runner);
		if (inspection.exists && !inspection.owned) {
			return {
				exitCode: 1,
				messages: [
					`Container ${state.createdContainer} exists but does not carry matching bootstrap labels. No files changed.`,
					'NEXT: Inspect the container manually; reset:dev removes only bootstrap-owned containers.',
				],
			};
		}
		if (inspection.exists && inspection.owned) {
			const result = await runner(runtime, ['rm', '-f', state.createdContainer], { capture: true });
			if (result.code !== 0) {
				return {
					exitCode: 1,
					messages: [
						`Failed to remove ${state.createdContainer}: ${
							result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`
						}`,
						'NEXT: Inspect the container runtime output and retry reset:dev.',
					],
				};
			}
			messages.push(`Removed bootstrap-owned container ${state.createdContainer}.`);
		} else {
			messages.push(`No bootstrap-owned container named ${state.createdContainer} was found.`);
		}
	} else if (state?.createdContainer) {
		messages.push('No container runtime detected; skipped container removal.');
	}

	if (existsSync(envPath)) {
		if (options.destroyEnv) {
			unlinkSync(envPath);
			messages.push('Deleted .env.');
		} else {
			const backupPath = join(
				rootDir,
				`.env.backup.${Math.floor((options.now?.() ?? Date.now()) / 1000)}`
			);
			renameSync(envPath, backupPath);
			messages.push(`Moved .env to ${backupPath.replace(`${rootDir}/`, '')}.`);
		}
	}

	if (existsSync(statePath)) {
		rmSync(statePath, { force: true });
		messages.push('Removed .bootstrap.state.json.');
	}

	if (messages.length === 0) messages.push('No bootstrap-owned dev resources found.');
	return { exitCode: 0, messages };
}

export async function main(
	argv: readonly string[] = process.argv.slice(2),
	options: ResetDevOptions = {}
): Promise<number> {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	try {
		const parsed = parseArgs(argv);
		const result = await runResetDev({
			...options,
			...parsed,
			rootDir: options.rootDir ?? ROOT_DIR,
		});
		const output = result.messages.join('\n') + '\n';
		if (result.exitCode === 0) stdout.write(output);
		else stderr.write(output);
		return result.exitCode;
	} catch (error) {
		stderr.write(`FAIL reset:dev ${error instanceof Error ? error.message : String(error)}\n`);
		stderr.write('NEXT: Use bun run reset:dev -- --help for supported flags.\n');
		return 1;
	}
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
	process.exit(await main());
}
