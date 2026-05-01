import { describe, expect, it } from 'vitest';

import { ERRORS } from '../../scripts/lib/errors';
import { LAUNCH_BLOCKERS } from '../../scripts/lib/launch-blockers';

describe('launch-blockers manifest stubs', () => {
	it('has one stub entry for every LAUNCH-* code', () => {
		const registryLaunchCodes = Object.keys(ERRORS).filter((code) => code.startsWith('LAUNCH-'));
		expect(LAUNCH_BLOCKERS.map((blocker) => blocker.id).sort()).toEqual(registryLaunchCodes.sort());
	});

	it('marks backup and email as recommended and required blockers as required', () => {
		const severities = Object.fromEntries(
			LAUNCH_BLOCKERS.map((blocker) => [blocker.id, blocker.severity])
		);
		expect(severities['LAUNCH-BACKUP-001']).toBe('recommended');
		expect(severities['LAUNCH-EMAIL-001']).toBe('recommended');
		expect(severities['LAUNCH-OG-001']).toBe('required');
	});

	it('returns pass from every Phase 1 stub check', async () => {
		await expect(Promise.all(LAUNCH_BLOCKERS.map((blocker) => blocker.check()))).resolves.toEqual(
			LAUNCH_BLOCKERS.map(() => ({ status: 'pass' }))
		);
	});
});
