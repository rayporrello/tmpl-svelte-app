import { loadArticles } from '$lib/content/index.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const articles = loadArticles();
	return { articles };
};
