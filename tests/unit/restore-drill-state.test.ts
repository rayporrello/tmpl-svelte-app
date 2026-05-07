import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readChannel, readEvents } from '../../scripts/lib/ops-status';
import { isDrillStale, readLastDrill, recordDrill } from '../../scripts/lib/restore-drill-state';
import type { OpsResult } from '../../scripts/lib/ops-result';

let tempDir: string;
const previousOpsStateDir = process.env.OPS_STATE_DIR;

const passResult: OpsResult = {
	id: 'DRILL-001',
	severity: 'pass',
	summary: 'Source container present.',
};

function failResult(secret = 'a'.repeat(64)): OpsResult {
	return {
		id: 'DRILL-002',
		severity: 'fail',
		summary: `Restore failed with token ${secret}`,
		detail: `postgres://user:${secret}@127.0.0.1:5432/db`,
	};
}

async function collectEvents(): Promise<object[]> {
	const events: object[] = [];
	for await (const event of readEvents({ channel: 'restore-drill' })) events.push(event);
	return events;
}

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), 'restore-drill-state-'));
	process.env.OPS_STATE_DIR = tempDir;
});

afterEach(() => {
	if (previousOpsStateDir === undefined) {
		delete process.env.OPS_STATE_DIR;
	} else {
		process.env.OPS_STATE_DIR = previousOpsStateDir;
	}
	rmSync(tempDir, { recursive: true, force: true });
});

describe('restore drill state channel', () => {
	it('returns null when the channel is empty', () => {
		expect(readLastDrill()).toBeNull();
		expect(isDrillStale(new Date('2026-05-07T12:00:00Z'))).toBe(true);
	});

	it('records a passing drill and updates attempt and success timestamps', async () => {
		recordDrill({
			results: [passResult],
			targetTime: '2026-05-07T02:00:00.000Z',
			backupSource: 'WAL-G LATEST via project-postgres',
			startedAt: new Date('2026-05-07T03:00:00.000Z'),
			finishedAt: new Date('2026-05-07T03:00:10.000Z'),
		});

		expect(readChannel('restore-drill')).toMatchObject({
			last_attempt_at: '2026-05-07T03:00:10.000Z',
			last_success_at: '2026-05-07T03:00:10.000Z',
			status: 'pass',
			stale_after_seconds: 604800,
			detail: {
				attemptedAt: '2026-05-07T03:00:10.000Z',
				succeededAt: '2026-05-07T03:00:10.000Z',
				status: 'pass',
				durationMs: 10000,
				steps: [passResult],
			},
		});
		expect(readLastDrill()?.status).toBe('pass');
		expect(await collectEvents()).toHaveLength(1);
	});

	it('preserves the previous success timestamp after a failed drill', () => {
		recordDrill({
			results: [passResult],
			targetTime: '2026-05-07T02:00:00.000Z',
			backupSource: 'WAL-G LATEST via project-postgres',
			startedAt: new Date('2026-05-07T03:00:00.000Z'),
			finishedAt: new Date('2026-05-07T03:00:10.000Z'),
		});
		recordDrill({
			results: [failResult()],
			targetTime: '2026-05-07T04:00:00.000Z',
			backupSource: 'WAL-G LATEST via project-postgres',
			startedAt: new Date('2026-05-07T05:00:00.000Z'),
			finishedAt: new Date('2026-05-07T05:00:20.000Z'),
		});

		expect(readChannel('restore-drill')).toMatchObject({
			last_attempt_at: '2026-05-07T05:00:20.000Z',
			last_success_at: '2026-05-07T03:00:10.000Z',
			status: 'fail',
			detail: {
				attemptedAt: '2026-05-07T05:00:20.000Z',
				succeededAt: '2026-05-07T03:00:10.000Z',
				status: 'fail',
			},
		});
	});

	it('returns the latest snapshot and reports freshness from last_success_at', () => {
		recordDrill({
			results: [passResult],
			targetTime: '2026-05-07T02:00:00.000Z',
			backupSource: 'WAL-G LATEST via project-postgres',
			startedAt: new Date('2026-05-07T03:00:00.000Z'),
			finishedAt: new Date('2026-05-07T03:00:10.000Z'),
		});
		recordDrill({
			results: [passResult],
			targetTime: '2026-05-08T02:00:00.000Z',
			backupSource: 'WAL-G LATEST via project-postgres',
			startedAt: new Date('2026-05-08T03:00:00.000Z'),
			finishedAt: new Date('2026-05-08T03:00:10.000Z'),
		});

		expect(readLastDrill()).toMatchObject({
			targetTime: '2026-05-08T02:00:00.000Z',
			succeededAt: '2026-05-08T03:00:10.000Z',
		});
		expect(isDrillStale(new Date('2026-05-14T03:00:00.000Z'))).toBe(false);
		expect(isDrillStale(new Date('2026-05-16T03:00:11.000Z'))).toBe(true);
	});

	it('redacts secrets from snapshots and keeps events summary-only', async () => {
		const secret = 'b'.repeat(64);
		recordDrill({
			results: [failResult(secret)],
			targetTime: '2026-05-07T02:00:00.000Z',
			backupSource: `postgres://user:${secret}@127.0.0.1:5432/db`,
			startedAt: new Date('2026-05-07T03:00:00.000Z'),
			finishedAt: new Date('2026-05-07T03:00:10.000Z'),
		});

		const snapshotJson = JSON.stringify(readChannel('restore-drill'));
		const eventsJson = JSON.stringify(await collectEvents());
		expect(snapshotJson).not.toContain(secret);
		expect(eventsJson).not.toContain(secret);
		expect(eventsJson).not.toContain('postgres://user');
		expect(eventsJson).toContain('DRILL-002');
	});
});
