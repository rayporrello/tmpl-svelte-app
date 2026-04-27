import type { Handle, HandleServerError } from '@sveltejs/kit';
import { getOrCreateRequestId } from '$lib/server/request-id';
import { logger } from '$lib/server/logger';
import { toSafeError } from '$lib/server/safe-error';
import { initEnv } from '$lib/server/env';
import { buildCsp } from '$lib/server/csp';

export const handle: Handle = async ({ event, resolve }) => {
	// Validate env vars on first request; no-op on subsequent calls.
	// Throws with a clear message if any required var is missing.
	initEnv();
	event.locals.requestId = getOrCreateRequestId(event.request);
	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	response.headers.set('Content-Security-Policy', buildCsp(event.url));
	return response;
};

export const handleError: HandleServerError = ({ error, event, status }) => {
	const safe = toSafeError(error);
	logger.error('Server error', {
		requestId: event.locals?.requestId,
		route: event.url?.pathname,
		status,
		...safe.diagnostic
	});
	return {
		message: safe.publicMessage,
		requestId: event.locals?.requestId
	};
};
