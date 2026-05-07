import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sveltekit-superforms', () => ({ superValidate: vi.fn() }));
vi.mock('sveltekit-superforms/adapters', () => ({ valibot: vi.fn() }));

import {
	handleSmokeContactRequest,
	smokeRateLimitKey,
	smokeSecretMatches,
} from '../../src/lib/server/forms/contact-action';
import {
	checkSmokeRateLimit,
	resetSmokeRateLimitForTests,
} from '../../src/lib/server/forms/rate-limit';

const SECRET = '0123456789abcdef0123456789abcdef';

function setSmokeEnv(overrides: Record<string, string | undefined> = {}) {
	process.env.ORIGIN = 'https://example.com';
	process.env.PUBLIC_SITE_URL = 'https://example.com';
	process.env.DATABASE_URL = 'postgres://user:pass@127.0.0.1:5432/db';
	process.env.SMOKE_TEST_SECRET = SECRET;
	process.env.POSTMARK_API_TEST = 'POSTMARK_API_TEST';
	process.env.SMOKE_TEST_RATE_LIMIT_PER_HOUR = '60';
	process.env.SMOKE_TEST_BACKLOG_THRESHOLD = '100';
	for (const [key, value] of Object.entries(overrides)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
}

function smokeEvent(headerValue: string) {
	return {
		request: new Request('https://example.com/contact', {
			method: 'POST',
			headers: {
				'x-smoke-test': headerValue,
				'content-type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				name: 'Deploy Smoke',
				email: 'smoke@example.com',
				message: 'Deploy smoke test submission.',
				website: '',
			}),
		}),
		url: new URL('https://example.com/contact'),
		locals: { requestId: 'req-smoke' },
	} as Parameters<typeof handleSmokeContactRequest>[0];
}

describe('contact action smoke authentication', () => {
	beforeEach(() => {
		setSmokeEnv();
		resetSmokeRateLimitForTests();
	});

	it('uses constant-time comparison and rejects wrong secrets', () => {
		expect(smokeSecretMatches(SECRET, SECRET)).toBe(true);
		expect(smokeSecretMatches('bad-secret', SECRET)).toBe(false);
	});

	it('invalid header returns 401 without DB, Postmark, or secret logging', async () => {
		const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
		const response = await handleSmokeContactRequest(smokeEvent('bad-secret'), {
			db: { transaction: vi.fn() } as never,
			emailProvider: { send: vi.fn() },
			logger: logger as never,
		});

		expect(response?.status).toBe(401);
		expect(await response?.text()).not.toContain('bad-secret');
		expect(logger.error).not.toHaveBeenCalled();
	});

	it('rate limits the shared smoke bucket independently', () => {
		const key = smokeRateLimitKey(SECRET);
		for (let index = 0; index < 60; index += 1) {
			expect(checkSmokeRateLimit(key, 60)).toBe(true);
		}
		expect(checkSmokeRateLimit(key, 60)).toBe(false);
	});
});
