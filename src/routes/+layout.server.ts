import type { LayoutServerLoad } from './$types';
import { getDevSetupWarnings } from '$lib/server/launch-blockers';

export const load: LayoutServerLoad = async () => {
	if (process.env.NODE_ENV === 'production') return { devWarnings: [] };

	return {
		devWarnings: await getDevSetupWarnings(),
	};
};
