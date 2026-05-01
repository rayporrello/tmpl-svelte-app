import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = { execute: vi.fn() };
let tempDirs: string[] = [];
let originalDatabaseUrl: string | undefined;

function memoryStream() {
	let output = '';
	return {
		stream: { write: (chunk: string) => (output += chunk) },
		get output() {
			return output;
		},
	};
}

function tempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), 'check-db-health-'));
	tempDirs.push(dir);
	return dir;
}

async function loadScript(checkDbHealth: ReturnType<typeof vi.fn>) {
	vi.resetModules();
	vi.doMock('../../src/lib/server/db/health', () => ({ checkDbHealth }));
	vi.doMock('../../src/lib/server/db/index', () => ({ db: mockDb }));

	return import('../../scripts/check-db-health');
}

describe('check-db-health script', () => {
	beforeEach(() => {
		originalDatabaseUrl = process.env.DATABASE_URL;
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.doUnmock('../../src/lib/server/db/health');
		vi.doUnmock('../../src/lib/server/db/index');

		for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
		tempDirs = [];

		if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
		else process.env.DATABASE_URL = originalDatabaseUrl;
	});

	it('reads DATABASE_URL from .env when process env is missing and prints success', async () => {
		delete process.env.DATABASE_URL;

		const dir = tempDir();
		writeFileSync(
			join(dir, '.env'),
			'DATABASE_URL=postgres://tmpl:super-secret@127.0.0.1:5432/tmpl_app\n'
		);

		const checkDbHealth = vi.fn().mockResolvedValue({ ok: true, latencyMs: 12.4 });
		const { main } = await loadScript(checkDbHealth);
		const stdout = memoryStream();
		const stderr = memoryStream();

		const code = await main({ cwd: dir, env: {}, stdout: stdout.stream, stderr: stderr.stream });

		expect(code).toBe(0);
		expect(checkDbHealth).toHaveBeenCalledWith(mockDb);
		expect(stdout.output).toBe(
			'OK   Database connectivity verified\n' +
				'     host: 127.0.0.1:5432\n' +
				'     db:   tmpl_app\n' +
				'     latency: 12ms\n'
		);
		expect(stderr.output).toBe('');
		expect(stdout.output).not.toContain('super-secret');
	});

	it('fails with BOOT-DB-001 when DATABASE_URL is missing', async () => {
		const checkDbHealth = vi.fn();
		const { main } = await loadScript(checkDbHealth);
		const stdout = memoryStream();
		const stderr = memoryStream();

		const code = await main({
			cwd: tempDir(),
			env: {},
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(code).toBe(1);
		expect(checkDbHealth).not.toHaveBeenCalled();
		expect(stdout.output).toBe('');
		expect(stderr.output).toContain('FAIL BOOT-DB-001 DATABASE_URL parse failed');
		expect(stderr.output).toContain('detail: DATABASE_URL is missing');
		expect(stderr.output).toContain(
			'NEXT: Set DATABASE_URL in .env. Run ./bootstrap to generate one.'
		);
	});

	it('fails with BOOT-DB-001 when DATABASE_URL cannot be parsed', async () => {
		const checkDbHealth = vi.fn();
		const { main } = await loadScript(checkDbHealth);
		const stdout = memoryStream();
		const stderr = memoryStream();

		const code = await main({
			env: { DATABASE_URL: 'postgres://tmpl:super-secret@' },
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(code).toBe(1);
		expect(checkDbHealth).not.toHaveBeenCalled();
		expect(stderr.output).toContain('FAIL BOOT-DB-001 DATABASE_URL parse failed');
		expect(stderr.output).toContain(
			'NEXT: Check DATABASE_URL in .env. Format: postgres://user:pw@host:port/db'
		);
		expect(stderr.output).not.toContain('super-secret');
	});

	it.each([
		{
			name: 'auth failure',
			message: '28P01 password authentication failed for user "tmpl"',
			code: 'BOOT-DB-002',
			next: 'NEXT: Verify the password in DATABASE_URL matches the database user.',
		},
		{
			name: 'missing database',
			message: '3D000 database "tmpl_missing" does not exist',
			code: 'BOOT-DB-003',
			next: 'NEXT: Create the database, or re-run ./bootstrap to provision a local one.',
		},
		{
			name: 'permission denied',
			message: '42501 permission denied for schema public',
			code: 'BOOT-DB-004',
			next: 'NEXT: Grant the user privileges on schema public: GRANT ALL ON SCHEMA public TO <user>;',
		},
		{
			name: 'connection refused',
			message: 'connect ECONNREFUSED 127.0.0.1:1',
			code: 'BOOT-PG-001',
			next: 'NEXT: Start Postgres, or re-run ./bootstrap to provision a local container.',
		},
	])('maps $name through diagnose-pg with a NEXT line', async ({ message, code, next }) => {
		const checkDbHealth = vi.fn().mockResolvedValue({
			ok: false,
			error: `${message} postgres://tmpl:super-secret@127.0.0.1:5432/tmpl_app`,
		});
		const { main } = await loadScript(checkDbHealth);
		const stdout = memoryStream();
		const stderr = memoryStream();

		const exitCode = await main({
			env: { DATABASE_URL: 'postgres://tmpl:super-secret@127.0.0.1:5432/tmpl_app' },
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(1);
		expect(stdout.output).toBe('');
		expect(stderr.output).toContain(`FAIL ${code}`);
		expect(stderr.output).toContain('detail:');
		expect(stderr.output).toContain(next);
		expect(stderr.output).toContain('postgres://tmpl:[REDACTED]@127.0.0.1:5432/tmpl_app');
		expect(stderr.output).not.toContain('super-secret');
	});

	it('diagnoses thrown probe errors and redacts secrets', async () => {
		const checkDbHealth = vi
			.fn()
			.mockRejectedValue(new Error('connect ECONNREFUSED postgres://tmpl:bad-pass@127.0.0.1:1/x'));
		const { main } = await loadScript(checkDbHealth);
		const stdout = memoryStream();
		const stderr = memoryStream();

		const code = await main({
			env: { DATABASE_URL: 'postgres://tmpl:bad-pass@127.0.0.1:1/x' },
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(code).toBe(1);
		expect(stdout.output).toBe('');
		expect(stderr.output).toContain('FAIL BOOT-PG-001');
		expect(stderr.output).toContain('NEXT: Start Postgres');
		expect(stderr.output).not.toContain('bad-pass');
		expect(stderr.output).toContain('postgres://tmpl:[REDACTED]@127.0.0.1:1/x');
	});
});
