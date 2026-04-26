export type PageType = 'website' | 'article';

export type RobotsDirective =
	| 'index, follow'
	| 'noindex, follow'
	| 'index, nofollow'
	| 'noindex, nofollow';

/**
 * Per-route SEO metadata. Pass to the SEO component or use buildPageMeta()
 * to resolve defaults before rendering.
 */
export interface PageSeoInput {
	title: string;
	description: string;
	/** Path only — no domain. The full canonical URL is built from site.url. */
	canonicalPath: string;
	/** Path or full URL for the OG image. Relative paths are resolved against site.url. */
	image?: string;
	imageAlt?: string;
	type?: PageType;
	/** Explicit robots override. Defaults to site.indexing setting. */
	robots?: RobotsDirective;
	/** ISO 8601. Only used when type is 'article'. */
	publishedDate?: string;
	/** ISO 8601. Only used when type is 'article'. */
	modifiedDate?: string;
	/** JSON-LD schema object(s) to inject as a <script type="application/ld+json"> block. */
	schema?: Record<string, unknown> | Record<string, unknown>[];
}

/** Resolved metadata — all fields guaranteed, ready for the SEO component. */
export interface ResolvedPageSeo {
	title: string;
	description: string;
	canonicalUrl: string;
	imageUrl: string;
	imageAlt: string;
	type: PageType;
	robots: RobotsDirective;
	publishedDate?: string;
	modifiedDate?: string;
	schema?: Record<string, unknown> | Record<string, unknown>[];
}
