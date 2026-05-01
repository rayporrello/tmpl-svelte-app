/**
 * Phase 2 documented seam: this is the only script-side entry point allowed
 * to import from src/ for DB health verification.
 * See docs/planning/13-bootstrap-contract-project.md §6 Phase 2.
 */
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

import postgres from 'postgres';

import { diagnosePostgresError } from './lib/diagnose-pg';
import type { PostgresDiagnosis } from './lib/diagnose-pg';
import { BootstrapScriptError, getErrorMessage, type ErrorCode } from './lib/errors';
import { readEnv } from './lib/env-file';
import type { PrintStream } from './lib/print';
import { redactSecrets } from './lib/run';

type CheckDbHealthOptions = {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	stdout?: PrintStream;
	stderr?: PrintStream;
};

type DatabaseTarget = {
	url: string;
	host: string;
	port: string;
	database: string;
};

type FailureDiagnosis = {
	diagnosis: PostgresDiagnosis;
	detail: unknown;
};

function normalizeNextLine(hint: string): string {
	return hint.startsWith('NEXT') ? hint : `NEXT: ${hint}`;
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

function writeFailure(error: unknown, code: ErrorCode, hint: string, stream: PrintStream): void {
	stream.write(`FAIL ${code} ${getErrorMessage(code)}\n`);
	stream.write(`     detail: ${redactSecrets(errorMessage(error))}\n`);
	stream.write(`${normalizeNextLine(hint)}\n`);
}

function writeSuccess(result: DatabaseTarget, latencyMs: number, stream: PrintStream): void {
	stream.write('OK   Database connectivity verified\n');
	stream.write(`     host: ${result.host}:${result.port}\n`);
	stream.write(`     db:   ${result.database}\n`);
	stream.write(`     latency: ${Math.max(0, Math.round(latencyMs))}ms\n`);
}

function parseDatabaseUrl(value: string): DatabaseTarget {
	try {
		const parsed = new URL(value);
		const database = decodeURIComponent(parsed.pathname.replace(/^\/+/u, ''));

		if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !database) {
			throw new Error('DATABASE_URL must use postgres://user:pw@host:port/db');
		}

		return {
			url: value,
			host: parsed.hostname,
			port: parsed.port || '5432',
			database,
		};
	} catch {
		throw new BootstrapScriptError(
			'BOOT-DB-001',
			'DATABASE_URL could not be parsed',
			'NEXT: Check DATABASE_URL in .env. Format: postgres://user:pw@host:port/db'
		);
	}
}

function readDatabaseTarget(options: CheckDbHealthOptions): DatabaseTarget {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const existing = env.DATABASE_URL?.trim();

	if (existing) return parseDatabaseUrl(existing);

	const fileEnv = readEnv(join(cwd, '.env'));
	const fromFile = fileEnv.DATABASE_URL?.trim();

	if (!fromFile) {
		throw new BootstrapScriptError(
			'BOOT-DB-001',
			'DATABASE_URL is missing',
			'NEXT: Set DATABASE_URL in .env. Run ./bootstrap to generate one.'
		);
	}

	return parseDatabaseUrl(fromFile);
}

async function loadDbHealthProbe() {
	const [{ checkDbHealth }, { db }] = await Promise.all([
		import('../src/lib/server/db/health'),
		import('../src/lib/server/db/index'),
	]);

	return { checkDbHealth, db };
}

async function diagnoseHealthFailure(
	error: unknown,
	target: DatabaseTarget
): Promise<FailureDiagnosis> {
	const initial = diagnosePostgresError(error);
	if (initial.code !== 'BOOT-DB-001' || !/^Failed query:/iu.test(errorMessage(error))) {
		return { diagnosis: initial, detail: error };
	}

	let client: ReturnType<typeof postgres> | undefined;

	try {
		client = postgres(target.url, {
			max: 1,
			idle_timeout: 1,
			connect_timeout: 2,
		});
		await client`SELECT 1`;
		return { diagnosis: initial, detail: error };
	} catch (diagnosticError) {
		return {
			diagnosis: diagnosePostgresError(diagnosticError),
			detail: diagnosticError,
		};
	} finally {
		await client?.end({ timeout: 1 }).catch(() => undefined);
	}
}

export async function main(options: CheckDbHealthOptions = {}): Promise<number> {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	const previousDatabaseUrl = process.env.DATABASE_URL;

	try {
		const target = readDatabaseTarget(options);
		process.env.DATABASE_URL = target.url;

		const { checkDbHealth, db } = await loadDbHealthProbe();
		const result = await checkDbHealth(db);

		if (result.ok) {
			writeSuccess(target, result.latencyMs ?? 0, stdout);
			return 0;
		}

		const error = new Error(result.error ?? 'Database health check failed');
		const { diagnosis, detail } = await diagnoseHealthFailure(error, target);
		writeFailure(detail, diagnosis.code, diagnosis.hint, stderr);
		return 1;
	} catch (error) {
		if (error instanceof BootstrapScriptError) {
			writeFailure(error, error.code, error.hint, stderr);
			return 1;
		}

		const diagnosis = diagnosePostgresError(error);
		writeFailure(error, diagnosis.code, diagnosis.hint, stderr);
		return 1;
	} finally {
		if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
		else process.env.DATABASE_URL = previousDatabaseUrl;
	}
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
	process.exit(await main());
}
