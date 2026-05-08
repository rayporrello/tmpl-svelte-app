import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { inTemplateState } from '../helpers/template-state';
import { readChannel, readEvents } from '../../scripts/lib/ops-status';
import {
	getCurrentRelease,
	getPreviousRollbackSafeRelease,
	listReleases,
	recordRelease,
	type Release,
} from '../../scripts/lib/release-state';

let tempDir: string;
const previousOpsStateDir = process.env.OPS_STATE_DIR;

function release(id: string, migrationSafety: Release['migrationSafety']): Release {
	return {
		id,
		sha: `sha-${id}`,
		image: `ghcr.io/example/site:sha-${id}`,
		deployedAt: `2026-05-06T12:0${id}:00.000Z`,
		migrations: [`000${id}_migration.sql`],
		migrationSafety,
	};
}

async function collectEvents(): Promise<object[]> {
	const events: object[] = [];
	for await (const event of readEvents({ channel: 'releases' })) events.push(event);
	return events;
}

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), 'release-state-'));
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

describe('release state channel', () => {
	it.skipIf(!inTemplateState)(
		'records a release snapshot and appends a release event',
		async () => {
			const first = release('1', 'rollback-safe');

			recordRelease(first);

			expect(readChannel('releases')).toMatchObject({
				project: 'project',
				status: 'pass',
				detail: { releases: [first] },
			});
			expect(await collectEvents()).toMatchObject([
				{
					channel: 'releases',
					type: 'release.recorded',
					release: first,
				},
			]);
		}
	);

	it('lists releases newest first and respects limits', () => {
		recordRelease(release('1', 'rollback-safe'));
		recordRelease(release('2', 'rollback-blocked'));
		recordRelease(release('3', 'rollback-safe'));

		expect(listReleases().map((item) => item.id)).toEqual(['3', '2', '1']);
		expect(listReleases({ limit: 2 }).map((item) => item.id)).toEqual(['3', '2']);
	});

	it('returns null for current release on empty history', () => {
		expect(getCurrentRelease()).toBeNull();
	});

	it('returns the current release from history', () => {
		recordRelease(release('1', 'rollback-safe'));
		recordRelease(release('2', 'rollback-blocked'));

		expect(getCurrentRelease()?.id).toBe('2');
	});

	it('finds the previous rollback-safe release while skipping blocked entries', () => {
		recordRelease(release('1', 'rollback-safe'));
		recordRelease(release('2', 'rollback-blocked'));
		recordRelease(release('3', 'rollback-blocked'));

		expect(getPreviousRollbackSafeRelease()?.id).toBe('1');
	});

	it('returns null when no rollback-safe target exists before current', () => {
		recordRelease(release('1', 'rollback-blocked'));
		recordRelease(release('2', 'rollback-blocked'));

		expect(getPreviousRollbackSafeRelease()).toBeNull();
	});
});
