<script lang="ts">
	/**
	 * AnalyticsHead — injects GTM and Cloudflare Web Analytics scripts into <head>.
	 *
	 * Add this component once in your root +layout.svelte. It self-gates on env vars:
	 * no scripts are injected when analytics is disabled or IDs are missing.
	 *
	 * IMPORTANT: GA4 is configured INSIDE the GTM container, not through a direct
	 * gtag snippet here. The template default is GTM → GA4. Do not add a direct
	 * GA4 gtag script unless you have a documented reason to bypass GTM.
	 *
	 * Consent Mode: If your project requires consent banners, push consent defaults
	 * to dataLayer BEFORE GTM loads. Use pushConsentDefaults() from consent.ts.
	 * See docs/analytics/consent-and-privacy.md.
	 */
	import { env } from '$env/dynamic/public';
	import { buildAnalyticsConfig } from '$lib/analytics/config';
	import { onMount } from 'svelte';
	import { initDataLayer } from '$lib/analytics/browser';
	import { captureAttribution } from '$lib/analytics/attribution.client';
	import { initPageTracking } from '$lib/analytics/pageview';

	const config = buildAnalyticsConfig(env);

	// Sanitize IDs — strip anything that isn't alphanumeric, hyphen, or dash.
	// GTM IDs are GTM-XXXXXXX; GA4 IDs are G-XXXXXXXXXX. These are server env
	// vars (not user input) but we sanitize defensively before injecting into HTML.
	function sanitizeId(id: string | null): string | null {
		if (!id) return null;
		return /^[\w-]+$/.test(id) ? id : null;
	}

	const gtmId = sanitizeId(config.gtmId);
	const cfToken = sanitizeId(config.cloudflareToken);

	// GTM head snippet — executes synchronously before other scripts load.
	// This initializes dataLayer and begins loading the GTM container script.
	// GA4 configuration lives inside the GTM container, not here.
	const gtmHeadScript = gtmId
		? `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`
		: null;

	// Cloudflare Web Analytics — privacy-first, cookie-free sanity layer.
	// This does NOT replace GTM/GA4 for conversion/ad attribution.
	// See docs/analytics/cloudflare-web-analytics.md.
	const cfScript = cfToken
		? `(function(){var script=document.createElement('script');script.defer=true;script.src='https://static.cloudflareinsights.com/beacon.min.js';script.setAttribute('data-cf-beacon','{"token":"${cfToken}"}');document.head.appendChild(script);})();`
		: null;

	onMount(() => {
		if (!config.enabled) return;

		// Initialize dataLayer early so pushes before GTM loads are queued.
		initDataLayer();

		// Capture first-touch attribution from URL params.
		captureAttribution();

		// Wire SvelteKit navigation → dataLayer page_view events.
		initPageTracking();
	});
</script>

<svelte:head>
	{#if config.enabled && gtmId && gtmHeadScript}
		<!-- Google Tag Manager head snippet. GA4 is configured inside GTM — no direct gtag here. -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags, no-useless-escape -- GTM ID is a server env var validated in check-analytics; <\/script> escape required -->
		{@html `<script>${gtmHeadScript}<\/script>`}
	{/if}

	{#if config.enabled && cfToken && cfScript}
		<!-- Cloudflare Web Analytics — privacy-first sanity layer, not ad attribution. -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags, no-useless-escape -- CF token is a server env var; <\/script> escape required -->
		{@html `<script>${cfScript}<\/script>`}
	{/if}
</svelte:head>
