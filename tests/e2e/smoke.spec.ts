import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Smoke', () => {
	test('home renders', async ({ page }) => {
		const response = await page.goto('/');
		expect(response?.status()).toBe(200);
		await expect(page.locator('h1').first()).toBeVisible();
	});

	test('/healthz returns 200 with ok:true', async ({ request }) => {
		const response = await request.get('/healthz');
		expect(response.status()).toBe(200);
		const body = await response.json();
		expect(body.ok).toBe(true);
	});

	test('/sitemap.xml is valid XML', async ({ request }) => {
		const response = await request.get('/sitemap.xml');
		expect(response.status()).toBe(200);
		const body = await response.text();
		expect(body).toContain('<?xml');
		expect(body).toContain('<urlset');
		expect(body).toContain('</urlset>');
	});

	test('/rss.xml is valid RSS', async ({ request }) => {
		const response = await request.get('/rss.xml');
		expect(response.status()).toBe(200);
		const body = await response.text();
		expect(body).toContain('<?xml');
		expect(body).toContain('<rss version="2.0">');
		expect(body).toContain('</rss>');
	});

	test('/robots.txt reflects site.indexing=true', async ({ request }) => {
		const response = await request.get('/robots.txt');
		expect(response.status()).toBe(200);
		const body = await response.text();
		// Default template has indexing: true — expect Allow: /
		expect(body).toContain('Allow: /');
		expect(body).toContain('Sitemap:');
	});

	test('/styleguide is noindex', async ({ page }) => {
		const response = await page.goto('/styleguide');
		expect(response?.status()).toBe(404);
		// The layout renders a root-level robots meta; the page renders its own.
		// The page-specific meta is last — it wins in practice and reflects the route config.
		const robots = await page.locator('meta[name="robots"]').last().getAttribute('content');
		expect(robots).toContain('noindex');
	});

	test('/examples and example pages are noindex', async ({ page }) => {
		for (const path of ['/examples', '/examples/homepage', '/examples/pricing', '/examples/faq']) {
			await page.goto(path);
			const robots = await page.locator('meta[name="robots"]').last().getAttribute('content');
			expect(robots, `${path} should be noindex`).toContain('noindex');
		}
	});

	test('draft articles are not publicly rendered', async ({ request }) => {
		const response = await request.get('/articles/getting-started');
		expect(response.status()).toBe(404);
	});
});

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

test.describe('Axe accessibility', () => {
	test('home has no violations', async ({ page }) => {
		await page.goto('/');
		const results = await new AxeBuilder({ page }).analyze();
		expect(results.violations).toEqual([]);
	});

	test('/articles has no violations', async ({ page }) => {
		await page.goto('/articles');
		const results = await new AxeBuilder({ page }).analyze();
		expect(results.violations).toEqual([]);
	});

	test('/examples/homepage (archetype) has no violations', async ({ page }) => {
		await page.goto('/examples/homepage');
		const results = await new AxeBuilder({ page }).analyze();
		expect(results.violations).toEqual([]);
	});
});
