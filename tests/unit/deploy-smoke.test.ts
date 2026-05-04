import { describe, expect, it } from 'vitest';

import { parseArgs, runDeploySmoke } from '../../scripts/deploy-smoke';
import {
	PERMISSIONS_POLICY,
	REFERRER_POLICY,
	STRICT_TRANSPORT_SECURITY,
	X_CONTENT_TYPE_OPTIONS,
	X_FRAME_OPTIONS,
} from '../../src/lib/server/security-headers';

function response(body: BodyInit, init: ResponseInit = {}): Response {
	return new Response(body, init);
}

function fakeFetch(routes: Record<string, Response>): typeof fetch {
	return (async (input: string | URL | Request) => {
		const url =
			typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
		const parsed = new URL(url);
		const route = routes[parsed.pathname];
		return route ?? response('missing', { status: 404 });
	}) as typeof fetch;
}

function securityHeaders(): Headers {
	return new Headers({
		'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'",
		'X-Content-Type-Options': X_CONTENT_TYPE_OPTIONS,
		'Referrer-Policy': REFERRER_POLICY,
		'X-Frame-Options': X_FRAME_OPTIONS,
		'Permissions-Policy': PERMISSIONS_POLICY,
		'Strict-Transport-Security': STRICT_TRANSPORT_SECURITY,
	});
}

describe('deploy smoke', () => {
	it('passes all URL-driven smoke checks', async () => {
		const fetcher = fakeFetch({
			'/': response('<h1>Home</h1>', { headers: securityHeaders() }),
			'/healthz': response(JSON.stringify({ ok: true })),
			'/readyz': response(JSON.stringify({ ok: true })),
			'/sitemap.xml': response('<?xml version="1.0"?><urlset></urlset>'),
			'/robots.txt': response('User-agent: *\nSitemap: https://example.com/sitemap.xml'),
			'/contact': response('<h1>Contact</h1><form></form>'),
		});

		const result = await runDeploySmoke({ baseUrl: 'https://example.com', fetcher });

		expect(result.exitCode).toBe(0);
		expect(result.results).not.toContainEqual(expect.objectContaining({ status: 'fail' }));
	});

	it('can skip readiness when the operator asks for a liveness-only smoke', async () => {
		const fetcher = fakeFetch({
			'/': response('<h1>Home</h1>', { headers: securityHeaders() }),
			'/healthz': response(JSON.stringify({ ok: true })),
			'/sitemap.xml': response('<?xml version="1.0"?><urlset></urlset>'),
			'/robots.txt': response('User-agent: *\nSitemap: https://example.com/sitemap.xml'),
			'/contact': response('<h1>Contact</h1><form></form>'),
		});

		const result = await runDeploySmoke({
			baseUrl: 'https://example.com',
			fetcher,
			skipReadyz: true,
		});

		expect(result.exitCode).toBe(0);
		expect(result.results).toContainEqual(
			expect.objectContaining({ id: 'SMOKE-READY-001', status: 'skip' })
		);
	});

	it('requires a URL from args or environment', () => {
		expect(() => parseArgs([], {})).toThrow(/Missing URL/u);
		expect(parseArgs(['--url', 'https://example.com'], {})).toMatchObject({
			baseUrl: 'https://example.com',
		});
	});
});
