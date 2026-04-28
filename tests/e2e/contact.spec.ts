import { test, expect } from '@playwright/test';

test.describe('Contact', () => {
	test('/contact renders the form', async ({ page }) => {
		const response = await page.goto('/contact');
		expect(response?.status()).toBe(200);

		await expect(page.getByRole('heading', { level: 1, name: 'Contact' })).toBeVisible();
		await expect(page.locator('form[method="POST"]')).toBeVisible();
		await expect(page.getByLabel('Name')).toBeVisible();
		await expect(page.getByLabel('Email')).toBeVisible();
		await expect(page.getByLabel('Message')).toBeVisible();
		await expect(page.locator('textarea[name="message"]')).toBeVisible();
		await expect(page.locator('button[type="submit"]')).toHaveText(/Send message/);
	});

	test('empty submit renders accessible field errors before DB persistence', async ({ page }) => {
		await page.goto('/contact');

		const responsePromise = page.waitForResponse((response) => {
			const request = response.request();
			return request.method() === 'POST' && new URL(response.url()).pathname === '/contact';
		});

		await page.locator('button[type="submit"]').click();
		const response = await responsePromise;
		expect(response.status()).toBe(400);

		const invalidControls = page.locator('[aria-invalid="true"]');
		await expect(invalidControls.first()).toHaveAttribute('aria-invalid', 'true');

		const invalidCount = await invalidControls.count();
		expect(invalidCount).toBeGreaterThan(0);

		for (let index = 0; index < invalidCount; index += 1) {
			const control = invalidControls.nth(index);
			const errorId = await control.getAttribute('aria-describedby');
			expect(errorId, 'invalid controls should reference visible error text').toBeTruthy();
			await expect(page.locator(`#${errorId}`)).toBeVisible();
		}
	});
});
