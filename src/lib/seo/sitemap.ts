import { site } from '$lib/config/site';
import { routes } from './routes';
import type { RouteEntry } from './routes';

/** Return only routes that should appear in sitemap.xml. */
export function indexableRoutes(): RouteEntry[] {
	return routes.filter((r) => r.indexable);
}

function xmlEscape(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function routeToUrl(route: RouteEntry): string {
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

export function generateSitemapXml(): string {
	const entries = indexableRoutes().map(routeToUrl).join('\n');
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		entries,
		'</urlset>'
	].join('\n');
}
