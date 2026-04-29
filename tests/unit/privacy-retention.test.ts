import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RETENTION_DAYS } from '../../scripts/privacy-prune';
import { RETENTION_DEFAULTS_DAYS } from '../../src/lib/server/privacy/retention';

describe('privacy retention defaults', () => {
	it('keeps script defaults, constants, and docs aligned', () => {
		expect(DEFAULT_RETENTION_DAYS).toEqual(RETENTION_DEFAULTS_DAYS);

		const doc = readFileSync('docs/privacy/data-retention.md', 'utf8');
		expect(doc).toContain('src/lib/server/privacy/retention.ts');

		for (const [key, days] of Object.entries(RETENTION_DEFAULTS_DAYS)) {
			expect(doc).toContain(`\`${key}\``);
			expect(doc).toContain(`${days} days`);
		}
	});
});
