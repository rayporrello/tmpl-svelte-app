/**
 * Tests for src/lib/analytics/attribution.client.ts
 *
 * Tests only the pure URL parsing function — localStorage-dependent functions
 * require a browser environment and are not covered in unit tests.
 */

import { describe, it, expect } from 'vitest';
import { extractAttributionFromUrl } from '$lib/analytics/attribution.client';

describe('extractAttributionFromUrl()', () => {
	it('returns an empty object for a URL with no tracking params', () => {
		expect(extractAttributionFromUrl('')).toEqual({});
		expect(extractAttributionFromUrl('?foo=bar')).toEqual({});
		expect(extractAttributionFromUrl('?page=2')).toEqual({});
	});

	it('extracts utm_source', () => {
		const result = extractAttributionFromUrl('?utm_source=google');
		expect(result.utm_source).toBe('google');
	});

	it('extracts all UTM parameters', () => {
		const result = extractAttributionFromUrl(
			'?utm_source=google&utm_medium=cpc&utm_campaign=brand&utm_term=widget&utm_content=banner'
		);
		expect(result.utm_source).toBe('google');
		expect(result.utm_medium).toBe('cpc');
		expect(result.utm_campaign).toBe('brand');
		expect(result.utm_term).toBe('widget');
		expect(result.utm_content).toBe('banner');
	});

	it('extracts gclid (Google Ads click ID)', () => {
		const result = extractAttributionFromUrl('?gclid=TeSterCLiD123');
		expect(result.gclid).toBe('TeSterCLiD123');
	});

	it('extracts fbclid (Meta click ID)', () => {
		const result = extractAttributionFromUrl('?fbclid=fb_click_abc');
		expect(result.fbclid).toBe('fb_click_abc');
	});

	it('extracts msclkid (Microsoft Ads click ID)', () => {
		const result = extractAttributionFromUrl('?msclkid=ms_click_xyz');
		expect(result.msclkid).toBe('ms_click_xyz');
	});

	it('extracts gbraid and wbraid', () => {
		const result = extractAttributionFromUrl('?gbraid=gbr123&wbraid=wbr456');
		expect(result.gbraid).toBe('gbr123');
		expect(result.wbraid).toBe('wbr456');
	});

	it('ignores non-tracked query params', () => {
		const result = extractAttributionFromUrl(
			'?utm_source=email&ref=newsletter&sessionid=abc&page=2'
		);
		expect(result.utm_source).toBe('email');
		expect(Object.keys(result)).toEqual(['utm_source']);
	});

	it('handles mixed tracked and non-tracked params', () => {
		const result = extractAttributionFromUrl(
			'?utm_source=linkedin&utm_medium=social&foo=bar&baz=qux'
		);
		expect(result.utm_source).toBe('linkedin');
		expect(result.utm_medium).toBe('social');
		expect(Object.keys(result)).toHaveLength(2);
	});

	it('does not include keys for absent params', () => {
		const result = extractAttributionFromUrl('?utm_source=newsletter');
		expect('utm_medium' in result).toBe(false);
		expect('gclid' in result).toBe(false);
	});
});
