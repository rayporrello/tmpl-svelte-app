import type { Handle, HandleServerError } from '@sveltejs/kit';
import { getOrCreateRequestId } from '$lib/server/request-id';
import { logger } from '$lib/server/logger';
import { toSafeError } from '$lib/server/safe-error';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.requestId = getOrCreateRequestId(event.request);
	return resolve(event);
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
