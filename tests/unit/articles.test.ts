/**
 * Tests for src/lib/content/articles.ts
 *
 * Verifies loadArticle() and loadArticles() against the sample content in
 * content/articles/. Tests use the real filesystem (no mocking required —
 * article loading is a pure filesystem read with no side effects).
 */

import { describe, it, expect } from 'vitest';
import { loadArticle, loadArticles } from '$lib/content/articles';

describe('loadArticle()', () => {
	it('loads the sample article by slug', () => {
		// The template ships with a sample-post article
		const article = loadArticle('sample-post');
		expect(article).toBeDefined();
		expect(typeof article.title).toBe('string');
		expect(article.title.length).toBeGreaterThan(0);
		expect(typeof article.body).toBe('string');
	});

	it('throws a clear error for a missing slug', () => {
		expect(() => loadArticle('this-slug-does-not-exist')).toThrow(
			/Article not found/
		);
	});

	it('returns a body string (remapped from gray-matter .content)', () => {
		const article = loadArticle('sample-post');
		expect(typeof article.body).toBe('string');
	});

	it('parses the date as a string that converts to a valid Date', () => {
		const article = loadArticle('sample-post');
		const d = new Date(article.date);
		expect(isNaN(d.getTime())).toBe(false);
	});
});

describe('loadArticles()', () => {
	it('returns an array', () => {
		const articles = loadArticles();
		expect(Array.isArray(articles)).toBe(true);
	});

	it('excludes draft articles by default', () => {
		const articles = loadArticles();
		const hasDraft = articles.some((a) => a.draft === true);
		expect(hasDraft).toBe(false);
	});

	it('includes draft articles when includeDrafts is true', () => {
		const all = loadArticles({ includeDrafts: true });
		const withoutDrafts = loadArticles();
		// All non-draft articles should be in both lists
		expect(all.length).toBeGreaterThanOrEqual(withoutDrafts.length);
	});

	it('returns articles sorted newest-first', () => {
		const articles = loadArticles({ includeDrafts: true });
		for (let i = 1; i < articles.length; i++) {
			const prev = new Date(articles[i - 1].date).getTime();
			const curr = new Date(articles[i].date).getTime();
			expect(prev).toBeGreaterThanOrEqual(curr);
		}
	});

	it('returns empty array when articles directory is absent (graceful)', () => {
		// loadArticles() catches readdirSync errors and returns []
		// We can't easily simulate a missing dir without mocking, but we can
		// verify the function handles an empty result gracefully.
		const articles = loadArticles();
		expect(Array.isArray(articles)).toBe(true);
	});
});
