import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import matter from 'gray-matter';
import { ArticleSchema } from './schemas.js';
import type { Article } from './types.js';
import {
	filenameSlugIssue,
	handleRuntimeContentFailure,
	makeContentIssue,
	validateWithSchema,
} from './validation.js';

const ARTICLES_DIR = join(process.cwd(), 'content', 'articles');

interface ArticleLoadOptions {
	articlesDir?: string;
}

interface ArticlesLoadOptions extends ArticleLoadOptions {
	includeDrafts?: boolean;
}

export interface ArticleEntry {
	article: Article;
	filename: string;
	slug: string;
	sourcePath: string;
}

function loadArticleRecord(
	slug: string,
	{ articlesDir = ARTICLES_DIR }: ArticleLoadOptions = {}
): Article | undefined {
	const filepath = join(articlesDir, `${slug}.md`);
	const fileLabel = relative(process.cwd(), filepath);
	let raw: string;
	try {
		raw = readFileSync(filepath, 'utf-8');
	} catch {
		throw new Error(`Article not found: ${fileLabel}`);
	}

	if (!raw.startsWith('---')) {
		return handleRuntimeContentFailure<Article>('articles', fileLabel, [
			makeContentIssue(fileLabel, '(frontmatter)', 'must start with YAML frontmatter', undefined),
		]);
	}

	let parsed: { data: Record<string, unknown>; content: string };
	try {
		parsed = matter(raw) as { data: Record<string, unknown>; content: string };
	} catch (err) {
		return handleRuntimeContentFailure<Article>('articles', fileLabel, [
			makeContentIssue(
				fileLabel,
				'(frontmatter)',
				'frontmatter YAML parse error',
				err instanceof Error ? err.message : String(err)
			),
		]);
	}

	const candidate = { ...parsed.data, body: parsed.content };
	const result = validateWithSchema(ArticleSchema, candidate, fileLabel);
	if (!result.success)
		return handleRuntimeContentFailure<Article>('articles', fileLabel, result.issues);

	const slugIssue = filenameSlugIssue(fileLabel, result.output.slug, slug);
	if (slugIssue) return handleRuntimeContentFailure<Article>('articles', fileLabel, [slugIssue]);

	return result.output;
}

/**
 * Load a single article by slug.
 * Uses gray-matter for Markdown frontmatter files.
 * The Markdown body is returned as `body` (remapped from gray-matter's `.content`).
 */
export function loadArticle(slug: string, options: ArticleLoadOptions = {}): Article {
	const article = loadArticleRecord(slug, options);
	if (!article) throw new Error(`Article not found: content/articles/${slug}.md`);
	return article;
}

/**
 * Load all articles.
 * Drafts are excluded by default. Pass `{ includeDrafts: true }` to include them.
 * Results are sorted newest-first by date.
 */
export function loadArticles({
	includeDrafts = false,
	articlesDir = ARTICLES_DIR,
}: ArticlesLoadOptions = {}): Article[] {
	let entries: string[];
	try {
		entries = readdirSync(articlesDir).filter((f: string) => f.endsWith('.md'));
	} catch {
		return [];
	}
	return entries
		.map((filename) => loadArticleRecord(filename.replace(/\.md$/, ''), { articlesDir }))
		.filter((article): article is Article => article !== undefined)
		.filter((a) => includeDrafts || !a.draft)
		.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Load article files with source metadata for prerender entries, sitemaps, and feeds.
 */
export function loadArticleEntries({
	includeDrafts = false,
	articlesDir = ARTICLES_DIR,
}: ArticlesLoadOptions = {}): ArticleEntry[] {
	let filenames: string[];
	try {
		filenames = readdirSync(articlesDir).filter((f: string) => f.endsWith('.md'));
	} catch {
		return [];
	}

	return filenames
		.map((filename) => {
			const slug = filename.replace(/\.md$/, '');
			const article = loadArticleRecord(slug, { articlesDir });
			if (!article) return undefined;
			return {
				article,
				filename,
				slug,
				sourcePath: join(articlesDir, filename),
			};
		})
		.filter((entry): entry is ArticleEntry => entry !== undefined)
		.filter((entry) => includeDrafts || !entry.article.draft)
		.sort((a, b) => new Date(b.article.date).getTime() - new Date(a.article.date).getTime());
}
