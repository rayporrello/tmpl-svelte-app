import { test, expect } from '@playwright/test';

const publicPages = ['/', '/articles', '/contact'];
const noindexPages = ['/examples', '/examples/homepage', '/examples/pricing', '/examples/faq'];

test.describe('SEO metadata', () => {
	for (const path of publicPages) {
		test(`${path} renders one canonical metadata set`, async ({ page }) => {
			const response = await page.goto(path);
			expect(response?.status()).toBe(200);

			await expect(page.locator('head title')).toHaveCount(1);
			await expect(page.locator('head meta[name="description"]')).toHaveCount(1);
			await expect(page.locator('head link[rel="canonical"]')).toHaveCount(1);
			await expect(page.locator('head meta[name="robots"]')).toHaveCount(1);
		});
	}

	for (const path of noindexPages) {
		test(`${path} is noindex`, async ({ page }) => {
			const response = await page.goto(path);
			expect(response?.status()).toBe(200);

			const robots = page.locator('head meta[name="robots"]');
			await expect(robots).toHaveCount(1);
			await expect(robots).toHaveAttribute('content', /noindex/);
		});
	}

	test('/styleguide 404 is noindex', async ({ page }) => {
		const response = await page.goto('/styleguide');
		expect(response?.status()).toBe(404);

		const robots = page.locator('head meta[name="robots"]');
		await expect(robots).toHaveCount(1);
		await expect(robots).toHaveAttribute('content', /noindex/);
	});
});
