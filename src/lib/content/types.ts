export interface HomePageContent {
	title: string;
	description: string;
	hero: {
		eyebrow?: string;
		headline: string;
		subheadline?: string;
		primary_cta?: { label: string; href: string };
		secondary_cta?: { label: string; href: string };
	};
	sections?: Array<{
		title: string;
		body: string;
		items?: Array<{ text: string }>;
	}>;
}

export interface ArticleFrontmatter {
	title: string;
	slug: string;
	description: string;
	date: string;
	draft: boolean;
	/** Feature image — appears at the top of the article. Also used as the
	 *  share/OG image fallback when og_image is not set. */
	image?: string;
	image_alt?: string;
	/** Optional override for the share/OG image only. When set, takes priority
	 *  over `image` for og:image and twitter:image. */
	og_image?: string;
	og_image_alt?: string;
}

export interface Article extends ArticleFrontmatter {
	body: string;
}

export interface TeamMember {
	name: string;
	slug: string;
	role: string;
	photo?: string;
	photo_alt?: string;
	bio?: string;
	email?: string;
	order: number;
	active: boolean;
}

export interface Testimonial {
	name: string;
	slug: string;
	quote: string;
	source?: string;
	rating?: number;
	photo?: string;
	photo_alt?: string;
	order: number;
	published: boolean;
}
