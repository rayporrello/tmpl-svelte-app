<script lang="ts">
	/**
	 * AnalyticsBody — GTM noscript fallback iframe.
	 *
	 * Google Tag Manager's full spec places the noscript <iframe> immediately after
	 * the opening <body> tag. SvelteKit renders its layout content inside <body>
	 * after the framework's own initialization, so perfect placement is not possible
	 * without server-side body injection.
	 *
	 * This component places the noscript iframe as close to <body> as the root
	 * layout allows. For the majority of users (JavaScript enabled), the head script
	 * from AnalyticsHead handles GTM. This noscript path affects only users who have
	 * JS disabled — a small minority unlikely to be measured by any analytics tool.
	 *
	 * Render this component as the FIRST element in your root +layout.svelte body,
	 * before the site header and main content.
	 *
	 * No scripts are injected when analytics is disabled or GTM ID is missing.
	 */
	import { env } from '$env/dynamic/public';
	import { buildAnalyticsConfig } from '$lib/analytics/config';

	const config = buildAnalyticsConfig(env);

	function sanitizeId(id: string | null): string | null {
		if (!id) return null;
		return /^[\w-]+$/.test(id) ? id : null;
	}

	const gtmId = sanitizeId(config.gtmId);
</script>

{#if config.enabled && gtmId}
	<!-- GTM noscript fallback — ideally after <body>, placed here as the closest safe location. -->
	<noscript>
		<iframe
			src="https://www.googletagmanager.com/ns.html?id={gtmId}"
			height="0"
			width="0"
			style="display:none;visibility:hidden"
			title="Google Tag Manager"
		></iframe>
	</noscript>
{/if}
