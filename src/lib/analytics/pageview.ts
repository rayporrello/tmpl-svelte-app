/**
 * SPA page view tracking for SvelteKit.
 *
 * SvelteKit is a single-page app after initial load. Browser navigations happen
 * client-side without full page reloads, so GTM's History Change trigger alone
 * is unreliable. This module emits explicit dataLayer page_view events on every
 * SvelteKit navigation, giving GTM a deterministic signal to fire GA4.
 *
 * See: https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications
 *
 * Usage: call initPageTracking() once in your root +layout.svelte after the
 * AnalyticsHead component has injected GTM. The afterNavigate callback handles
 * both the initial client-side load and all subsequent navigations.
 *
 * Duplicate guard: the first navigation fires after hydration. We skip it when
 * GTM itself would already have counted the initial server-rendered page view.
 * Actually, since SvelteKit renders server-side and GTM fires on initial load,
 * we do want to fire a page_view on the first afterNavigate too — GTM's initial
 * page view fires from the GTM container load, but the SvelteKit page_view event
 * in dataLayer is the trigger we configure GA4 tags to listen for. Both the GTM
 * container's initial load and subsequent SvelteKit navigations should push this
 * event so the GA4 trigger count is consistent.
 */

import { afterNavigate } from '$app/navigation';
import { trackPageView } from './events';

let trackingActive = false;

/**
 * Initialize SPA page view tracking. Call once in root +layout.svelte.
 * No-op if called again (guards against hot-reload double registration).
 */
export function initPageTracking(): void {
	if (typeof window === 'undefined') return;
	if (trackingActive) return;
	trackingActive = true;

	afterNavigate((navigation) => {
		const to = navigation.to;
		if (!to) return;

		trackPageView({
			page_location: window.location.href,
			page_path: to.url.pathname + to.url.search,
			page_title: document.title,
			page_referrer: navigation.from?.url.href ?? document.referrer,
			route_id: to.route?.id ?? undefined,
		});
	});
}

/**
 * Reset tracking state. Only for testing — never call in application code.
 * @internal
 */
export function _resetForTesting(): void {
	trackingActive = false;
}
