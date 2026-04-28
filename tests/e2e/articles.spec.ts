import { test, expect } from '@playwright/test';

test.describe('Articles', () => {
	test('/articles renders the listing or empty state', async ({ page }) => {
		const response = await page.goto('/articles');
		expect(response?.status()).toBe(200);
		await expect(page.getByRole('heading', { level: 1, name: 'Articles' })).toBeVisible();

		const articleCards = page.locator('article');
		const cardCount = await articleCards.count();

		if (cardCount > 0) {
			await expect(articleCards.first().getByRole('heading', { level: 2 })).toBeVisible();
			await expect(articleCards.first().getByRole('link')).toHaveAttribute('href', /^\/articles\//);
		} else {
			await expect(page.getByText('No articles yet.')).toBeVisible();
		}
	});

	test('draft articles are not publicly rendered', async ({ request }) => {
		const response = await request.get('/articles/getting-started');
		expect(response.status()).toBe(404);
	});
});
