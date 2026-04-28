/**
 * GA4 Measurement Protocol provider — EXAMPLE / DORMANT.
 *
 * ⚠️  This file is not imported by default. It is a documented upgrade path.
 *
 * IMPORTANT CAVEATS (from Google's own documentation):
 *   - GA4 Measurement Protocol is designed to AUGMENT browser-collected events
 *     (via GTM/gtag), not replace them. Pure server-to-server GA4 may result in
 *     incomplete session data, missing attribution, and partial reporting.
 *   - Use this for trusted server-side conversions (e.g. payment confirmed) that
 *     complement, not replace, the browser GTM collection.
 *   - See: https://developers.google.com/analytics/devguides/collection/protocol/ga4
 *
 * To activate:
 *   1. Set ANALYTICS_SERVER_EVENTS_ENABLED=true in your env.
 *   2. Set GA4_MEASUREMENT_ID and GA4_MEASUREMENT_PROTOCOL_API_SECRET in your env.
 *   3. In src/hooks.server.ts, add at the top of the handle function (or in a one-time
 *      initialization block):
 *        import { setAnalyticsProvider } from '$lib/server/analytics/events';
 *        import { ga4MpProvider } from '$lib/server/analytics/ga4-measurement-protocol.example';
 *        setAnalyticsProvider(ga4MpProvider);
 *      Do NOT call setAnalyticsProvider from events.ts itself — that file is the emitter,
 *      not the configuration point.
 *
 * See docs/analytics/server-conversions.md for the full activation guide.
 */

import type { ServerAnalyticsProvider, ServerAnalyticsEvent } from './types';
import { logger } from '$lib/server/logger';

const GA4_MP_ENDPOINT = 'https://www.google-analytics.com/mp/collect';

/** GA4 Measurement Protocol event shape. */
interface Ga4MpPayload {
	client_id: string;
	events: Array<{
		name: string;
		params?: Record<string, string | number | boolean>;
	}>;
}

function buildPayload(event: ServerAnalyticsEvent): Ga4MpPayload {
	return {
		// client_id should ideally come from the GA4 cookie (_ga) set by GTM/browser.
		// Hardcoded fallback here — wire the real client_id from form/session in production.
		client_id: 'server-generated',
		events: [
			{
				name: event.name,
				params: {
					...(event.eventId ? { event_id: event.eventId } : {}),
					...(event.metadata ?? {}),
					// Do NOT include PII (names, emails, message content) in params.
				},
			},
		],
	};
}

/**
 * GA4 Measurement Protocol provider.
 *
 * Requires: GA4_MEASUREMENT_ID and GA4_MEASUREMENT_PROTOCOL_API_SECRET env vars.
 */
export const ga4MpProvider: ServerAnalyticsProvider = {
	async emit(event: ServerAnalyticsEvent): Promise<void> {
		const measurementId = process.env.GA4_MEASUREMENT_ID;
		const apiSecret = process.env.GA4_MEASUREMENT_PROTOCOL_API_SECRET;

		if (!measurementId || !apiSecret) {
			logger.warn(
				'GA4 MP provider: GA4_MEASUREMENT_ID or GA4_MEASUREMENT_PROTOCOL_API_SECRET missing — skipping'
			);
			return;
		}

		const url = `${GA4_MP_ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
		const payload = buildPayload(event);

		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			throw new Error(`GA4 MP request failed: ${response.status} ${response.statusText}`);
		}
	},
};
