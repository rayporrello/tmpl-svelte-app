import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { isShuttingDown } from '$lib/server/lifecycle';

export const GET: RequestHandler = () => {
	if (isShuttingDown()) {
		return json(
			{
				ok: false,
				draining: true,
				service: 'tmpl-svelte-app',
				environment: process.env.NODE_ENV ?? 'development',
				time: new Date().toISOString(),
			},
			{
				status: 503,
				headers: {
					Connection: 'close',
				},
			}
		);
	}

	return json({
		ok: true,
		service: 'tmpl-svelte-app',
		environment: process.env.NODE_ENV ?? 'development',
		time: new Date().toISOString(),
	});
};
