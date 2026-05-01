import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = () => {
	return json({
		ok: true,
		service: 'tmpl-svelte-app',
		environment: process.env.NODE_ENV ?? 'development',
		time: new Date().toISOString(),
	});
};
