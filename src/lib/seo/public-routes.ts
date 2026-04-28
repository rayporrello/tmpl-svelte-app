import { execFileSync } from 'node:child_process';
import { relative } from 'node:path';
import { loadArticleEntries, type ArticleEntry } from '$lib/content/articles';
import { routes, type RouteEntry } from './routes';

export type PublicRouteSource = 'static' | 'article';

export interface PublicRouteEntry extends RouteEntry {
	source: PublicRouteSource;
}

function isValidDate(value: string | undefined): value is string {
	if (!value) return false;
	return !Number.isNaN(new Date(value).getTime());
}

function dateOnly(value: string): string {
	return value.slice(0, 10);
}

function gitLastModified(sourcePath: string): string | undefined {
	try {
		const repoPath = relative(process.cwd(), sourcePath);
		const result = execFileSync('git', ['log', '-1', '--format=%cI', '--', repoPath], {
			cwd: process.cwd(),
			encoding: 'utf-8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
		return isValidDate(result) ? result : undefined;
	} catch {
		return undefined;
	}
}

export function getArticleLastmod(entry: ArticleEntry): string {
	const fallback = entry.article.modified_date ?? entry.article.date;
	return gitLastModified(entry.sourcePath) ?? fallback;
}

export function articleEntryToRoute(entry: ArticleEntry): PublicRouteEntry {
	return {
		path: `/articles/${entry.article.slug}`,
		title: entry.article.title,
		description: entry.article.description,
		indexable: true,
		changefreq: 'yearly',
		priority: 0.6,
		lastmod: dateOnly(getArticleLastmod(entry)),
		source: 'article',
	};
}

export function staticPublicRoutes(): PublicRouteEntry[] {
	return routes
		.filter((route) => route.indexable)
		.map((route) => ({
			...route,
			source: 'static' as const,
		}));
}

export function articlePublicRoutes(): PublicRouteEntry[] {
	return loadArticleEntries().map(articleEntryToRoute);
}

export function indexableRoutes(): PublicRouteEntry[] {
	return [...staticPublicRoutes(), ...articlePublicRoutes()];
}
