import { site } from '$lib/config/site';
import { indexableRoutes } from '$lib/seo/sitemap';

export const prerender = true;

export function GET(): Response {
	const base = site.url.replace(/\/$/, '');
	const sitemapUrl = `${base}/sitemap.xml`;

	const publicRoutes = indexableRoutes()
		.map((r) => `- ${base}${r.path}`)
		.join('\n');

	const body = [
		`# ${site.name}`,
		'',
		site.defaultDescription,
		'',
		`Homepage: ${site.url}`,
		`Sitemap: ${sitemapUrl}`,
		'',
		'## Public pages',
		publicRoutes
	].join('\n');

	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain'
		}
	});
}
