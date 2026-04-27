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
	image?: string;
	image_alt?: string;
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
