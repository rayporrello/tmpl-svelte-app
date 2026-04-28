/**
 * Analytics configuration validation script.
 *
 * Runs at validate (PR-grade) and validate:launch (release-grade).
 * Does NOT make external network requests — purely config/structural.
 *
 * Fails if:
 *   - PUBLIC_ANALYTICS_ENABLED=true and PUBLIC_GTM_ID is missing
 *   - PUBLIC_GTM_ID is set but does not match GTM-XXXX format
 *   - PUBLIC_GA4_MEASUREMENT_ID is set but does not match G-XXXX format
 *   - PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN looks clearly malformed when enabled
 *   - Analytics is enabled for localhost/example domains without staging override
 *   - docs/analytics/README.md is missing
 *   - docs/analytics/client-onboarding-checklist.md is missing
 *   - docs/analytics/launch-checklist.md is missing
 *
 * Warns (non-blocking) if:
 *   - ANALYTICS_SERVER_EVENTS_ENABLED=true but GA4_MEASUREMENT_ID or API secret missing
 *     (a custom provider may not need these vars — warning only, not a failure)
 *   - Cloudflare token exists but GTM ID does not
 *   - GA4 measurement ID exists but GTM ID does not (GA4 without GTM is unusual)
 *
 * Run: bun run check:analytics
 */

import { existsSync } from 'fs';

const errors: string[] = [];
const warnings: string[] = [];

// ── Read analytics env vars ───────────────────────────────────────────────────

const analyticsEnabled = process.env.PUBLIC_ANALYTICS_ENABLED === 'true';
const gtmId = process.env.PUBLIC_GTM_ID ?? '';
const ga4Id = process.env.PUBLIC_GA4_MEASUREMENT_ID ?? '';
const cfToken = process.env.PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN ?? '';
const stagingOverride = process.env.PUBLIC_ANALYTICS_STAGING_OVERRIDE === 'true';
const serverEventsEnabled = process.env.ANALYTICS_SERVER_EVENTS_ENABLED === 'true';
const ga4MpMeasurementId = process.env.GA4_MEASUREMENT_ID ?? '';
const ga4ApiSecret = process.env.GA4_MEASUREMENT_PROTOCOL_API_SECRET ?? '';
const siteUrl = process.env.PUBLIC_SITE_URL ?? process.env.ORIGIN ?? '';

// ── Format validators ─────────────────────────────────────────────────────────

function isValidGtmId(id: string): boolean {
	return /^GTM-[A-Z0-9]+$/.test(id);
}

function isValidGa4Id(id: string): boolean {
	return /^G-[A-Z0-9]+$/.test(id);
}

function isLocalOrStagingDomain(url: string): boolean {
	if (!url) return false;
	try {
		const parsed = new URL(url);
		const h = parsed.hostname;
		return (
			h === 'localhost' ||
			h === '127.0.0.1' ||
			h === '0.0.0.0' ||
			h.endsWith('.local') ||
			h.includes('example.com') ||
			h.includes('staging') ||
			h.includes('preview') ||
			h.includes('dev.')
		);
	} catch {
		return false;
	}
}

// ── Checks ────────────────────────────────────────────────────────────────────

// 1. When analytics is enabled, GTM ID must be present and valid.
if (analyticsEnabled) {
	if (!gtmId) {
		errors.push(
			'PUBLIC_ANALYTICS_ENABLED=true but PUBLIC_GTM_ID is not set. ' +
				'Set your GTM web container ID (e.g. GTM-XXXXXXX).'
		);
	} else if (!isValidGtmId(gtmId)) {
		errors.push(
			`PUBLIC_GTM_ID "${gtmId}" does not match the expected format GTM-XXXX. ` +
				'Check your GTM container ID in the GTM dashboard.'
		);
	}
}

// 2. GTM ID format check (even if analytics is not enabled — catches misconfiguration early).
if (gtmId && !isValidGtmId(gtmId)) {
	if (!analyticsEnabled) {
		warnings.push(`PUBLIC_GTM_ID "${gtmId}" does not match the expected format GTM-XXXX.`);
	}
}

// 3. GA4 measurement ID format check.
if (ga4Id && !isValidGa4Id(ga4Id)) {
	errors.push(
		`PUBLIC_GA4_MEASUREMENT_ID "${ga4Id}" does not match the expected format G-XXXX. ` +
			'Check your GA4 Measurement ID in the GA4 property settings.'
	);
}

// 4. Cloudflare token basic sanity (not empty/whitespace when claimed to be set).
if (cfToken && cfToken.trim().length < 10) {
	errors.push(
		`PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN appears malformed (too short). ` +
			'Check your token in the Cloudflare Web Analytics dashboard.'
	);
}

// 5. Analytics enabled on a staging/local domain without override.
if (analyticsEnabled && siteUrl && isLocalOrStagingDomain(siteUrl) && !stagingOverride) {
	errors.push(
		`Analytics is enabled (PUBLIC_ANALYTICS_ENABLED=true) but PUBLIC_SITE_URL looks like a ` +
			`staging or local domain ("${siteUrl}"). ` +
			'Set PUBLIC_ANALYTICS_ENABLED=false for staging/dev, or set ' +
			'PUBLIC_ANALYTICS_STAGING_OVERRIDE=true if this is intentional.'
	);
}

// 6. Server events enabled but GA4 MP vars missing (heuristic — only warns).
if (serverEventsEnabled && (!ga4MpMeasurementId || !ga4ApiSecret)) {
	warnings.push(
		'ANALYTICS_SERVER_EVENTS_ENABLED=true but GA4_MEASUREMENT_ID or ' +
			'GA4_MEASUREMENT_PROTOCOL_API_SECRET is not set. ' +
			'If you are using the GA4 MP provider, set both vars. ' +
			'If you are using a different provider, this warning is safe to ignore.'
	);
}

// 7. GA4 ID without GTM ID — unusual for the template default (GA4 goes through GTM).
if (ga4Id && !gtmId) {
	warnings.push(
		'PUBLIC_GA4_MEASUREMENT_ID is set but PUBLIC_GTM_ID is not. ' +
			'This template routes GA4 through GTM. If you intend to use GA4 directly, ' +
			'document why in your project CLAUDE.md.'
	);
}

// 8. Cloudflare token without GTM ID — valid but unusual.
if (cfToken && !gtmId) {
	warnings.push(
		'PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN is set but PUBLIC_GTM_ID is not. ' +
			'Cloudflare Web Analytics is a sanity layer — consider also setting up GTM/GA4 ' +
			'for conversion tracking.'
	);
}

// 9. Required docs must exist.
const requiredDocs = [
	'docs/analytics/README.md',
	'docs/analytics/client-onboarding-checklist.md',
	'docs/analytics/launch-checklist.md',
];

for (const docPath of requiredDocs) {
	if (!existsSync(docPath)) {
		errors.push(
			`Required analytics doc is missing: ${docPath}. ` +
				'Run the analytics setup from docs/analytics/README.md.'
		);
	}
}

// ── Report ────────────────────────────────────────────────────────────────────

if (warnings.length > 0) {
	console.warn('\nAnalytics Warnings:');
	for (const w of warnings) console.warn(`  ⚠  ${w}`);
}

if (errors.length > 0) {
	console.error('\ncheck:analytics failed:\n');
	for (const e of errors) console.error(`  ✗  ${e}`);
	console.error(
		`\n${errors.length} issue(s) found. See docs/analytics/README.md for setup instructions.\n`
	);
	process.exit(1);
} else {
	const status = analyticsEnabled ? 'enabled' : 'disabled (default)';
	console.log(
		`\n✓ check:analytics passed — analytics is ${status}.` +
			(warnings.length ? ` ${warnings.length} warning(s) above.` : '') +
			'\n'
	);
}
