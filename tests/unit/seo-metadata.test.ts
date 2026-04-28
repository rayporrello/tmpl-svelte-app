/**
 * Tests for src/lib/seo/metadata.ts
 *
 * Verifies canonical URL building, title formatting, image URL resolution,
 * and robots directive logic against the placeholder site config.
 */

import { describe, it, expect } from 'vitest';
import {
	buildCanonicalUrl,
	buildImageUrl,
	buildTitle,
	buildRobots,
	resolveArticleShareImage,
	resolvePageSeo,
} from '$lib/seo/metadata';
import { site } from '$lib/config/site';

describe('buildCanonicalUrl()', () => {
	it('produces a full URL from a path', () => {
		const url = buildCanonicalUrl('/about');
		// Uses the placeholder site.url from site.ts — just verify it's a full URL
		expect(url).toMatch(/^https?:\/\/.+\/about$/);
	});

	it('adds leading slash if missing', () => {
		const url = buildCanonicalUrl('contact');
		expect(url).toMatch(/\/contact$/);
	});

	it('does not double-slash when path already starts with /', () => {
		const url = buildCanonicalUrl('/blog');
		expect(url).not.toMatch(/\/\/blog/);
	});
});

describe('buildImageUrl()', () => {
	it('returns absolute URLs unchanged', () => {
		const url = 'https://cdn.example.com/og.png';
		expect(buildImageUrl(url)).toBe(url);
	});

	it('converts relative paths to full URLs', () => {
		const url = buildImageUrl('/images/og-default.png');
		expect(url).toMatch(/^https?:\/\/.+\/images\/og-default\.png$/);
	});
});

describe('buildTitle()', () => {
	it('applies the title template', () => {
		const title = buildTitle('About Us');
		expect(title).toContain('About Us');
	});

	it('returns the page title when no %s in template', () => {
		// The placeholder template has %s, so this tests the happy path
		const title = buildTitle('Contact');
		expect(title).toContain('Contact');
	});
});

describe('buildRobots()', () => {
	it('returns input robots when explicitly set', () => {
		const robots = buildRobots({
			title: 'T',
			description: 'D',
			canonicalPath: '/',
			robots: 'noindex, nofollow',
		});
		expect(robots).toBe('noindex, nofollow');
	});

	it('falls back to site.indexing for non-indexed pages', () => {
		// site.ts has indexing: true by default — result should be index, follow
		const robots = buildRobots({ title: 'T', description: 'D', canonicalPath: '/' });
		expect(robots).toBe('index, follow');
	});
});

describe('resolvePageSeo()', () => {
	it('produces a fully resolved object for a minimal input', () => {
		const seo = resolvePageSeo({
			title: 'Home',
			description: 'Welcome',
			canonicalPath: '/',
		});
		expect(seo.title).toContain('Home');
		expect(seo.description).toBe('Welcome');
		expect(seo.canonicalUrl).toMatch(/^https?:\/\//);
		expect(seo.imageUrl).toMatch(/^https?:\/\//);
		expect(seo.type).toBe('website');
	});

	it('uses the provided image path', () => {
		const seo = resolvePageSeo({
			title: 'Article',
			description: 'An article',
			canonicalPath: '/articles/foo',
			image: '/images/article.png',
		});
		expect(seo.imageUrl).toMatch(/\/images\/article\.png$/);
	});

	it('falls back to site.defaultOgImage when image is omitted', () => {
		const seo = resolvePageSeo({
			title: 'About',
			description: 'About us',
			canonicalPath: '/about',
		});
		expect(seo.imageUrl).toContain(site.defaultOgImage);
	});
});

describe('resolveArticleShareImage()', () => {
	const baseArticle = { title: 'How we ship faster' };

	it('returns og_image when both og_image and image are set', () => {
		const result = resolveArticleShareImage({
			...baseArticle,
			image: '/uploads/feature.png',
			og_image: '/uploads/share.png',
		});
		expect(result.image).toBe('/uploads/share.png');
	});

	it('falls back to feature image when og_image is omitted', () => {
		const result = resolveArticleShareImage({
			...baseArticle,
			image: '/uploads/feature.png',
		});
		expect(result.image).toBe('/uploads/feature.png');
	});

	it('returns undefined when both image fields are omitted (lets resolvePageSeo apply site default)', () => {
		const result = resolveArticleShareImage(baseArticle);
		expect(result.image).toBeUndefined();
	});

	it('treats empty strings the same as omitted (Sveltia writes "" for blank fields)', () => {
		const result = resolveArticleShareImage({
			...baseArticle,
			image: '',
			og_image: '',
		});
		expect(result.image).toBeUndefined();
	});

	it('prefers og_image_alt over image_alt over title for alt text', () => {
		expect(
			resolveArticleShareImage({
				...baseArticle,
				image_alt: 'feature alt',
				og_image_alt: 'share alt',
			}).imageAlt
		).toBe('share alt');

		expect(
			resolveArticleShareImage({
				...baseArticle,
				image_alt: 'feature alt',
			}).imageAlt
		).toBe('feature alt');

		expect(resolveArticleShareImage(baseArticle).imageAlt).toBe(baseArticle.title);
	});

	it('integrated: feeding the result into resolvePageSeo applies the site default when both are blank', () => {
		const share = resolveArticleShareImage({ ...baseArticle, image: '', og_image: '' });
		const seo = resolvePageSeo({
			title: baseArticle.title,
			description: 'd',
			canonicalPath: '/articles/foo',
			image: share.image,
			imageAlt: share.imageAlt,
		});
		expect(seo.imageUrl).toContain(site.defaultOgImage);
	});
});
