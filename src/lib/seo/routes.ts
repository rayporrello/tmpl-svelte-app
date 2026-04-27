export type Changefreq =
	| 'always'
	| 'hourly'
	| 'daily'
	| 'weekly'
	| 'monthly'
	| 'yearly'
	| 'never';

export interface RouteEntry {
	path: string;
	/** Whether this route should appear in sitemap.xml and be crawled. */
	indexable: boolean;
	changefreq?: Changefreq;
	/** 0.0–1.0. Defaults to 0.5 per sitemap spec. */
	priority?: number;
	/** ISO 8601 date string. Optional. */
	lastmod?: string;
}

/**
 * Static route registry. Add every new route here and declare whether it is
 * indexable. Non-indexable routes are excluded from sitemap.xml.
 *
 * Rules:
 * - /styleguide, /admin, /preview, and draft-like routes must be indexable: false.
 * - All public marketing/content routes should be indexable: true.
 */
export const routes: RouteEntry[] = [
	{
		path: '/',
		indexable: true,
		changefreq: 'weekly',
		priority: 1.0
	},
	{
		path: '/styleguide',
		indexable: false
	},
	{
		path: '/admin',
		indexable: false
	}
];
