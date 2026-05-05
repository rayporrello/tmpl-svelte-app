import { buildCsp } from './csp';

// HSTS baseline: 1 year, no includeSubDomains, no preload.
// includeSubDomains is opt-in (only when every subdomain is HTTPS-ready).
// preload is opt-in only — it is a long-lived browser-list commitment that is
// slow and painful to reverse. See docs/deployment/runbook.md → HSTS for the
// stronger forms and when to use them.
export const STRICT_TRANSPORT_SECURITY = 'max-age=31536000';
export const X_CONTENT_TYPE_OPTIONS = 'nosniff';
export const REFERRER_POLICY = 'strict-origin-when-cross-origin';
export const X_FRAME_OPTIONS = 'DENY';
export const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=()';
export const NO_STORE_CACHE_CONTROL = 'no-store';

const SENSITIVE_PATH_PREFIXES = ['/admin', '/preview', '/draft'];
const FORM_RESULT_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function shouldNoStoreResponse(url: URL, method = 'GET'): boolean {
	if (SENSITIVE_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return true;
	return FORM_RESULT_METHODS.has(method.toUpperCase());
}

export function applySecurityHeaders(
	headers: Headers,
	url: URL,
	options: { method?: string } = {}
): void {
	headers.set('X-Content-Type-Options', X_CONTENT_TYPE_OPTIONS);
	headers.set('Referrer-Policy', REFERRER_POLICY);
	headers.set('X-Frame-Options', X_FRAME_OPTIONS);
	headers.set('Permissions-Policy', PERMISSIONS_POLICY);
	headers.set('Content-Security-Policy', buildCsp(url));

	// HSTS defense-in-depth: Caddy is canonical, but app-level HTTPS responses
	// keep the header present behind alternate proxies.
	if (url.protocol === 'https:') {
		headers.set('Strict-Transport-Security', STRICT_TRANSPORT_SECURITY);
	}

	if (shouldNoStoreResponse(url, options.method)) {
		headers.set('Cache-Control', NO_STORE_CACHE_CONTROL);
	}
}
