/**
 * Server analytics event emitter.
 *
 * Call emitServerAnalyticsEvent() in server actions AFTER successful validation
 * and after the primary operation (email sent, DB insert, webhook fired) succeeds.
 *
 * Failure policy: analytics failures are logged as warnings and do not propagate.
 * A failed analytics call MUST NOT cause a successful form submission to appear
 * as an error to the user.
 *
 * The active provider defaults to the no-op provider. To activate a real backend:
 *   1. Import your provider (e.g. ga4MpProvider from ga4-measurement-protocol.example.ts)
 *   2. Call setAnalyticsProvider(ga4MpProvider) during app initialization
 *   3. Set ANALYTICS_SERVER_EVENTS_ENABLED=true in your env
 *
 * See docs/analytics/server-conversions.md.
 */

import { logger } from '$lib/server/logger';
import { noopProvider } from './noop-provider';
import type { ServerAnalyticsProvider, ServerAnalyticsEvent } from './types';

let activeProvider: ServerAnalyticsProvider = noopProvider;

/** Replace the active analytics provider. Call once at app startup if using a real backend. */
export function setAnalyticsProvider(provider: ServerAnalyticsProvider): void {
	activeProvider = provider;
}

/**
 * Emit a server-side analytics event.
 *
 * Safe to call from any server action. Failures are caught and logged — they
 * never propagate to the caller. Call ONLY after the primary operation succeeds.
 */
export async function emitServerAnalyticsEvent(
	event: Omit<ServerAnalyticsEvent, 'timestamp'> & { timestamp?: string }
): Promise<void> {
	const serverEventsEnabled = process.env.ANALYTICS_SERVER_EVENTS_ENABLED === 'true';
	if (!serverEventsEnabled) return;

	const fullEvent: ServerAnalyticsEvent = {
		...event,
		timestamp: event.timestamp ?? new Date().toISOString(),
	};

	try {
		await activeProvider.emit(fullEvent);
	} catch (err) {
		logger.warn('Server analytics event failed (non-fatal)', {
			eventName: event.name,
			error: String(err),
		});
	}
}
