/**
 * Server analytics types — typed conversion events and provider interface.
 *
 * Server events exist to record conversions after server-side validation succeeds.
 * They complement browser GTM/GA4 collection — they do not replace it.
 *
 * Rules:
 *   - Fire server events ONLY after validation/action success (not on form load).
 *   - Include an eventId for deduplication — useful when ad platforms are added later.
 *   - Never include raw message bodies, names, email addresses, or other PII.
 *   - Analytics failures MUST NOT break a successful form submission.
 *
 * See docs/analytics/server-conversions.md for full usage guide.
 */

import type { AttributionPayload } from '$lib/analytics/attribution.client';
import type { AnalyticsConsent } from '$lib/analytics/consent';

/** Approved server-side event names. */
export type ServerEventName = 'generate_lead' | 'newsletter_subscribed' | 'custom_conversion';

/** Base server analytics event. */
export interface ServerAnalyticsEvent {
	/** Event name — use approved names from ServerEventName. */
	name: ServerEventName;
	/** Opaque deduplication ID — use crypto.randomUUID() or a DB-generated ID. */
	eventId?: string;
	/** ISO timestamp — defaults to now if omitted. */
	timestamp?: string;
	/** Optional attribution payload from the client (read from form hidden field). */
	attribution?: AttributionPayload;
	/** Optional consent state for ad-platform APIs that require it. */
	consent?: Partial<AnalyticsConsent>;
	/** Arbitrary additional metadata. Must not contain PII. */
	metadata?: Record<string, string | number | boolean>;
}

/**
 * Provider interface for server analytics backends.
 *
 * Implement this to send events to GA4 Measurement Protocol, Meta CAPI,
 * Google Ads, or any other server-side analytics endpoint. The template
 * ships with a no-op provider by default — activate a real provider per project.
 *
 * See docs/analytics/server-conversions.md for how to add a provider.
 */
export interface ServerAnalyticsProvider {
	emit(event: ServerAnalyticsEvent): Promise<void>;
}
