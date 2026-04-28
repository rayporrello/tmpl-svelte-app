import { test, expect } from '@playwright/test';

test.describe('Analytics disabled by default', () => {
	// These tests run against the built server which has no PUBLIC_ANALYTICS_ENABLED set.
	// They assert that no external analytics scripts are injected into the page.
	test('home page contains no GTM script when analytics is disabled', async ({ page }) => {
		await page.goto('/');
		const html = await page.content();
		expect(html).not.toContain('googletagmanager.com');
		expect(html).not.toContain('google-analytics.com');
		expect(html).not.toContain('cloudflareinsights.com');
	});

	test('home page has no dataLayer push in source when analytics is disabled', async ({ page }) => {
		await page.goto('/');
		const html = await page.content();
		expect(html).not.toContain('gtm.start');
	});
});
