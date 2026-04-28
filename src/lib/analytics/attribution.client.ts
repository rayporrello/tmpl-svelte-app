/**
 * First-touch attribution capture.
 *
 * On first landing, captures UTM parameters, ad platform click IDs, and landing
 * page/referrer. Persists to localStorage (first-touch — never overwritten).
 * Provides a read function for forms to include attribution in their payloads.
 *
 * Privacy notes:
 *   - Only stores marketing signal parameters — no PII.
 *   - Does not capture form field values, names, emails, or message bodies.
 *   - Falls back gracefully when localStorage is blocked (private browsing, strict mode).
 *   - Does not automatically send attribution data anywhere. Forms include it
 *     explicitly when the server action reads getAttributionPayload().
 *
 * See docs/analytics/attribution-capture.md for the full privacy and usage guide.
 */

/** All captured UTM and click ID parameters. */
export interface AttributionPayload {
	utm_source?: string;
	utm_medium?: string;
	utm_campaign?: string;
	utm_term?: string;
	utm_content?: string;
	/** Google Ads click ID */
	gclid?: string;
	/** Google Ads enhanced conversion (web) */
	gbraid?: string;
	/** Google Ads enhanced conversion (app) */
	wbraid?: string;
	/** Meta (Facebook) click ID */
	fbclid?: string;
	/** Microsoft Ads click ID */
	msclkid?: string;
	/** URL of the first landing page in this session */
	landing_page?: string;
	/** document.referrer on first landing */
	initial_referrer?: string;
	/** ISO timestamp of first capture */
	first_seen_at?: string;
}

const STORAGE_KEY = 'tmpl_attribution';

const TRACKED_PARAMS: ReadonlyArray<keyof AttributionPayload> = [
	'utm_source',
	'utm_medium',
	'utm_campaign',
	'utm_term',
	'utm_content',
	'gclid',
	'gbraid',
	'wbraid',
	'fbclid',
	'msclkid',
];

/** Extract attribution parameters from a URL's search string. */
export function extractAttributionFromUrl(search: string): Partial<AttributionPayload> {
	const params = new URLSearchParams(search);
	const result: Partial<AttributionPayload> = {};

	for (const key of TRACKED_PARAMS) {
		const val = params.get(key);
		if (val) result[key] = val;
	}

	return result;
}

/** Read stored attribution payload. Returns null if nothing is stored or storage is unavailable. */
export function getAttributionPayload(): AttributionPayload | null {
	if (typeof window === 'undefined') return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		return JSON.parse(raw) as AttributionPayload;
	} catch {
		return null;
	}
}

/**
 * Capture first-touch attribution from the current page URL and referrer.
 * No-op on subsequent calls — first-touch means we never overwrite.
 * No-op during SSR.
 */
export function captureAttribution(): void {
	if (typeof window === 'undefined') return;

	try {
		const existing = localStorage.getItem(STORAGE_KEY);
		if (existing) return; // first-touch: already captured
	} catch {
		return; // localStorage blocked
	}

	const fromUrl = extractAttributionFromUrl(window.location.search);

	const payload: AttributionPayload = {
		...fromUrl,
		landing_page: window.location.href,
		initial_referrer: document.referrer || undefined,
		first_seen_at: new Date().toISOString(),
	};

	// Only persist if we captured at least one marketing signal
	const hasSignal =
		TRACKED_PARAMS.some((k) => k in fromUrl) ||
		(document.referrer && !document.referrer.includes(window.location.hostname));

	if (!hasSignal) return;

	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
	} catch {
		// Storage quota exceeded or blocked — degrade silently
	}
}
