import { site } from '$lib/config/site';
import { indexableRoutes } from '$lib/seo/sitemap';

export const prerender = true;

export function GET(): Response {
	const base = site.url.replace(/\/$/, '');
	const sitemapUrl = `${base}/sitemap.xml`;
	const rssUrl = `${base}/rss.xml`;

	const publicRoutes = indexableRoutes()
		.map((route) => `- [${route.title}](${base}${route.path}): ${route.description}`)
		.join('\n');

	const body = [
		`# ${site.name}`,
		'',
		`> ${site.defaultDescription}`,
		'',
		`Homepage: ${site.url}`,
		`Sitemap: ${sitemapUrl}`,
		`RSS: ${rssUrl}`,
		'',
		'## Public pages',
		publicRoutes,
		'',
		'## Feeds',
		`- [XML sitemap](${sitemapUrl}): Canonical URL inventory for search engines.`,
		`- [RSS feed](${rssUrl}): Recent published articles.`,
	].join('\n');

	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain',
		},
	});
}
