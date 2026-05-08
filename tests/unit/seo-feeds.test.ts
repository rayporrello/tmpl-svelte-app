import { describe, expect, it } from 'vitest';
import { generateRssXml } from '$lib/seo/feed';
import { generateSitemapXml } from '$lib/seo/sitemap';
import type { ArticleEntry } from '$lib/content/articles';
import type { PublicRouteEntry } from '$lib/seo/public-routes';
import { inTemplateState } from '../helpers/template-state';

const articleEntry: ArticleEntry = {
	filename: 'example-post.md',
	slug: 'example-post',
	sourcePath: 'content/articles/example-post.md',
	article: {
		title: 'Example Post',
		slug: 'example-post',
		description: 'An example post for feed generation.',
		date: '2026-04-27',
		draft: false,
		body: '## Hello',
	},
};

describe('generateSitemapXml()', () => {
	it.skipIf(!inTemplateState)('renders route metadata including article lastmod', () => {
		const routes: PublicRouteEntry[] = [
			{
				path: '/articles/example-post',
				title: 'Example Post',
				description: 'An example post.',
				indexable: true,
				source: 'article',
				lastmod: '2026-04-27',
				changefreq: 'yearly',
				priority: 0.6,
			},
		];

		const xml = generateSitemapXml(routes);
		expect(xml).toContain('<loc>https://example.com/articles/example-post</loc>');
		expect(xml).toContain('<lastmod>2026-04-27</lastmod>');
		expect(xml).toContain('<changefreq>yearly</changefreq>');
	});
});

describe('generateRssXml()', () => {
	it.skipIf(!inTemplateState)(
		'renders RSS 2.0 with canonical permalink guids and stable lastBuildDate',
		() => {
			const xml = generateRssXml([articleEntry]);
			expect(xml).toContain('<rss version="2.0">');
			expect(xml).toContain('<title>Your Site Name Articles</title>');
			expect(xml).toContain(
				'<guid isPermaLink="true">https://example.com/articles/example-post</guid>'
			);
			expect(xml).toContain('<description>An example post for feed generation.</description>');
			expect(xml).toContain('<pubDate>Mon, 27 Apr 2026 00:00:00 GMT</pubDate>');
			expect(xml).toContain('<lastBuildDate>Mon, 27 Apr 2026 00:00:00 GMT</lastBuildDate>');
			expect(xml).not.toContain('## Hello');
		}
	);
});
