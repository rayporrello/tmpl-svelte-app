/**
 * Content Security Policy builder.
 *
 * Builds a per-request CSP string from static defaults, applying a more
 * permissive policy for the /admin route (Sveltia CMS loads from unpkg.com).
 *
 * Extension points are documented inline. To widen a directive for a specific
 * project feature (analytics, external CDN, form endpoints, etc.), edit the
 * relevant array below. See ADR-019 for the full ownership and extension guide.
 */

type CspDirectives = Record<string, string[]>;

function buildDirectives(isAdmin: boolean): CspDirectives {
	const base: CspDirectives = {
		// Catch-all for unlisted fetch types.
		'default-src': ["'self'"],

		// Images: allow data URIs for inline base64 images.
		// Add external CDN origins here when using a CMS media CDN or image host:
		//   'img-src': ["'self'", 'data:', 'https://cdn.example.com'],
		'img-src': ["'self'", 'data:'],

		// 'unsafe-inline' is required because SvelteKit injects styles as inline
		// style attributes during SSR. Nonce upgrade is deferred to Phase 5.
		'style-src': ["'self'", "'unsafe-inline'"],

		// Connect (fetch, XHR, WebSocket). Add analytics or webhook hosts here:
		//   'connect-src': ["'self'", 'https://plausible.io'],
		// Forms module: the contact form submits to same-origin SvelteKit actions —
		// no external connect-src is required. If you add a client-side fetch to an
		// email or webhook API (e.g. n8n, Postmark), add its origin here:
		//   'connect-src': ["'self'", 'https://api.postmarkapp.com'],
		//   'connect-src': ["'self'", 'https://your-n8n.example.com'],
		'connect-src': ["'self'"],

		// Stricter than X-Frame-Options: DENY — both are set for belt-and-suspenders.
		'frame-ancestors': ["'none'"],

		// Restrict where forms can submit. The contact form uses a SvelteKit server
		// action (same-origin POST) so 'self' is sufficient. If you proxy the form
		// submission to an external endpoint (Postmark inbound, Formspree, n8n webhook),
		// add that origin here:
		//   'form-action': ["'self'", 'https://api.postmarkapp.com'],
		//   'form-action': ["'self'", 'https://your-n8n.example.com'],
		'form-action': ["'self'"],

		// Prevent base-tag injection attacks.
		'base-uri': ["'self'"]
	};

	if (isAdmin) {
		// /admin loads Sveltia CMS from unpkg.com. The bundle is a UMD IIFE that
		// may use eval() for dynamic features. These exceptions are scoped to /admin
		// only; the public site uses the default restrictive script-src.
		// See ADR-019 for rationale.
		base['script-src'] = [
			"'self'",
			'https://unpkg.com',
			"'unsafe-inline'",
			"'unsafe-eval'"
		];
		base['connect-src'] = [
			"'self'",
			'https://api.github.com',
			'https://unpkg.com'
		];
	} else {
		// Public pages: only same-origin scripts.
		// Add external script hosts here when activating analytics:
		//   base['script-src'] = ["'self'", 'https://plausible.io'];
		base['script-src'] = ["'self'"];
	}

	return base;
}

function serializeDirectives(directives: CspDirectives): string {
	return Object.entries(directives)
		.map(([key, values]) => `${key} ${values.join(' ')}`)
		.join('; ');
}

/**
 * Build a CSP header value for the given request URL.
 * Returns a string suitable for the `Content-Security-Policy` header.
 */
export function buildCsp(url: URL): string {
	const isAdmin = url.pathname.startsWith('/admin');
	return serializeDirectives(buildDirectives(isAdmin));
}
