/**
 * Analytics event taxonomy — typed event names and push helpers.
 *
 * Rules:
 *   - All event names are snake_case.
 *   - Use GA4 recommended event names where available (see event-taxonomy.md).
 *   - Do not send PII or raw form message bodies in any event payload.
 *   - Do not invent one-off event names — add them here and to docs/analytics/event-taxonomy.md.
 *   - Call helpers only after checking that analytics is enabled (the helpers guard internally).
 *
 * These helpers push to window.dataLayer. GTM picks them up via Custom Event triggers.
 * GA4 is configured inside GTM — do not add direct gtag() calls when GTM is active.
 */

/** Approved browser-side event names. See docs/analytics/event-taxonomy.md. */
export type AnalyticsEventName =
	| 'page_view'
	| 'generate_lead'
	| 'newsletter_subscribed'
	| 'form_submitted'
	| 'form_error'
	| 'outbound_link_click'
	| 'file_download'
	| 'cta_click';

/** Base shape for all analytics events. */
export interface AnalyticsEvent {
	event: AnalyticsEventName;
	[key: string]: unknown;
}

export interface PageViewEvent {
	event: 'page_view';
	page_location: string;
	page_path: string;
	page_title: string;
	page_referrer: string;
	route_id?: string;
}

export interface CtaClickEvent {
	event: 'cta_click';
	cta_text: string;
	cta_location?: string;
}

export interface OutboundLinkEvent {
	event: 'outbound_link_click';
	link_url: string;
	link_text?: string;
}

export interface GenerateLeadEvent {
	event: 'generate_lead';
	/** Opaque ID — do not include name, email, or message content. */
	event_id?: string;
	form_name?: string;
}

export interface FormSubmittedEvent {
	event: 'form_submitted';
	form_name?: string;
}

export interface FormErrorEvent {
	event: 'form_error';
	form_name?: string;
	error_type?: string;
}

/** Push any typed analytics event to dataLayer. No-op during SSR or when disabled. */
export function trackEvent(eventPayload: AnalyticsEvent): void {
	if (typeof window === 'undefined') return;
	const dl = (window as Window & { dataLayer?: unknown[] }).dataLayer;
	if (!dl) return;
	dl.push(eventPayload);
}

/** Track a page view. Use pageview.ts for SvelteKit SPA navigation — this is the raw helper. */
export function trackPageView(input: Omit<PageViewEvent, 'event'>): void {
	trackEvent({ event: 'page_view', ...input });
}

/** Track a CTA button click. */
export function trackCtaClick(input: Omit<CtaClickEvent, 'event'>): void {
	trackEvent({ event: 'cta_click', ...input });
}

/** Track an outbound link click. Call from the link's click handler. */
export function trackOutboundLink(input: Omit<OutboundLinkEvent, 'event'>): void {
	trackEvent({ event: 'outbound_link_click', ...input });
}

/** Track a lead generation event after server-side validation succeeds. */
export function trackGenerateLead(input: Omit<GenerateLeadEvent, 'event'> = {}): void {
	trackEvent({ event: 'generate_lead', ...input });
}
