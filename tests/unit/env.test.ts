/**
 * Tests for src/lib/server/env.ts
 *
 * Uses vi.resetModules() to get a fresh module instance per test, since
 * env.ts caches validated state in module-level variables after initEnv() runs.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Snapshot original env so each test starts clean
const originalEnv = { ...process.env };

function setEnv(vars: Record<string, string | undefined>) {
	// Clear relevant keys first
	delete process.env.ORIGIN;
	delete process.env.PUBLIC_SITE_URL;
	// Apply new values
	for (const [k, v] of Object.entries(vars)) {
		if (v === undefined) delete process.env[k];
		else process.env[k] = v;
	}
}

function restoreEnv() {
	// Remove test-added keys
	for (const key of Object.keys(process.env)) {
		if (!(key in originalEnv)) delete process.env[key];
	}
	// Restore original values
	for (const [key, val] of Object.entries(originalEnv)) {
		process.env[key] = val;
	}
}

describe('env module constants', () => {
	it('exports REQUIRED_PUBLIC_ENV_VARS with ORIGIN and PUBLIC_SITE_URL', async () => {
		const { REQUIRED_PUBLIC_ENV_VARS } = await import('$lib/server/env');
		expect(REQUIRED_PUBLIC_ENV_VARS).toContain('ORIGIN');
		expect(REQUIRED_PUBLIC_ENV_VARS).toContain('PUBLIC_SITE_URL');
	});

	it('exports REQUIRED_PRIVATE_ENV_VARS as an array', async () => {
		const { REQUIRED_PRIVATE_ENV_VARS } = await import('$lib/server/env');
		expect(Array.isArray(REQUIRED_PRIVATE_ENV_VARS)).toBe(true);
	});
});

describe('initEnv()', () => {
	beforeEach(() => {
		vi.resetModules();
		restoreEnv();
	});

	it('passes when all required public vars are set', async () => {
		setEnv({ ORIGIN: 'https://mysite.com', PUBLIC_SITE_URL: 'https://mysite.com' });
		const { initEnv } = await import('$lib/server/env');
		expect(() => initEnv()).not.toThrow();
	});

	it('throws when ORIGIN is missing', async () => {
		setEnv({ PUBLIC_SITE_URL: 'https://mysite.com' });
		const { initEnv } = await import('$lib/server/env');
		expect(() => initEnv()).toThrow(/ORIGIN/);
	});

	it('throws when PUBLIC_SITE_URL is missing', async () => {
		setEnv({ ORIGIN: 'https://mysite.com' });
		const { initEnv } = await import('$lib/server/env');
		expect(() => initEnv()).toThrow(/PUBLIC_SITE_URL/);
	});

	it('throws when ORIGIN is empty string', async () => {
		setEnv({ ORIGIN: '', PUBLIC_SITE_URL: 'https://mysite.com' });
		const { initEnv } = await import('$lib/server/env');
		expect(() => initEnv()).toThrow(/ORIGIN/);
	});

	it('error message references deploy/env.example', async () => {
		setEnv({});
		const { initEnv } = await import('$lib/server/env');
		expect(() => initEnv()).toThrow(/deploy\/env\.example/);
	});

	it('is a no-op on subsequent calls after success', async () => {
		setEnv({ ORIGIN: 'https://mysite.com', PUBLIC_SITE_URL: 'https://mysite.com' });
		const { initEnv } = await import('$lib/server/env');
		initEnv(); // first call validates
		// remove vars — second call should use cached result, not re-validate
		delete process.env.ORIGIN;
		expect(() => initEnv()).not.toThrow();
	});
});
