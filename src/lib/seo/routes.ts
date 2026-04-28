export type Changefreq = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

export interface RouteEntry {
	path: string;
	title: string;
	description: string;
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
 * - /styleguide, /admin, /preview, /examples, and draft-like routes must be indexable: false.
 * - All public marketing/content routes should be indexable: true.
 */
export const routes: RouteEntry[] = [
	{
		path: '/',
		title: 'Home',
		description: 'Homepage and primary site overview.',
		indexable: true,
		changefreq: 'weekly',
		priority: 1.0,
	},
	{
		path: '/articles',
		title: 'Articles',
		description: 'All published articles.',
		indexable: true,
		changefreq: 'weekly',
		priority: 0.7,
	},
	{
		path: '/styleguide',
		title: 'Styleguide',
		description: 'Internal design system demonstration.',
		indexable: false,
	},
	{
		path: '/admin',
		title: 'Admin',
		description: 'Internal content management interface.',
		indexable: false,
	},
	{
		// /examples and every page under it are copyable archetypes for real
		// site builds — never indexed. The check-seo script enforces this for
		// any route added under /examples.
		path: '/examples',
		title: 'Examples',
		description: 'Internal copyable page archetypes.',
		indexable: false,
	},
	{
		path: '/contact',
		title: 'Contact',
		description: 'Contact page.',
		indexable: true,
		changefreq: 'yearly',
		priority: 0.5,
	},
];
