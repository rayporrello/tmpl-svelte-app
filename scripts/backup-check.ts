#!/usr/bin/env bun
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { readEnv } from './lib/env-file';
import {
	allocatePostgresPort,
	postgresIdentifiers,
	POSTGRES_IMAGE,
	sanitizeProjectSlug,
} from './lib/postgres-dev';
import { detectContainerRuntime, type ContainerRuntime } from './lib/preflight';
import { run as defaultRunner, type RunResult } from './lib/run';

export type BackupCheckStatus = 'pass' | 'fail';

export type BackupCheckResult = {
	status: BackupCheckStatus;
	detail: string;
};

export type BackupCheckOptions = {
	rootDir?: string;
	env?: NodeJS.ProcessEnv;
	runner?: (
		command: string,
		args?: readonly string[],
		options?: { cwd?: string; capture?: boolean; env?: NodeJS.ProcessEnv }
	) => Promise<RunResult>;
	rowCounter?: (databaseUrl: string) => Promise<number>;
	runtime?: ContainerRuntime | null;
	verifyPort?: number;
	readinessTimeoutMs?: number;
	readinessIntervalMs?: number;
	now?: () => number;
	stdout?: Pick<NodeJS.WriteStream, 'write'>;
	stderr?: Pick<NodeJS.WriteStream, 'write'>;
};

const ROOT_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));
const VERIFY_USER = 'backup_verify';
const VERIFY_PASSWORD = 'backup_verify_password';
const VERIFY_DB = 'backup_verify';

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

function databaseUrlFrom(rootDir: string, env: NodeJS.ProcessEnv): string | null {
	if (env.DATABASE_URL?.trim()) return env.DATABASE_URL.trim();
	const envPath = join(rootDir, '.env');
	if (!existsSync(envPath)) return null;
	return readEnv(envPath).DATABASE_URL?.trim() || null;
}

async function defaultRowCounter(databaseUrl: string): Promise<number> {
	const client = postgres(databaseUrl, { max: 1, idle_timeout: 1, connect_timeout: 5 });
	try {
		const rows = (await client`
			SELECT COUNT(*)::int AS count
			FROM contact_submissions
		`) as Array<{ count: number }>;
		return Number(rows[0]?.count ?? 0);
	} finally {
		await client.end({ timeout: 1 });
	}
}

function buildVerifyUrl(port: number): string {
	return `postgres://${VERIFY_USER}:${VERIFY_PASSWORD}@127.0.0.1:${port}/${VERIFY_DB}`;
}

function commandFailed(command: string, result: RunResult): BackupCheckResult | null {
	if (result.code === 0) return null;
	const output = `${result.stderr}${result.stdout}`.trim();
	return {
		status: 'fail',
		detail: `${command} failed${output ? `: ${output}` : ''}`,
	};
}

async function waitForReadiness({
	runtime,
	container,
	runner,
	timeoutMs,
	intervalMs,
}: {
	runtime: ContainerRuntime;
	container: string;
	runner: NonNullable<BackupCheckOptions['runner']>;
	timeoutMs: number;
	intervalMs: number;
}): Promise<BackupCheckResult | null> {
	const deadline = Date.now() + timeoutMs;
	let lastOutput = '';
	while (Date.now() <= deadline) {
		const result = await runner(
			runtime,
			['exec', container, 'pg_isready', '-U', VERIFY_USER, '-d', VERIFY_DB],
			{ capture: true }
		);
		if (result.code === 0) return null;
		lastOutput = `${result.stderr}${result.stdout}`.trim();
		await delay(intervalMs);
	}
	return {
		status: 'fail',
		detail: `verification Postgres did not become ready${lastOutput ? `: ${lastOutput}` : ''}`,
	};
}

export async function runBackupCheck(options: BackupCheckOptions = {}): Promise<BackupCheckResult> {
	const rootDir = options.rootDir ?? process.cwd();
	const env = options.env ?? process.env;
	const runner = options.runner ?? defaultRunner;
	const rowCounter = options.rowCounter ?? defaultRowCounter;
	const databaseUrl = databaseUrlFrom(rootDir, env);
	if (!databaseUrl) {
		return {
			status: 'fail',
			detail:
				'DATABASE_URL is missing. NEXT: Run ./bootstrap or set DATABASE_URL before backup:check.',
		};
	}

	const runtime =
		options.runtime === undefined ? await detectContainerRuntime({ env }) : options.runtime;
	if (!runtime) {
		return {
			status: 'fail',
			detail:
				'No Podman or Docker runtime detected. NEXT: Install Podman/Docker to run the restore verification database.',
		};
	}

	const slug = sanitizeProjectSlug(readPackageName(rootDir));
	const container = `${postgresIdentifiers(slug).container}-backup-check-${process.pid}-${options.now?.() ?? Date.now()}`;
	const tempDir = mkdtempSync(join(tmpdir(), 'backup-check-'));
	const dumpPath = join(tempDir, 'backup.dump');
	const verifyPort = options.verifyPort ?? (await allocatePostgresPort(`${slug}-backup-check`));
	const verifyUrl = buildVerifyUrl(verifyPort);

	try {
		const sourceCount = await rowCounter(databaseUrl);
		const dump = await runner(
			'pg_dump',
			['--format=custom', '--file', dumpPath, '--dbname', databaseUrl],
			{
				cwd: rootDir,
				capture: true,
				env,
			}
		);
		const dumpFailure = commandFailed('pg_dump', dump);
		if (dumpFailure) return dumpFailure;

		const pull = await runner(runtime, ['pull', POSTGRES_IMAGE], { capture: true });
		const pullFailure = commandFailed(`${runtime} pull`, pull);
		if (pullFailure) return pullFailure;

		const start = await runner(
			runtime,
			[
				'run',
				'-d',
				'--name',
				container,
				'--label',
				'tmpl-svelte-app.backup-check=true',
				'-p',
				`127.0.0.1:${verifyPort}:5432`,
				'-e',
				`POSTGRES_DB=${VERIFY_DB}`,
				'-e',
				`POSTGRES_USER=${VERIFY_USER}`,
				'-e',
				`POSTGRES_PASSWORD=${VERIFY_PASSWORD}`,
				POSTGRES_IMAGE,
			],
			{ capture: true }
		);
		const startFailure = commandFailed(`${runtime} run`, start);
		if (startFailure) return startFailure;

		const readinessFailure = await waitForReadiness({
			runtime,
			container,
			runner,
			timeoutMs: options.readinessTimeoutMs ?? 30_000,
			intervalMs: options.readinessIntervalMs ?? 500,
		});
		if (readinessFailure) return readinessFailure;

		const restore = await runner(
			'pg_restore',
			['--clean', '--if-exists', '--no-owner', '--dbname', verifyUrl, dumpPath],
			{
				cwd: rootDir,
				capture: true,
				env,
			}
		);
		const restoreFailure = commandFailed('pg_restore', restore);
		if (restoreFailure) return restoreFailure;

		const verifyCount = await rowCounter(verifyUrl);
		if (verifyCount !== sourceCount) {
			return {
				status: 'fail',
				detail: `contact_submissions count mismatch after restore: source=${sourceCount}, verification=${verifyCount}`,
			};
		}

		return {
			status: 'pass',
			detail: `Backup round-trip verified. contact_submissions rows: ${sourceCount}.`,
		};
	} finally {
		await runner(runtime, ['rm', '-f', container], { capture: true }).catch(() => undefined);
		rmSync(tempDir, { recursive: true, force: true });
	}
}

export async function main(options: BackupCheckOptions = {}): Promise<number> {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	const result = await runBackupCheck({ ...options, rootDir: options.rootDir ?? ROOT_DIR });
	if (result.status === 'pass') {
		stdout.write(`OK   ${result.detail}\n`);
		return 0;
	}
	stderr.write(`FAIL backup:check ${result.detail}\n`);
	if (!result.detail.includes('NEXT:')) {
		stderr.write('NEXT: Fix the backup/restore error above and re-run bun run backup:check.\n');
	}
	return 1;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
	process.exit(await main());
}
