import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readEvents } from '../../scripts/lib/ops-status';
import { parseQuadletImage } from '../../scripts/lib/quadlet-image';
import { ROLLBACK_QUADLETS } from '../../scripts/lib/quadlets';
import { recordRelease, type Release } from '../../scripts/lib/release-state';
import { applyRollback, planRollback, type RollbackPlan } from '../../scripts/lib/rollback-engine';

let tempDir: string;
let quadletsDir: string;
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

function writeQuadlet(name: string, image: string): void {
	writeFileSync(join(quadletsDir, name), `[Container]\nImage=${image}\nPull=never\n`);
}

function seedRollbackQuadlets(image: string): void {
	for (const name of ROLLBACK_QUADLETS) writeQuadlet(name, image);
}

function planned(): RollbackPlan {
	const result = planRollback({ deployQuadletsDir: quadletsDir });
	if (!result.plan) throw new Error('Expected rollback plan');
	return result.plan;
}

async function collectEvents(): Promise<object[]> {
	const events: object[] = [];
	for await (const event of readEvents({ channel: 'releases' })) events.push(event);
	return events;
}

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), 'rollback-engine-'));
	quadletsDir = join(tempDir, 'quadlets');
	mkdirSync(quadletsDir, { recursive: true });
	process.env.OPS_STATE_DIR = join(tempDir, 'ops');
});

afterEach(() => {
	if (previousOpsStateDir === undefined) {
		delete process.env.OPS_STATE_DIR;
	} else {
		process.env.OPS_STATE_DIR = previousOpsStateDir;
	}
	rmSync(tempDir, { recursive: true, force: true });
});

describe('rollback engine', () => {
	it('refuses to plan rollback with an empty ledger', () => {
		const result = planRollback({ deployQuadletsDir: quadletsDir });

		expect(result.plan).toBeNull();
		expect(result.results).toMatchObject([
			{
				severity: 'fail',
				summary: 'Rollback refused: no releases on record',
			},
		]);
	});

	it('refuses to plan rollback with current but no prior release', () => {
		recordRelease(release('1', 'rollback-safe'));

		const result = planRollback({ deployQuadletsDir: quadletsDir });

		expect(result.plan).toBeNull();
		expect(result.results[0]?.summary).toContain('no prior release on record');
	});

	it('refuses to plan rollback when prior releases are rollback-blocked', () => {
		recordRelease(release('1', 'rollback-blocked'));
		recordRelease(release('2', 'rollback-blocked'));

		const result = planRollback({ deployQuadletsDir: quadletsDir });

		expect(result.plan).toBeNull();
		expect(result.results[0]?.summary).toContain('previous release marked rollback-blocked');
	});

	it('plans rollback to the prior rollback-safe release', () => {
		const prior = release('1', 'rollback-safe');
		const current = release('2', 'rollback-blocked');
		recordRelease(prior);
		recordRelease(current);
		seedRollbackQuadlets(current.image);

		const result = planRollback({ deployQuadletsDir: quadletsDir });

		expect(result.plan).toMatchObject({
			current,
			target: prior,
			quadletUpdates: [
				{
					path: join(quadletsDir, 'web.container'),
					oldImage: current.image,
					newImage: prior.image,
					unitName: 'web.service',
				},
				{
					path: join(quadletsDir, 'worker.container'),
					oldImage: current.image,
					newImage: prior.image,
					unitName: 'worker.service',
				},
			],
		});
		expect(result.results[0]?.severity).toBe('info');
	});

	it('dry-runs rollback without writing Quadlets or appending an event', async () => {
		const prior = release('1', 'rollback-safe');
		const current = release('2', 'rollback-blocked');
		recordRelease(prior);
		recordRelease(current);
		seedRollbackQuadlets(current.image);

		const result = applyRollback(planned(), { dryRun: true });

		for (const name of ROLLBACK_QUADLETS) {
			expect(parseQuadletImage(join(quadletsDir, name)).imageRef).toBe(current.image);
		}
		expect(await collectEvents()).not.toContainEqual(expect.objectContaining({ type: 'rollback' }));
		expect(result.at(-1)).toMatchObject({
			severity: 'info',
			remediation: [
				'systemctl --user daemon-reload',
				'systemctl --user restart web.service worker.service',
			],
		});
	});

	it('applies rollback by updating Quadlets and appending a rollback event', async () => {
		const prior = release('1', 'rollback-safe');
		const current = release('2', 'rollback-blocked');
		recordRelease(prior);
		recordRelease(current);
		seedRollbackQuadlets(current.image);

		applyRollback(planned());

		for (const name of ROLLBACK_QUADLETS) {
			expect(parseQuadletImage(join(quadletsDir, name)).imageRef).toBe(prior.image);
			expect(readFileSync(join(quadletsDir, name), 'utf8')).toContain(`Image=${prior.image}`);
		}
		expect(await collectEvents()).toContainEqual(
			expect.objectContaining({
				channel: 'releases',
				type: 'rollback',
				from_release: current,
				to_release: prior,
				quadlet_paths: [join(quadletsDir, 'web.container'), join(quadletsDir, 'worker.container')],
			})
		);
	});
});
