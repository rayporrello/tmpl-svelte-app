/**
 * Central site configuration — single source of truth for SEO and schema.
 * Replace all placeholder values before going to production.
 * `scripts/check-launch.ts` will fail the release check if placeholder values remain.
 * Run `bun run init:site` to replace all placeholders in one pass.
 */
export interface SiteOrganization {
	name: string;
	logo: string;
	sameAs: string[];
}

export interface SiteContact {
	/** Support email shown on error pages. Used by the error page contact link. */
	email: string;
}

export interface SiteConfig {
	name: string;
	url: string;
	defaultTitle: string;
	titleTemplate: string;
	defaultDescription: string;
	defaultOgImage: string;
	locale: string;
	/** Set false to emit noindex/nofollow globally (e.g. staging environments). */
	indexing: boolean;
	organization: SiteOrganization;
	/** Support contact — shown on error pages. */
	contact: SiteContact;
	/** Google Search Console HTML-tag verification token — omit if unused. */
	searchConsoleVerification?: string;
}

export const site: SiteConfig = {
	name: 'Your Site Name',
	url: 'https://example.com',
	defaultTitle: 'Your Site Name',
	titleTemplate: '%s — Your Site Name',
	defaultDescription: 'A short description of what this site is about.',
	defaultOgImage: '/og-default.png',
	locale: 'en_US',
	indexing: true,
	organization: {
		name: 'Your Site Name',
		logo: 'https://example.com/images/logo.png',
		sameAs: [
			// Add social profile URLs here, e.g.:
			// 'https://twitter.com/yourhandle',
			// 'https://linkedin.com/company/yourorg',
		],
	},
	contact: {
		email: 'support@example.com',
	},
	// searchConsoleVerification: 'your-token-here',
};
