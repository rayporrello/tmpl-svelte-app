import type { Handle, HandleServerError } from '@sveltejs/kit';
import { building } from '$app/environment';
import { getOrCreateRequestId } from '$lib/server/request-id';
import { logger } from '$lib/server/logger';
import { toSafeError } from '$lib/server/safe-error';
import { initEnv } from '$lib/server/env';
import { buildCsp } from '$lib/server/csp';

export const handle: Handle = async ({ event, resolve }) => {
	// Validate env vars on first runtime request; no-op on subsequent calls.
	// During SvelteKit prerender/build there is no runtime environment yet.
	if (!building) initEnv();
	event.locals.requestId = getOrCreateRequestId(event.request);
	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	response.headers.set('Content-Security-Policy', buildCsp(event.url));
	// HSTS defense-in-depth: Caddy is canonical (deploy/Caddyfile.example) but
	// this app may be deployed behind a different proxy (CF Tunnel, etc.).
	if (event.url.protocol === 'https:') {
		response.headers.set(
			'Strict-Transport-Security',
			'max-age=31536000; includeSubDomains; preload'
		);
	}
	return response;
};

export const handleError: HandleServerError = ({ error, event, status }) => {
	const safe = toSafeError(error);
	logger.error('Server error', {
		requestId: event.locals?.requestId,
		route: event.url?.pathname,
		status,
		...safe.diagnostic,
	});
	return {
		message: safe.publicMessage,
		requestId: event.locals?.requestId,
	};
};
