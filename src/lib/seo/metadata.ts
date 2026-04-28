import { site } from '$lib/config/site';
import type { PageSeoInput, ResolvedPageSeo, RobotsDirective } from './types';

/** Resolve a canonical URL from a path. Never uses $page.url.href to avoid
 *  dev/staging URLs leaking into production metadata. */
export function buildCanonicalUrl(canonicalPath: string): string {
	const base = site.url.replace(/\/$/, '');
	const path = canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`;
	return `${base}${path}`;
}

/** Resolve an image path to a full URL. Absolute URLs are returned unchanged. */
export function buildImageUrl(imagePathOrUrl: string): string {
	if (imagePathOrUrl.startsWith('http://') || imagePathOrUrl.startsWith('https://')) {
		return imagePathOrUrl;
	}
	const base = site.url.replace(/\/$/, '');
	const path = imagePathOrUrl.startsWith('/') ? imagePathOrUrl : `/${imagePathOrUrl}`;
	return `${base}${path}`;
}

/** Apply the site title template. */
export function buildTitle(pageTitle: string): string {
	if (!site.titleTemplate.includes('%s')) return pageTitle;
	return site.titleTemplate.replace('%s', pageTitle);
}

export function buildRobots(input: PageSeoInput): RobotsDirective {
	if (input.robots) return input.robots;
	return site.indexing ? 'index, follow' : 'noindex, nofollow';
}

/**
 * Resolve the share image + alt for an article using the documented priority:
 *   1. og_image (explicit OG override)
 *   2. image    (article feature image)
 *   3. site.defaultOgImage (global fallback, applied later by resolvePageSeo)
 *
 * For (1) and (2), alt text follows the same priority: og_image_alt → image_alt → article.title.
 * Returns `image: undefined` when neither is set so resolvePageSeo can fall through
 * to the site default. Pass the result straight into a PageSeoInput.
 */
export function resolveArticleShareImage(article: {
	title: string;
	image?: string;
	image_alt?: string;
	og_image?: string;
	og_image_alt?: string;
}): { image: string | undefined; imageAlt: string } {
	const image = article.og_image || article.image || undefined;
	const imageAlt = article.og_image_alt || article.image_alt || article.title;
	return { image, imageAlt };
}

/** Merge page-level SEO input with site defaults to produce a fully resolved object. */
export function resolvePageSeo(input: PageSeoInput): ResolvedPageSeo {
	return {
		title: buildTitle(input.title),
		description: input.description,
		canonicalUrl: buildCanonicalUrl(input.canonicalPath),
		imageUrl: buildImageUrl(input.image ?? site.defaultOgImage),
		imageAlt: input.imageAlt ?? input.title,
		type: input.type ?? 'website',
		robots: buildRobots(input),
		publishedDate: input.publishedDate,
		modifiedDate: input.modifiedDate,
		schema: input.schema,
	};
}
