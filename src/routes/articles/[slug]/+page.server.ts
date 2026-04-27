import { error } from '@sveltejs/kit';
import { loadArticle } from '$lib/content/articles';
import { renderMarkdown } from '$lib/content/markdown';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	let article;
	try {
		article = loadArticle(params.slug);
	} catch {
		error(404, 'Article not found');
	}
	return {
		article,
		html: renderMarkdown(article.body, 'cms'),
		slug: params.slug
	};
};
