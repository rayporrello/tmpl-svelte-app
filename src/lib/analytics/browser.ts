/**
 * Browser-side analytics initializer.
 *
 * Responsibilities:
 *   - Ensure window.dataLayer exists so any pre-GTM pushes (consent defaults,
 *     attribution events) are safely queued before the GTM container loads.
 *   - Guard all operations against SSR (window is not defined server-side).
 *
 * The {event:'gtm.js', gtm.start} initialization push is owned by the GTM head
 * snippet in AnalyticsHead.svelte. This module MUST NOT duplicate it — GTM
 * processes every item pushed to dataLayer and a second gtm.js event can trigger
 * duplicate tag firings on "All Pages"-style triggers.
 *
 * This module does NOT push page_view events — see pageview.ts for SPA navigation tracking.
 * This module does NOT enable analytics — that is controlled by env vars and AnalyticsHead.svelte.
 */

let initialized = false;

/**
 * Ensure window.dataLayer exists. No-op during SSR and on subsequent calls.
 *
 * Call this before pushing consent defaults or other pre-GTM events. When GTM is
 * active its head snippet already creates the array — this is a safe guard for
 * cases where it may not have run yet (e.g. Cloudflare-only mode, tests).
 */
export function initDataLayer(): void {
	if (typeof window === 'undefined') return;
	if (initialized) return;

	const w = window as Window & { dataLayer?: unknown[] };
	w.dataLayer = w.dataLayer || [];
	// Do NOT push {event:'gtm.js'} here — the GTM head snippet owns that push.
	// Pushing it again from onMount causes GTM to process a duplicate initialization
	// event which can fire "All Pages" triggers a second time.

	initialized = true;
}

/**
 * Reset initialization state. Only for testing — never call in application code.
 * @internal
 */
export function _resetForTesting(): void {
	initialized = false;
}
