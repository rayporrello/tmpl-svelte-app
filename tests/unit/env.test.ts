/**
 * Tests for src/lib/server/env.ts
 *
 * Uses vi.resetModules() to get a fresh module instance per test, since
 * env.ts caches validated state in module-level variables after initEnv() runs.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Snapshot original env so each test starts clean
const originalEnv = { ...process.env };

const VALID_PRIVATE = { DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/db' };

function setEnv(vars: Record<string, string | undefined>) {
	// Clear relevant keys first
	delete process.env.ORIGIN;
	delete process.env.PUBLIC_SITE_URL;
	delete process.env.DATABASE_URL;
	delete process.env.IN_CONTAINER;
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

	it('exports REQUIRED_PRIVATE_ENV_VARS including DATABASE_URL', async () => {
		const { REQUIRED_PRIVATE_ENV_VARS } = await import('$lib/server/env');
		expect(Array.isArray(REQUIRED_PRIVATE_ENV_VARS)).toBe(true);
		expect(REQUIRED_PRIVATE_ENV_VARS).toContain('DATABASE_URL');
	});
});

describe('initEnv()', () => {
	beforeEach(() => {
		vi.resetModules();
		restoreEnv();
	});

	it('passes when all required vars are set', async () => {
		setEnv({
			ORIGIN: 'https://mysite.com',
			PUBLIC_SITE_URL: 'https://mysite.com',
			...VALID_PRIVATE,
		});
		const { initEnv } = await import('$lib/server/env');
		expect(() => initEnv()).not.toThrow();
	});

	it('throws when ORIGIN is missing', async () => {
		setEnv({ PUBLIC_SITE_URL: 'https://mysite.com', ...VALID_PRIVATE });
		const { initEnv } = await import('$lib/server/env');
		expect(() => initEnv()).toThrow(/ORIGIN/);
	});

	it('throws when PUBLIC_SITE_URL is missing', async () => {
		setEnv({ ORIGIN: 'https://mysite.com', ...VALID_PRIVATE });
		const { initEnv } = await import('$lib/server/env');
		expect(() => initEnv()).toThrow(/PUBLIC_SITE_URL/);
	});

	it('throws when ORIGIN is empty string', async () => {
		setEnv({ ORIGIN: '', PUBLIC_SITE_URL: 'https://mysite.com', ...VALID_PRIVATE });
		const { initEnv } = await import('$lib/server/env');
		expect(() => initEnv()).toThrow(/ORIGIN/);
	});

	it('throws when DATABASE_URL is missing', async () => {
		setEnv({ ORIGIN: 'https://mysite.com', PUBLIC_SITE_URL: 'https://mysite.com' });
		const { initEnv } = await import('$lib/server/env');
		expect(() => initEnv()).toThrow(/DATABASE_URL/);
	});

	it('error message references deploy/env.example', async () => {
		setEnv({});
		const { initEnv } = await import('$lib/server/env');
		expect(() => initEnv()).toThrow(/deploy\/env\.example/);
	});

	it('is a no-op on subsequent calls after success', async () => {
		setEnv({
			ORIGIN: 'https://mysite.com',
			PUBLIC_SITE_URL: 'https://mysite.com',
			...VALID_PRIVATE,
		});
		const { initEnv } = await import('$lib/server/env');
		initEnv(); // first call validates
		// remove vars — second call should use cached result, not re-validate
		delete process.env.ORIGIN;
		expect(() => initEnv()).not.toThrow();
	});
});

describe('initEnv() — container DATABASE_URL guard', () => {
	beforeEach(() => {
		vi.resetModules();
		restoreEnv();
	});

	it('throws when DATABASE_URL is loopback inside a container', async () => {
		setEnv({
			ORIGIN: 'https://mysite.com',
			PUBLIC_SITE_URL: 'https://mysite.com',
			DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/db',
			IN_CONTAINER: '1',
		});
		const { initEnv } = await import('$lib/server/env');
		expect(() => initEnv()).toThrow(/container hostname/);
	});

	it('throws when DATABASE_URL hostname is "localhost" inside a container', async () => {
		setEnv({
			ORIGIN: 'https://mysite.com',
			PUBLIC_SITE_URL: 'https://mysite.com',
			DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
			IN_CONTAINER: '1',
		});
		const { initEnv } = await import('$lib/server/env');
		expect(() => initEnv()).toThrow(/container hostname/);
	});

	it('passes when DATABASE_URL uses a container hostname', async () => {
		setEnv({
			ORIGIN: 'https://mysite.com',
			PUBLIC_SITE_URL: 'https://mysite.com',
			DATABASE_URL: 'postgres://user:pass@acme-postgres:5432/db',
			IN_CONTAINER: '1',
		});
		const { initEnv } = await import('$lib/server/env');
		expect(() => initEnv()).not.toThrow();
	});

	it('does not enforce the guard when IN_CONTAINER is unset (host-side)', async () => {
		setEnv({
			ORIGIN: 'https://mysite.com',
			PUBLIC_SITE_URL: 'https://mysite.com',
			DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/db',
		});
		const { initEnv } = await import('$lib/server/env');
		expect(() => initEnv()).not.toThrow();
	});

	it('throws on a malformed DATABASE_URL inside a container', async () => {
		setEnv({
			ORIGIN: 'https://mysite.com',
			PUBLIC_SITE_URL: 'https://mysite.com',
			DATABASE_URL: 'not-a-url',
			IN_CONTAINER: '1',
		});
		const { initEnv } = await import('$lib/server/env');
		expect(() => initEnv()).toThrow(/not a valid URL/);
	});
});
