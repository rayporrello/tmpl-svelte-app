import { expect, test } from '@playwright/test';

test.describe('authenticated E2E smoke', () => {
	test.skip(
		!process.env.SMOKE_TEST_SECRET || !process.env.POSTMARK_API_TEST,
		'E2E smoke is not configured for this environment.'
	);

	test('contact smoke path returns JSON proof', async ({ request }) => {
		const response = await request.post('/contact', {
			headers: { 'X-Smoke-Test': process.env.SMOKE_TEST_SECRET! },
			form: {
				name: 'Deploy Smoke',
				email: 'smoke@example.com',
				message: 'Deploy smoke test submission.',
				website: '',
			},
		});

		expect(response.status()).toBe(200);
		await expect(response.json()).resolves.toEqual(
			expect.objectContaining({ ok: true, smoke_test: true, contact_id: expect.any(String) })
		);
	});
});
