import { generateRssXml } from '$lib/seo/feed';

export const prerender = true;

export function GET(): Response {
	return new Response(generateRssXml(), {
		headers: {
			'Content-Type': 'application/rss+xml',
		},
	});
}
