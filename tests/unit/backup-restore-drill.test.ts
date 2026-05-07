import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	collectRestoreDrillResults,
	runRestoreDrill,
	type RestoreDrillOptions,
} from '../../scripts/backup-restore-drill';
import type { RunResult } from '../../scripts/lib/run';

let tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
});

function makeRoot(): string {
	const rootDir = mkdtempSync(join(tmpdir(), 'backup-restore-drill-'));
	tempDirs.push(rootDir);
	writeFileSync(
		join(rootDir, 'site.project.json'),
		JSON.stringify({ project: { projectSlug: 'ready-site' } })
	);
	return rootDir;
}

function result(code: number, stdout = '', stderr = ''): RunResult {
	return { code, stdout, stderr, durationMs: 1 };
}

function fixedNow(): Date {
	return new Date('2026-05-07T03:00:00.000Z');
}

describe('backup restore drill', () => {
	it('returns OpsResult[] instead of the legacy step status shape', async () => {
		const runner: RestoreDrillOptions['runner'] = vi.fn(async () => result(1));

		const drill = await collectRestoreDrillResults({
			rootDir: makeRoot(),
			runner,
			now: fixedNow,
		});

		expect(drill.results).toEqual([
			expect.objectContaining({
				id: 'DRILL-001',
				severity: 'fail',
				summary: expect.stringContaining('Source container ready-site-postgres not found'),
			}),
		]);
		expect(drill.results[0]).not.toHaveProperty('status');
	});

	it('records the drill at the end of the run', async () => {
		const recorder = vi.fn();
		const runner: RestoreDrillOptions['runner'] = vi.fn(async () => result(1));

		const results = await runRestoreDrill({
			rootDir: makeRoot(),
			runner,
			now: fixedNow,
			recordDrill: recorder,
		});

		expect(results).toEqual([expect.objectContaining({ id: 'DRILL-001', severity: 'fail' })]);
		expect(recorder).toHaveBeenCalledWith(
			expect.objectContaining({
				results,
				targetTime: '2026-05-07T02:00:00.000Z',
				backupSource: 'WAL-G LATEST via ready-site-postgres',
				startedAt: new Date('2026-05-07T03:00:00.000Z'),
				finishedAt: new Date('2026-05-07T03:00:00.000Z'),
			})
		);
	});
});
