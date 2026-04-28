import { site } from '$lib/config/site';
import { buildCanonicalUrl } from './metadata';
import { articleEntryToRoute } from './public-routes';
import { loadArticleEntries, type ArticleEntry } from '$lib/content/articles';

function xmlEscape(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function rssDate(value: string): string {
	return new Date(value).toUTCString();
}

function newestDate(entries: ArticleEntry[]): string | undefined {
	const times = entries
		.map((entry) => {
			const route = articleEntryToRoute(entry);
			return new Date(route.lastmod ?? entry.article.date).getTime();
		})
		.filter((time) => !Number.isNaN(time));

	if (times.length === 0) return undefined;
	return new Date(Math.max(...times)).toUTCString();
}

function articleItem(entry: ArticleEntry): string {
	const url = buildCanonicalUrl(`/articles/${entry.article.slug}`);
	return [
		'    <item>',
		`      <title>${xmlEscape(entry.article.title)}</title>`,
		`      <link>${xmlEscape(url)}</link>`,
		`      <guid isPermaLink="true">${xmlEscape(url)}</guid>`,
		`      <description>${xmlEscape(entry.article.description)}</description>`,
		`      <pubDate>${rssDate(entry.article.date)}</pubDate>`,
		'    </item>',
	].join('\n');
}

export function generateRssXml(entries = loadArticleEntries()): string {
	const base = site.url.replace(/\/$/, '');
	const items = entries.map(articleItem).join('\n');
	const lastBuildDate = newestDate(entries);
	const channel = [
		'  <channel>',
		`    <title>${xmlEscape(`${site.name} Articles`)}</title>`,
		`    <link>${xmlEscape(`${base}/articles`)}</link>`,
		`    <description>${xmlEscape(site.defaultDescription)}</description>`,
		`    <language>${xmlEscape(site.locale.replace('_', '-'))}</language>`,
		'    <generator>tmpl-svelte-app</generator>',
		lastBuildDate ? `    <lastBuildDate>${lastBuildDate}</lastBuildDate>` : undefined,
		items,
		'  </channel>',
	].filter(Boolean);

	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<rss version="2.0">',
		...channel,
		'</rss>',
	].join('\n');
}
