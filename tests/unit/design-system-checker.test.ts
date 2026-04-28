import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { checkDesignSystem, type DesignSystemRuleId } from '../../scripts/check-design-system';

const fixtureRoot = join(process.cwd(), 'tests/fixtures/design-system');

const passFixtures = [
	'body-overflow-hidden.css',
	'image-attrs.svelte',
	'layer-order.css',
	'missing-token.css',
	'nav-aria-label.svelte',
	'no-tailwind.svelte',
	'route-main.svelte',
	'suppression.css',
	'theme-color.html',
	'viewport-lock.html',
];

const failFixtures: Record<string, DesignSystemRuleId[]> = {
	'body-overflow-hidden.css': ['ds/body-overflow-hidden'],
	'image-attrs.svelte': ['ds/image-attrs'],
	'layer-order.css': ['ds/layer-order'],
	'missing-token.css': ['ds/missing-token'],
	'nav-aria-label.svelte': ['ds/nav-aria-label'],
	'no-tailwind.css': ['ds/no-tailwind'],
	'route-main.svelte': ['ds/route-main'],
	'suppression-orphan.css': ['ds/suppression-orphan'],
	'suppression-reason.css': ['ds/missing-token', 'ds/suppression-reason'],
	'theme-color.css': ['ds/theme-color'],
	'viewport-lock.html': ['ds/viewport-lock'],
};

function ruleIdsFor(file: string, options: { incremental?: boolean } = {}): DesignSystemRuleId[] {
	const report = checkDesignSystem({
		rootDir: process.cwd(),
		files: [file],
		...options,
	});

	return [...new Set(report.violations.map((violation) => violation.ruleId))].sort();
}

describe('design-system checker fixtures', () => {
	it.each(passFixtures)('accepts pass/%s', (fixture) => {
		const file = join(fixtureRoot, 'pass', fixture);
		expect(ruleIdsFor(file)).toEqual([]);
	});

	it.each(Object.entries(failFixtures))('reports %s as %s', (fixture, expectedRuleIds) => {
		const file = join(fixtureRoot, 'fail', fixture);
		expect(ruleIdsFor(file)).toEqual(expectedRuleIds);
	});

	it('skips orphaned suppression detection during incremental checks', () => {
		const file = join(fixtureRoot, 'fail', 'suppression-orphan.css');
		expect(ruleIdsFor(file, { incremental: true })).toEqual([]);
	});
});
