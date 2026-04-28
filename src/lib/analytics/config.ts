/**
 * Analytics configuration — reads PUBLIC_* env vars via SvelteKit's dynamic public env.
 *
 * Import from Svelte components or server-side modules. The build-time factory
 * `buildAnalyticsConfig` is exported separately so unit tests can pass a plain
 * object without needing SvelteKit's virtual env module.
 *
 * Rules:
 *   - Analytics is disabled unless PUBLIC_ANALYTICS_ENABLED === 'true'.
 *   - GTM script is only injected when analytics is enabled AND PUBLIC_GTM_ID is set.
 *   - Cloudflare Web Analytics is only injected when analytics is enabled AND
 *     PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN is set.
 *   - Staging/preview analytics is disabled unless PUBLIC_ANALYTICS_STAGING_OVERRIDE === 'true'.
 */

export interface AnalyticsConfig {
	/** Master on/off switch. False by default — must be explicitly enabled. */
	enabled: boolean;
	/** GTM web container ID (e.g. GTM-XXXXXXX). Null means GTM is not injected. */
	gtmId: string | null;
	/** GA4 Measurement ID (e.g. G-XXXXXXXXXX). Informational — GA4 is configured inside GTM. */
	ga4MeasurementId: string | null;
	/** Cloudflare Web Analytics token. Null means CF script is not injected. */
	cloudflareToken: string | null;
	/** Explicit staging override — allows analytics in non-production environments. */
	stagingOverride: boolean;
}

/** Shape expected by buildAnalyticsConfig — accepts any object with PUBLIC_* keys. */
export interface PublicEnvShape {
	PUBLIC_ANALYTICS_ENABLED?: string;
	PUBLIC_GTM_ID?: string;
	PUBLIC_GA4_MEASUREMENT_ID?: string;
	PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN?: string;
	PUBLIC_ANALYTICS_STAGING_OVERRIDE?: string;
	[key: string]: string | undefined;
}

/**
 * Build an AnalyticsConfig from raw env vars. Exported for unit testing — pass
 * a plain object instead of the SvelteKit virtual env module.
 */
export function buildAnalyticsConfig(publicEnv: PublicEnvShape): AnalyticsConfig {
	const enabled = publicEnv.PUBLIC_ANALYTICS_ENABLED === 'true';
	const stagingOverride = publicEnv.PUBLIC_ANALYTICS_STAGING_OVERRIDE === 'true';

	return {
		enabled,
		gtmId: enabled && publicEnv.PUBLIC_GTM_ID ? publicEnv.PUBLIC_GTM_ID : null,
		ga4MeasurementId:
			enabled && publicEnv.PUBLIC_GA4_MEASUREMENT_ID ? publicEnv.PUBLIC_GA4_MEASUREMENT_ID : null,
		cloudflareToken:
			enabled && publicEnv.PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN
				? publicEnv.PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN
				: null,
		stagingOverride,
	};
}
