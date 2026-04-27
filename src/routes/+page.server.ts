import type { PageServerLoad } from './$types';
import { loadHomePage } from '$lib/content/index';

export const load: PageServerLoad = async () => {
	const home = loadHomePage();
	return { home };
};
