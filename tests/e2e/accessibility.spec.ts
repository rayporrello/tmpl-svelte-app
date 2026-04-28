import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const axePages = ['/', '/articles', '/examples/homepage', '/contact'];

test.describe('Axe accessibility', () => {
	for (const path of axePages) {
		test(`${path} has no violations`, async ({ page }) => {
			await page.goto(path);
			const results = await new AxeBuilder({ page }).analyze();
			expect(results.violations).toEqual([]);
		});
	}
});
