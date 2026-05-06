import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ALL_QUADLETS, ROLLBACK_QUADLETS } from '../../scripts/lib/quadlets';

describe('canonical Quadlet set', () => {
	it('locks the lead-gen appliance baseline', () => {
		expect(ALL_QUADLETS).toEqual(['web.container', 'postgres.container', 'worker.container']);
		expect(ALL_QUADLETS).toHaveLength(3);
	});

	it('keeps rollback Quadlets as a strict subset of all Quadlets', () => {
		const all = new Set<string>(ALL_QUADLETS);

		expect(ROLLBACK_QUADLETS.length).toBeGreaterThan(0);
		expect(ROLLBACK_QUADLETS.length).toBeLessThan(ALL_QUADLETS.length);
		expect(ROLLBACK_QUADLETS.every((entry) => all.has(entry))).toBe(true);
	});

	it('points every Quadlet entry at a real deploy/quadlets file', () => {
		for (const entry of ALL_QUADLETS) {
			expect(existsSync(join(process.cwd(), 'deploy/quadlets', entry)), entry).toBe(true);
		}
	});
});
