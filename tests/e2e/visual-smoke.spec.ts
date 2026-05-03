import { test, expect } from '@playwright/test';

const pages = ['/', '/contact', '/articles'];
const viewports = [
	{ name: 'desktop', width: 1440, height: 1000 },
	{ name: 'mobile', width: 390, height: 844 },
] as const;

test.describe('Visual smoke', () => {
	for (const viewport of viewports) {
		for (const path of pages) {
			test(`${path} renders without obvious ${viewport.name} layout breakage`, async ({ page }) => {
				await page.setViewportSize({ width: viewport.width, height: viewport.height });
				const response = await page.goto(path);
				expect(response?.status()).toBe(200);
				await expect(page.locator('h1').first()).toBeVisible();

				const smoke = await page.evaluate(() => {
					const root = document.documentElement;
					const bodyText = document.body.innerText.trim();
					const viewportWidth = window.innerWidth;
					const overflowing = Array.from(document.body.querySelectorAll('*'))
						.filter((element) => {
							const style = window.getComputedStyle(element);
							if (style.display === 'none' || style.visibility === 'hidden') return false;
							const rect = element.getBoundingClientRect();
							return rect.width > 0 && rect.height > 0;
						})
						.filter((element) => {
							const rect = element.getBoundingClientRect();
							return rect.left < -2 || rect.right > viewportWidth + 2;
						})
						.slice(0, 5)
						.map((element) => {
							const rect = element.getBoundingClientRect();
							return {
								tag: element.tagName.toLowerCase(),
								className: String((element as HTMLElement).className || ''),
								left: Math.round(rect.left),
								right: Math.round(rect.right),
							};
						});

					return {
						hasText: bodyText.length > 20,
						horizontalOverflow: root.scrollWidth - viewportWidth,
						overflowing,
					};
				});

				expect(smoke.hasText).toBe(true);
				expect(smoke.horizontalOverflow).toBeLessThanOrEqual(2);
				expect(smoke.overflowing).toEqual([]);
				expect((await page.screenshot()).byteLength).toBeGreaterThan(1000);
			});
		}
	}
});
