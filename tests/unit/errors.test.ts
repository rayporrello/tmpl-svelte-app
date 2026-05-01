import { describe, expect, it } from 'vitest';

import { BootstrapScriptError, ERRORS, getErrorMessage } from '../../scripts/lib/errors';

describe('errors registry', () => {
	it('contains stable bootstrap and launch codes', () => {
		expect(ERRORS['BOOT-BUN-001']).toBe('Bun missing or below 1.1');
		expect(ERRORS['LAUNCH-EMAIL-001']).toMatch(/console-only/);
	});

	it('returns human labels by code', () => {
		expect(getErrorMessage('BOOT-PG-003')).toMatch(/port collision/);
	});

	it('wraps code and NEXT hint in BootstrapScriptError', () => {
		const error = new BootstrapScriptError('BOOT-PG-001', undefined, 'Install Podman.');
		expect(error.code).toBe('BOOT-PG-001');
		expect(error.hint).toBe('NEXT: Install Podman.');
		expect(error.message).toBe(ERRORS['BOOT-PG-001']);
	});
});
