/**
 * Content Security Policy builder.
 *
 * Builds a per-request CSP string from static defaults, applying a more
 * permissive policy for the /admin route (Sveltia CMS loads from unpkg.com).
 *
 * Analytics extension: when PUBLIC_ANALYTICS_ENABLED=true, GTM and GA4 hosts
 * are automatically added to script-src, connect-src, and img-src. When
 * PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN is set, Cloudflare Analytics hosts
 * are added to script-src and connect-src.
 *
 * Extension points are documented inline. To widen a directive for a specific
 * project feature, edit the relevant array below. See ADR-019.
 */

type CspDirectives = Record<string, string[]>;

// Read analytics env vars directly — this module runs server-side only.
// Analytics is off by default; CSP widens automatically when enabled.
const analyticsEnabled = process.env.PUBLIC_ANALYTICS_ENABLED === 'true';
const cfAnalyticsEnabled =
	analyticsEnabled && Boolean(process.env.PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN);

function buildDirectives(isAdmin: boolean): CspDirectives {
	const base: CspDirectives = {
		// Catch-all for unlisted fetch types.
		'default-src': ["'self'"],

		// Images: allow data URIs for inline base64 images.
		// GA4 uses a pixel endpoint for some measurement — added when analytics is on.
		// Add external CDN origins here when using a CMS media CDN or image host:
		//   'img-src': ["'self'", 'data:', 'https://cdn.example.com'],
		'img-src': [
			"'self'",
			'data:',
			...(analyticsEnabled ? ['https://www.google-analytics.com'] : []),
		],

		// 'unsafe-inline' is required because SvelteKit injects styles as inline
		// style attributes during SSR. Nonce upgrade is deferred indefinitely
		// per ADR-018 §"Out of Scope" — commit fully or stay on 'unsafe-inline'.
		'style-src': ["'self'", "'unsafe-inline'"],

		// Connect (fetch, XHR, WebSocket). Analytics hosts added when enabled.
		// Forms module: the contact form submits to same-origin SvelteKit actions —
		// no external connect-src is required. If you add a client-side fetch to an
		// external API (e.g. n8n, Postmark), add its origin here:
		//   'connect-src': ["'self'", 'https://api.postmarkapp.com'],
		//   'connect-src': ["'self'", 'https://your-n8n.example.com'],
		'connect-src': [
			"'self'",
			...(analyticsEnabled
				? [
						'https://www.google-analytics.com',
						'https://analytics.google.com',
						'https://www.googletagmanager.com',
					]
				: []),
			...(cfAnalyticsEnabled ? ['https://cloudflareinsights.com'] : []),
		],

		// GTM noscript fallback: AnalyticsBody.svelte renders a <noscript><iframe
		// src="https://www.googletagmanager.com/ns.html"> for JS-disabled clients.
		// Without an explicit frame-src the directive falls back to default-src:'self',
		// which blocks the iframe. frame-ancestors is a separate directive (it controls
		// who may embed THIS page — unrelated to outbound frames).
		'frame-src': [...(analyticsEnabled ? ['https://www.googletagmanager.com'] : ["'none'"])],

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
		'base-uri': ["'self'"],
	};

	if (isAdmin) {
		// /admin loads the self-hosted Sveltia bundle from /admin/sveltia/. The
		// bundle is vendored from node_modules/@sveltia/cms by scripts/vendor-sveltia.ts.
		// 'unsafe-inline' stays because Sveltia attaches inline styles at runtime.
		// unpkg.com and 'unsafe-eval' were dropped after self-hosting — re-add
		// 'unsafe-eval' here only if a future Sveltia bundle reintroduces eval()
		// usage. https://api.github.com is kept so the editor can commit content.
		base['script-src'] = ["'self'", "'unsafe-inline'"];
		base['connect-src'] = ["'self'", 'https://api.github.com'];
	} else {
		// Public pages: GTM and Cloudflare script hosts added when analytics is enabled.
		base['script-src'] = [
			"'self'",
			...(analyticsEnabled ? ['https://www.googletagmanager.com'] : []),
			...(cfAnalyticsEnabled ? ['https://static.cloudflareinsights.com'] : []),
		];
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
