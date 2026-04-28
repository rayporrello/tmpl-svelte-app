/**
 * Consent mode seam — types and helpers for Google Consent Mode v2.
 *
 * This is an ARCHITECTURE SEAM, not a cookie banner. It provides the typed
 * interface and dataLayer helpers so a project can wire up its own consent UI
 * (or a third-party CMP) without rethinking the plumbing.
 *
 * IMPORTANT: This file does not constitute legal advice. Consent requirements
 * vary by jurisdiction, user base, and whether you use ad tracking. See
 * docs/analytics/consent-and-privacy.md for guidance on when you need a banner.
 *
 * Default state: all consent signals are 'denied'. Analytics only collects data
 * after consent is granted (or if the project decides consent is not required).
 *
 * See: https://developers.google.com/tag-platform/security/concepts/consent-mode
 */

/** Google Consent Mode v2 storage types. */
export type ConsentValue = 'granted' | 'denied';

export interface AnalyticsConsent {
	/** Analytics cookies (GA4 session/user measurement) */
	analytics_storage: ConsentValue;
	/** Ad targeting cookies */
	ad_storage: ConsentValue;
	/** Whether user data may be used for ad personalization */
	ad_user_data: ConsentValue;
	/** Whether data may be used to personalize ads */
	ad_personalization: ConsentValue;
}

/** Safe default: all consent denied until explicitly granted. */
export const DEFAULT_CONSENT: AnalyticsConsent = {
	analytics_storage: 'denied',
	ad_storage: 'denied',
	ad_user_data: 'denied',
	ad_personalization: 'denied',
};

/** Full consent — use only when legally appropriate for the project and jurisdiction. */
export const FULL_CONSENT: AnalyticsConsent = {
	analytics_storage: 'granted',
	ad_storage: 'granted',
	ad_user_data: 'granted',
	ad_personalization: 'granted',
};

/** Analytics-only consent — appropriate when ad features are not used. */
export const ANALYTICS_ONLY_CONSENT: AnalyticsConsent = {
	analytics_storage: 'granted',
	ad_storage: 'denied',
	ad_user_data: 'denied',
	ad_personalization: 'denied',
};

type DataLayerWindow = Window & { dataLayer?: unknown[] };

/**
 * Push consent defaults to dataLayer. Call before GTM loads (in AnalyticsHead)
 * or immediately after initialization. GTM reads the default consent state and
 * adjusts tag behavior accordingly.
 */
export function pushConsentDefaults(consent: AnalyticsConsent = DEFAULT_CONSENT): void {
	if (typeof window === 'undefined') return;
	const w = window as DataLayerWindow;
	w.dataLayer = w.dataLayer || [];
	w.dataLayer.push(['consent', 'default', consent]);
}

/**
 * Update consent state — call after the user makes a consent choice.
 * Notifies GTM/GA4 to update tag behavior for the current session.
 */
export function updateConsent(consent: Partial<AnalyticsConsent>): void {
	if (typeof window === 'undefined') return;
	const w = window as DataLayerWindow;
	w.dataLayer = w.dataLayer || [];
	w.dataLayer.push(['consent', 'update', consent]);
}

/**
 * Build a partial consent update that grants analytics storage only.
 * Convenience helper for sites that use GA4 but not ad platforms.
 */
export function grantAnalyticsConsent(): void {
	updateConsent({ analytics_storage: 'granted' });
}
