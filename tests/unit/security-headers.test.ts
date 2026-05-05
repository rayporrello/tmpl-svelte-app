import { describe, expect, it } from 'vitest';

import { evaluateSecurityHeaders } from '../../scripts/check-security-headers';
import {
	NO_STORE_CACHE_CONTROL,
	STRICT_TRANSPORT_SECURITY,
	applySecurityHeaders,
} from '../../src/lib/server/security-headers';

describe('security header policy', () => {
	it('passes the built-in scenarios', () => {
		const results = evaluateSecurityHeaders();
		expect(results).not.toContainEqual(expect.objectContaining({ status: 'fail' }));
	});

	it('sets HSTS only for HTTPS and no-store only for sensitive/admin or form results', () => {
		const publicHttp = new Headers();
		applySecurityHeaders(publicHttp, new URL('http://127.0.0.1:3000/'));
		expect(publicHttp.get('Strict-Transport-Security')).toBeNull();
		expect(publicHttp.get('Cache-Control')).toBeNull();

		const adminHttps = new Headers();
		applySecurityHeaders(adminHttps, new URL('https://example.com/admin/index.html'));
		expect(adminHttps.get('Strict-Transport-Security')).toBe(STRICT_TRANSPORT_SECURITY);
		expect(adminHttps.get('Cache-Control')).toBe(NO_STORE_CACHE_CONTROL);
		const adminCsp = adminHttps.get('Content-Security-Policy') ?? '';
		expect(adminCsp).toContain('https://api.github.com');
		expect(adminCsp).not.toContain('https://unpkg.com');
		expect(adminCsp).not.toContain("'unsafe-eval'");

		const contactPost = new Headers();
		applySecurityHeaders(contactPost, new URL('https://example.com/contact'), { method: 'POST' });
		expect(contactPost.get('Cache-Control')).toBe(NO_STORE_CACHE_CONTROL);
	});
});
