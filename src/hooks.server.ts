import type { Handle, HandleServerError } from '@sveltejs/kit';
import { building } from '$app/environment';
import { getOrCreateRequestId } from '$lib/server/request-id';
import { logger } from '$lib/server/logger';
import { toSafeError } from '$lib/server/safe-error';
import { initEnv } from '$lib/server/env';
import { applySecurityHeaders } from '$lib/server/security-headers';
import { handleSmokeContactRequest } from '$lib/server/forms/contact-action';

export const handle: Handle = async ({ event, resolve }) => {
	// Validate env vars on first runtime request; no-op on subsequent calls.
	// During SvelteKit prerender/build there is no runtime environment yet.
	if (!building) initEnv();
	event.locals.requestId = getOrCreateRequestId(event.request);
	const smokeResponse = await handleSmokeContactRequest(event);
	const response = smokeResponse ?? (await resolve(event));
	applySecurityHeaders(response.headers, event.url, { method: event.request.method });
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
