import { routes } from './routes';

export type RoutePolicy =
	| 'indexable'
	| 'noindex'
	| 'private'
	| 'api'
	| 'feed'
	| 'health'
	| 'ignored';

export interface RoutePolicyEntry {
	/**
	 * SvelteKit route path. Use /examples/* for prefix coverage and
	 * /articles/[slug] for dynamic route families.
	 */
	path: string;
	policy: RoutePolicy;
	reason: string;
}

export const additionalRoutePolicies: RoutePolicyEntry[] = [
	{
		path: '/articles/[slug]',
		policy: 'indexable',
		reason: 'Published article detail pages are loaded from content/articles.',
	},
	{
		path: '/examples/*',
		policy: 'noindex',
		reason: 'Copyable page archetypes; never production search results.',
	},
	{
		path: '/healthz',
		policy: 'health',
		reason: 'Process liveness endpoint.',
	},
	{
		path: '/readyz',
		policy: 'health',
		reason: 'Database readiness endpoint.',
	},
	{
		path: '/sitemap.xml',
		policy: 'feed',
		reason: 'Search crawler sitemap feed.',
	},
	{
		path: '/robots.txt',
		policy: 'feed',
		reason: 'Search crawler robots policy.',
	},
	{
		path: '/rss.xml',
		policy: 'feed',
		reason: 'Article RSS feed.',
	},
	{
		path: '/llms.txt',
		policy: 'feed',
		reason: 'Public AI crawler disclosure feed.',
	},
	{
		path: '/admin/*',
		policy: 'private',
		reason: 'Sveltia CMS static admin entrypoint.',
	},
];

export function routePolicyEntries(): RoutePolicyEntry[] {
	return [
		...routes.map((route) => ({
			path: route.path,
			policy: route.indexable ? ('indexable' as const) : ('noindex' as const),
			reason: route.description,
		})),
		...additionalRoutePolicies,
	];
}
