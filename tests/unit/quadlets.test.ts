import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ALL_QUADLETS, ROLLBACK_QUADLETS } from '../../scripts/lib/quadlets';

describe('canonical Quadlet set', () => {
	it('locks the website-only production baseline', () => {
		expect(ALL_QUADLETS).toEqual(['web.container']);
		expect(ALL_QUADLETS).toHaveLength(1);
	});

	it('keeps rollback Quadlets inside the deploy Quadlet set', () => {
		const all = new Set<string>(ALL_QUADLETS);

		expect(ROLLBACK_QUADLETS.length).toBeGreaterThan(0);
		expect(ROLLBACK_QUADLETS.every((entry) => all.has(entry))).toBe(true);
	});

	it('points every Quadlet entry at a real deploy/quadlets file', () => {
		for (const entry of ALL_QUADLETS) {
			expect(existsSync(join(process.cwd(), 'deploy/quadlets', entry)), entry).toBe(true);
		}
	});
});
