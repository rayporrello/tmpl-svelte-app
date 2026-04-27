import type { Handle, HandleServerError } from '@sveltejs/kit';
import { getOrCreateRequestId } from '$lib/server/request-id';
import { logger } from '$lib/server/logger';
import { toSafeError } from '$lib/server/safe-error';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.requestId = getOrCreateRequestId(event.request);
	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
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
	return { message: safe.publicMessage };
};
