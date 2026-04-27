import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import type { Article } from './types.js';

const ARTICLES_DIR = join(process.cwd(), 'content', 'articles');

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
	return { ...(data as Omit<Article, 'body'>), body: content };
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
