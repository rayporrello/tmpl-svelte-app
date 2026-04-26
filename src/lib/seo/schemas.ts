/**
 * JSON-LD schema helpers. These produce plain objects compatible with
 * JSON.stringify — pass them to the SEO component's `schema` prop.
 *
 * IMPORTANT: Only use a schema type when the visible page content supports it.
 * Do not add FAQ schema if there is no FAQ on the page. Do not add
 * LocalBusiness schema if the page does not represent a physical business.
 * Google may penalize schema that does not match visible content.
 */
import { site } from '$lib/config/site';
import { buildCanonicalUrl, buildImageUrl } from './metadata';

// ── Core types ────────────────────────────────────────────────────────────────

export function organizationSchema(): Record<string, unknown> {
	return {
		'@context': 'https://schema.org',
		'@type': 'Organization',
		name: site.organization.name,
		url: site.url,
		logo: {
			'@type': 'ImageObject',
			url: buildImageUrl(site.organization.logo)
		},
		sameAs: site.organization.sameAs
	};
}

export function websiteSchema(): Record<string, unknown> {
	return {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: site.name,
		url: site.url,
		description: site.defaultDescription,
		publisher: {
			'@type': 'Organization',
			name: site.organization.name,
			url: site.url
		}
	};
}

// ── Article ───────────────────────────────────────────────────────────────────

export interface ArticleSchemaInput {
	title: string;
	description: string;
	canonicalPath: string;
	/** Full URL or site-relative path to the article image. */
	imagePath: string;
	publishedDate: string;
	modifiedDate?: string;
	authorName: string;
	authorUrl?: string;
}

export function articleSchema(input: ArticleSchemaInput): Record<string, unknown> {
	return {
		'@context': 'https://schema.org',
		'@type': 'Article',
		headline: input.title,
		description: input.description,
		url: buildCanonicalUrl(input.canonicalPath),
		image: buildImageUrl(input.imagePath),
		datePublished: input.publishedDate,
		...(input.modifiedDate ? { dateModified: input.modifiedDate } : {}),
		author: {
			'@type': 'Person',
			name: input.authorName,
			...(input.authorUrl ? { url: input.authorUrl } : {})
		},
		publisher: {
			'@type': 'Organization',
			name: site.organization.name,
			logo: {
				'@type': 'ImageObject',
				url: buildImageUrl(site.organization.logo)
			}
		}
	};
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────

export interface BreadcrumbItem {
	name: string;
	/** Site-relative path. */
	path: string;
}

export function breadcrumbSchema(items: BreadcrumbItem[]): Record<string, unknown> {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: items.map((item, i) => ({
			'@type': 'ListItem',
			position: i + 1,
			name: item.name,
			item: buildCanonicalUrl(item.path)
		}))
	};
}

// ── Person ────────────────────────────────────────────────────────────────────

export interface PersonSchemaInput {
	name: string;
	url?: string;
	image?: string;
	jobTitle?: string;
	description?: string;
	sameAs?: string[];
}

export function personSchema(input: PersonSchemaInput): Record<string, unknown> {
	return {
		'@context': 'https://schema.org',
		'@type': 'Person',
		name: input.name,
		...(input.url ? { url: input.url } : {}),
		...(input.image ? { image: buildImageUrl(input.image) } : {}),
		...(input.jobTitle ? { jobTitle: input.jobTitle } : {}),
		...(input.description ? { description: input.description } : {}),
		...(input.sameAs?.length ? { sameAs: input.sameAs } : {})
	};
}

// ── LocalBusiness ─────────────────────────────────────────────────────────────
// Only use when the page represents a physical business location.

export interface LocalBusinessSchemaInput {
	name: string;
	description?: string;
	url?: string;
	telephone?: string;
	address: {
		streetAddress: string;
		addressLocality: string;
		addressRegion?: string;
		postalCode: string;
		addressCountry: string;
	};
	image?: string;
	openingHours?: string[];
	priceRange?: string;
}

export function localBusinessSchema(input: LocalBusinessSchemaInput): Record<string, unknown> {
	return {
		'@context': 'https://schema.org',
		'@type': 'LocalBusiness',
		name: input.name,
		...(input.description ? { description: input.description } : {}),
		url: input.url ?? site.url,
		...(input.telephone ? { telephone: input.telephone } : {}),
		address: {
			'@type': 'PostalAddress',
			...input.address
		},
		...(input.image ? { image: buildImageUrl(input.image) } : {}),
		...(input.openingHours?.length ? { openingHours: input.openingHours } : {}),
		...(input.priceRange ? { priceRange: input.priceRange } : {})
	};
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
// Only use when the page visibly shows questions and answers.

export interface FaqItem {
	question: string;
	answer: string;
}

export function faqSchema(items: FaqItem[]): Record<string, unknown> {
	return {
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: items.map((item) => ({
			'@type': 'Question',
			name: item.question,
			acceptedAnswer: {
				'@type': 'Answer',
				text: item.answer
			}
		}))
	};
}
