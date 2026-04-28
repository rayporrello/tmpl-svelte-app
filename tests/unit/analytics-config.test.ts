/**
 * Tests for src/lib/analytics/config.ts
 *
 * The buildAnalyticsConfig factory is tested with plain objects so the
 * SvelteKit $env virtual module is never required.
 */

import { describe, it, expect } from 'vitest';
import { buildAnalyticsConfig } from '$lib/analytics/config';

describe('buildAnalyticsConfig()', () => {
	it('returns disabled config when PUBLIC_ANALYTICS_ENABLED is absent', () => {
		const config = buildAnalyticsConfig({});
		expect(config.enabled).toBe(false);
		expect(config.gtmId).toBeNull();
		expect(config.ga4MeasurementId).toBeNull();
		expect(config.cloudflareToken).toBeNull();
		expect(config.stagingOverride).toBe(false);
	});

	it('returns disabled config when PUBLIC_ANALYTICS_ENABLED is "false"', () => {
		const config = buildAnalyticsConfig({ PUBLIC_ANALYTICS_ENABLED: 'false' });
		expect(config.enabled).toBe(false);
	});

	it('returns enabled config when PUBLIC_ANALYTICS_ENABLED is "true"', () => {
		const config = buildAnalyticsConfig({
			PUBLIC_ANALYTICS_ENABLED: 'true',
			PUBLIC_GTM_ID: 'GTM-ABCDEFG',
		});
		expect(config.enabled).toBe(true);
		expect(config.gtmId).toBe('GTM-ABCDEFG');
	});

	it('returns null GTM ID when analytics is disabled even if GTM env is set', () => {
		const config = buildAnalyticsConfig({
			PUBLIC_ANALYTICS_ENABLED: 'false',
			PUBLIC_GTM_ID: 'GTM-ABCDEFG',
		});
		expect(config.gtmId).toBeNull();
	});

	it('returns null GTM ID when analytics is enabled but PUBLIC_GTM_ID is empty', () => {
		const config = buildAnalyticsConfig({
			PUBLIC_ANALYTICS_ENABLED: 'true',
			PUBLIC_GTM_ID: '',
		});
		expect(config.gtmId).toBeNull();
	});

	it('populates ga4MeasurementId when analytics is enabled', () => {
		const config = buildAnalyticsConfig({
			PUBLIC_ANALYTICS_ENABLED: 'true',
			PUBLIC_GA4_MEASUREMENT_ID: 'G-XXXXXXXXXX',
		});
		expect(config.ga4MeasurementId).toBe('G-XXXXXXXXXX');
	});

	it('returns null ga4MeasurementId when analytics is disabled', () => {
		const config = buildAnalyticsConfig({
			PUBLIC_ANALYTICS_ENABLED: 'false',
			PUBLIC_GA4_MEASUREMENT_ID: 'G-XXXXXXXXXX',
		});
		expect(config.ga4MeasurementId).toBeNull();
	});

	it('populates cloudflareToken when analytics is enabled', () => {
		const config = buildAnalyticsConfig({
			PUBLIC_ANALYTICS_ENABLED: 'true',
			PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN: 'cf-token-abc123',
		});
		expect(config.cloudflareToken).toBe('cf-token-abc123');
	});

	it('returns null cloudflareToken when analytics is disabled', () => {
		const config = buildAnalyticsConfig({
			PUBLIC_ANALYTICS_ENABLED: 'false',
			PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN: 'cf-token-abc123',
		});
		expect(config.cloudflareToken).toBeNull();
	});

	it('reads stagingOverride independently of analytics enabled', () => {
		const config = buildAnalyticsConfig({
			PUBLIC_ANALYTICS_ENABLED: 'false',
			PUBLIC_ANALYTICS_STAGING_OVERRIDE: 'true',
		});
		expect(config.stagingOverride).toBe(true);
	});

	it('stagingOverride is false when PUBLIC_ANALYTICS_STAGING_OVERRIDE is absent', () => {
		const config = buildAnalyticsConfig({ PUBLIC_ANALYTICS_ENABLED: 'true' });
		expect(config.stagingOverride).toBe(false);
	});
});
