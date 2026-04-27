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

	test('/robots.txt reflects site.indexing=true', async ({ request }) => {
		const response = await request.get('/robots.txt');
		expect(response.status()).toBe(200);
		const body = await response.text();
		// Default template has indexing: true — expect Allow: /
		expect(body).toContain('Allow: /');
		expect(body).toContain('Sitemap:');
	});

	test('/styleguide is noindex', async ({ page }) => {
		await page.goto('/styleguide');
		// The layout renders a root-level robots meta; the page renders its own.
		// The page-specific meta is last — it wins in practice and reflects the route config.
		const robots = await page.locator('meta[name="robots"]').last().getAttribute('content');
		expect(robots).toContain('noindex');
	});

	test('/articles/sample-post renders rendered HTML not raw markdown', async ({ page }) => {
		await page.goto('/articles/sample-post');
		const articleBody = page.locator('.article-body');
		await expect(articleBody).toBeVisible();
		const html = await articleBody.innerHTML();
		// Rendered headings appear as <h2>, not as raw ## syntax
		expect(html).toContain('<h2');
		expect(html).not.toContain('## ');
	});

	test('/articles/sample-post: headings have stable IDs', async ({ page }) => {
		await page.goto('/articles/sample-post');
		const heading = page.locator('.article-body h2').first();
		await expect(heading).toBeVisible();
		const id = await heading.getAttribute('id');
		expect(id).toBeTruthy();
		// ID is a valid slug (no spaces, lowercase)
		expect(id).toMatch(/^[a-z0-9-]+$/);
	});
});

test.describe('Axe accessibility', () => {
	test('home has no violations', async ({ page }) => {
		await page.goto('/');
		const results = await new AxeBuilder({ page }).analyze();
		expect(results.violations).toEqual([]);
	});

	test('/articles/sample-post has no violations', async ({ page }) => {
		await page.goto('/articles/sample-post');
		const results = await new AxeBuilder({ page }).analyze();
		expect(results.violations).toEqual([]);
	});

	test('/articles has no violations', async ({ page }) => {
		await page.goto('/articles');
		const results = await new AxeBuilder({ page }).analyze();
		expect(results.violations).toEqual([]);
	});

	test('/styleguide has no violations', async ({ page }) => {
		await page.goto('/styleguide');
		const results = await new AxeBuilder({ page }).analyze();
		expect(results.violations).toEqual([]);
	});
});
