import { error } from '@sveltejs/kit';
import { loadArticle, loadArticleEntries } from '$lib/content/articles';
import { renderMarkdown } from '$lib/content/markdown';
import type { EntryGenerator, PageServerLoad } from './$types';

export const prerender = 'auto';

export const entries: EntryGenerator = () => {
	return loadArticleEntries().map(({ article }) => ({ slug: article.slug }));
};

export const load: PageServerLoad = ({ params }) => {
	let article;
	try {
		article = loadArticle(params.slug);
	} catch {
		error(404, 'Article not found');
	}
	if (article.draft) {
		error(404, 'Article not found');
	}
	return {
		article,
		html: renderMarkdown(article.body, 'cms'),
		slug: params.slug,
	};
};
