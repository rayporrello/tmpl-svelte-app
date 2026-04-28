import { test, expect } from '@playwright/test';

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
});
