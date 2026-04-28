import { site } from '$lib/config/site';
import { indexableRoutes } from './public-routes';
import type { PublicRouteEntry } from './public-routes';

export { indexableRoutes } from './public-routes';

function xmlEscape(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function routeToUrl(route: PublicRouteEntry): string {
	const base = site.url.replace(/\/$/, '');
	const loc = xmlEscape(`${base}${route.path}`);
	const parts = [`    <loc>${loc}</loc>`];

	if (route.lastmod) parts.push(`    <lastmod>${route.lastmod}</lastmod>`);
	if (route.changefreq) parts.push(`    <changefreq>${route.changefreq}</changefreq>`);
	if (route.priority !== undefined) {
		parts.push(`    <priority>${route.priority.toFixed(1)}</priority>`);
	}

	return `  <url>\n${parts.join('\n')}\n  </url>`;
}

export function generateSitemapXml(routes = indexableRoutes()): string {
	const entries = routes.map(routeToUrl).join('\n');
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		entries,
		'</urlset>',
	].join('\n');
}
