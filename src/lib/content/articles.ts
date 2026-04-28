import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import type { Article } from './types.js';

const ARTICLES_DIR = join(process.cwd(), 'content', 'articles');

export interface ArticleEntry {
	article: Article;
	filename: string;
	slug: string;
	sourcePath: string;
}

function optionalString(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeArticle(data: Omit<Article, 'body'>, body: string): Article {
	return {
		...data,
		body,
		modified_date: optionalString(data.modified_date),
		image: optionalString(data.image),
		image_alt: optionalString(data.image_alt),
		og_image: optionalString(data.og_image),
		og_image_alt: optionalString(data.og_image_alt),
	};
}

/**
 * Load a single article by slug.
 * Uses gray-matter for Markdown frontmatter files.
 * The Markdown body is returned as `body` (remapped from gray-matter's `.content`).
 */
export function loadArticle(slug: string): Article {
	const filepath = join(ARTICLES_DIR, `${slug}.md`);
	let raw: string;
	try {
		raw = readFileSync(filepath, 'utf-8');
	} catch {
		throw new Error(`Article not found: content/articles/${slug}.md`);
	}
	const { data, content } = matter(raw);
	return normalizeArticle(data as Omit<Article, 'body'>, content);
}

/**
 * Load all articles.
 * Drafts are excluded by default. Pass `{ includeDrafts: true }` to include them.
 * Results are sorted newest-first by date.
 */
export function loadArticles({ includeDrafts = false } = {}): Article[] {
	let entries: string[];
	try {
		entries = readdirSync(ARTICLES_DIR).filter((f: string) => f.endsWith('.md'));
	} catch {
		return [];
	}
	return entries
		.map((filename) => loadArticle(filename.replace(/\.md$/, '')))
		.filter((a) => includeDrafts || !a.draft)
		.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Load article files with source metadata for prerender entries, sitemaps, and feeds.
 */
export function loadArticleEntries({ includeDrafts = false } = {}): ArticleEntry[] {
	let filenames: string[];
	try {
		filenames = readdirSync(ARTICLES_DIR).filter((f: string) => f.endsWith('.md'));
	} catch {
		return [];
	}

	return filenames
		.map((filename) => {
			const slug = filename.replace(/\.md$/, '');
			return {
				article: loadArticle(slug),
				filename,
				slug,
				sourcePath: join(ARTICLES_DIR, filename),
			};
		})
		.filter((entry) => includeDrafts || !entry.article.draft)
		.sort((a, b) => new Date(b.article.date).getTime() - new Date(a.article.date).getTime());
}
