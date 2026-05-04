import { test, expect } from '@playwright/test';

test.describe('Security headers', () => {
	test('public pages include baseline headers', async ({ request }) => {
		const response = await request.get('/');
		expect(response.status()).toBe(200);
		const headers = response.headers();

		expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
		expect(headers['x-content-type-options']).toBe('nosniff');
		expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
		expect(headers['x-frame-options']).toBe('DENY');
		expect(headers['permissions-policy']).toContain('camera=()');
		expect(headers['strict-transport-security']).toBeUndefined();
	});
});
