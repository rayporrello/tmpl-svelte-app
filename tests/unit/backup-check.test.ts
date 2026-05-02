import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runBackupCheck } from '../../scripts/backup-check';

let tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
});

function tempProject(): string {
	const dir = mkdtempSync(join(tmpdir(), 'backup-check-test-'));
	tempDirs.push(dir);
	return dir;
}

function write(rootDir: string, path: string, content: string): void {
	const target = join(rootDir, path);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content);
}

function readyProject(): string {
	const rootDir = tempProject();
	write(rootDir, 'package.json', JSON.stringify({ name: 'ready-site' }, null, 2));
	write(rootDir, '.env', 'DATABASE_URL=postgres://ready:secret@127.0.0.1:5432/ready\n');
	return rootDir;
}

function okRunner() {
	return vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '', durationMs: 1 });
}

describe('backup:check', () => {
	it('runs pg_dump, restores into an ephemeral database, compares rows, and cleans up', async () => {
		const rootDir = readyProject();
		const runner = okRunner();
		const rowCounter = vi.fn(async (databaseUrl: string) =>
			databaseUrl.includes('backup_verify') ? 5 : 5
		);

		const result = await runBackupCheck({
			rootDir,
			runtime: 'podman',
			verifyPort: 54329,
			readinessTimeoutMs: 1,
			readinessIntervalMs: 1,
			runner,
			rowCounter,
			now: () => 123,
		});

		expect(result).toMatchObject({ status: 'pass' });
		expect(runner).toHaveBeenCalledWith(
			'pg_dump',
			expect.arrayContaining([
				'--format=custom',
				'--dbname',
				'postgres://ready:secret@127.0.0.1:5432/ready',
			]),
			expect.objectContaining({ capture: true, cwd: rootDir })
		);
		expect(runner).toHaveBeenCalledWith(
			'pg_restore',
			expect.arrayContaining([
				'--dbname',
				'postgres://backup_verify:backup_verify_password@127.0.0.1:54329/backup_verify',
			]),
			expect.objectContaining({ capture: true, cwd: rootDir })
		);
		expect(runner).toHaveBeenLastCalledWith(
			'podman',
			['rm', '-f', `ready-site-pg-backup-check-${process.pid}-123`],
			{ capture: true }
		);
		expect(rowCounter).toHaveBeenCalledTimes(2);
	});

	it('fails clearly when restore fails and still removes the verification container', async () => {
		const rootDir = readyProject();
		const runner = vi.fn(async (command: string) => {
			if (command === 'pg_restore') {
				return { code: 1, stdout: '', stderr: 'archive file is too short', durationMs: 1 };
			}
			return { code: 0, stdout: '', stderr: '', durationMs: 1 };
		});

		const result = await runBackupCheck({
			rootDir,
			runtime: 'podman',
			verifyPort: 54329,
			readinessTimeoutMs: 1,
			readinessIntervalMs: 1,
			runner,
			rowCounter: vi.fn(async () => 5),
			now: () => 456,
		});

		expect(result).toMatchObject({
			status: 'fail',
			detail: expect.stringContaining('pg_restore failed'),
		});
		expect(result.detail).toContain('archive file is too short');
		expect(runner).toHaveBeenCalledWith(
			'podman',
			['rm', '-f', `ready-site-pg-backup-check-${process.pid}-456`],
			{
				capture: true,
			}
		);
	});

	it('fails when restored row counts differ', async () => {
		const rootDir = readyProject();
		const runner = okRunner();
		const rowCounter = vi.fn(async (databaseUrl: string) =>
			databaseUrl.includes('backup_verify') ? 4 : 5
		);

		const result = await runBackupCheck({
			rootDir,
			runtime: 'podman',
			verifyPort: 54329,
			readinessTimeoutMs: 1,
			readinessIntervalMs: 1,
			runner,
			rowCounter,
		});

		expect(result).toMatchObject({
			status: 'fail',
			detail: expect.stringContaining('count mismatch'),
		});
	});

	it('fails before doing work when DATABASE_URL is missing', async () => {
		const rootDir = tempProject();
		write(rootDir, 'package.json', JSON.stringify({ name: 'ready-site' }, null, 2));
		const runner = okRunner();

		const result = await runBackupCheck({ rootDir, runtime: 'podman', runner });

		expect(result).toMatchObject({
			status: 'fail',
			detail: expect.stringContaining('DATABASE_URL'),
		});
		expect(runner).not.toHaveBeenCalled();
	});
});
