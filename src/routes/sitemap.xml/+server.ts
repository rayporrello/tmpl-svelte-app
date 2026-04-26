import { generateSitemapXml } from '$lib/seo/sitemap';

export const prerender = true;

export function GET(): Response {
	return new Response(generateSitemapXml(), {
		headers: {
			'Content-Type': 'application/xml'
		}
	});
}
