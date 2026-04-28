import { test, expect } from '@playwright/test';

function expectSitemapRoute(xml: string, path: string) {
	const escapedPath = path.replace(/\//g, '\\/');
	expect(xml).toMatch(new RegExp(`<loc>https?:\\/\\/[^<]+${escapedPath}<\\/loc>`));
}

test.describe('Feeds', () => {
	test('/sitemap.xml exposes indexable routes only', async ({ request }) => {
		const response = await request.get('/sitemap.xml');
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toContain('application/xml');

		const body = await response.text();
		expect(body).toContain('<?xml');
		expect(body).toContain('<urlset');
		expect(body).toContain('</urlset>');

		expectSitemapRoute(body, '/');
		expectSitemapRoute(body, '/articles');
		expectSitemapRoute(body, '/contact');

		expect(body).not.toContain('/admin');
		expect(body).not.toContain('/styleguide');
		expect(body).not.toContain('/examples');
		expect(body).not.toContain('/articles/getting-started');
	});

	test('/rss.xml exposes the article feed without draft content', async ({ request }) => {
		const response = await request.get('/rss.xml');
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toMatch(/application\/(rss\+xml|xml)/);

		const body = await response.text();
		expect(body).toContain('<?xml');
		expect(body).toContain('<rss version="2.0">');
		expect(body).toContain('</rss>');
		expect(body).toMatch(/<link>https?:\/\/[^<]+\/articles<\/link>/);

		expect(body).not.toContain('/admin');
		expect(body).not.toContain('/styleguide');
		expect(body).not.toContain('/examples');
		expect(body).not.toContain('/articles/getting-started');
	});

	test('home page advertises the RSS feed', async ({ page }) => {
		await page.goto('/');

		const alternate = page.locator('head link[rel="alternate"][type="application/rss+xml"]');
		await expect(alternate).toHaveCount(1);
		await expect(alternate).toHaveAttribute('href', /\/rss\.xml$/);
	});
});
