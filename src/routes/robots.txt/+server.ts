import { site } from '$lib/config/site';

export const prerender = true;

const DISALLOWED_PATHS = ['/styleguide', '/admin', '/preview', '/draft'];

export function GET(): Response {
	const sitemapUrl = `${site.url.replace(/\/$/, '')}/sitemap.xml`;

	let body: string;

	if (!site.indexing) {
		body = ['User-agent: *', 'Disallow: /', '', `Sitemap: ${sitemapUrl}`].join('\n');
	} else {
		const disallowLines = DISALLOWED_PATHS.map((p) => `Disallow: ${p}`).join('\n');
		body = ['User-agent: *', 'Allow: /', disallowLines, '', `Sitemap: ${sitemapUrl}`].join('\n');
	}

	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain',
		},
	});
}
