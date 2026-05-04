import type { LayoutServerLoad } from './$types';
export const load: LayoutServerLoad = async () => {
	if (process.env.NODE_ENV === 'production') return { devWarnings: [] };

	const { getDevSetupWarnings } = await import('$lib/server/launch-blockers');

	return {
		devWarnings: await getDevSetupWarnings(),
	};
};
