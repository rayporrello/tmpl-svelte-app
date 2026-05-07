import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseArgs, recordFromArgs } from '../../scripts/backup-record';
import { isBackupStale, readLastBackup, recordBackup } from '../../scripts/lib/backup-state';
import { fail, pass } from '../../scripts/lib/ops-result';
import { readEvents } from '../../scripts/lib/ops-status';

let tempDir: string;
const previousOpsStateDir = process.env.OPS_STATE_DIR;

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), 'backup-state-'));
	process.env.OPS_STATE_DIR = tempDir;
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-05-07T12:00:00.000Z'));
});

afterEach(() => {
	vi.useRealTimers();
	if (previousOpsStateDir === undefined) {
		delete process.env.OPS_STATE_DIR;
	} else {
		process.env.OPS_STATE_DIR = previousOpsStateDir;
	}
	rmSync(tempDir, { recursive: true, force: true });
});

describe('backup status channel', () => {
	it('records successful backup attempts and emits a ledger event', async () => {
		recordBackup({
			results: [pass('BACKUP-BASE-001', 'Backup completed')],
			kind: 'base',
			backupSource: 'WAL-G backup-push via site-postgres',
			startedAt: new Date('2026-05-07T11:59:50.000Z'),
			finishedAt: new Date('2026-05-07T12:00:00.000Z'),
		});

		const backup = readLastBackup();
		expect(backup).toMatchObject({
			status: 'pass',
			kind: 'base',
			succeededAt: '2026-05-07T12:00:00.000Z',
			durationMs: 10_000,
		});
		expect(isBackupStale()).toBe(false);

		const events: object[] = [];
		for await (const event of readEvents({ channel: 'backup' })) events.push(event);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ channel: 'backup', type: 'backup', status: 'pass' });
	});

	it('preserves the last successful timestamp after a failed attempt', () => {
		recordBackup({
			results: [pass('BACKUP-BASE-001', 'Backup completed')],
			kind: 'base',
			backupSource: 'WAL-G backup-push',
			startedAt: new Date('2026-05-07T10:00:00.000Z'),
			finishedAt: new Date('2026-05-07T10:00:10.000Z'),
		});
		recordBackup({
			results: [fail('BACKUP-BASE-001', 'Backup failed')],
			kind: 'base',
			backupSource: 'WAL-G backup-push',
			startedAt: new Date('2026-05-07T11:00:00.000Z'),
			finishedAt: new Date('2026-05-07T11:00:10.000Z'),
		});

		expect(readLastBackup()).toMatchObject({
			status: 'fail',
			attemptedAt: '2026-05-07T11:00:10.000Z',
			succeededAt: '2026-05-07T10:00:10.000Z',
		});
	});

	it('records from the shell-friendly CLI arguments', () => {
		expect(
			parseArgs([
				'--kind=legacy-all',
				'--status=pass',
				'--source=backup:all db=OK uploads=OK push=SKIPPED',
				'--duration-ms=123',
			])
		).toMatchObject({ kind: 'legacy-all', status: 'pass', durationMs: 123 });

		recordFromArgs([
			'--kind=legacy-all',
			'--status=warn',
			'--source=backup:all db=OK uploads=OK push=SKIPPED',
			'--duration-ms=123',
			'--summary=Backup legacy-all completed with warnings',
		]);

		expect(readLastBackup()).toMatchObject({
			status: 'warn',
			kind: 'legacy-all',
			durationMs: 123,
		});
	});
});
