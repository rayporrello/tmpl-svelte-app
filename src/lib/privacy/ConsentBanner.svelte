<script lang="ts">
	/**
	 * ConsentBanner — dormant cookie consent banner.
	 *
	 * NOT imported by default. Activate by importing into your root +layout.svelte
	 * and placing it after <AnalyticsBody />.
	 *
	 * See docs/modules/cookie-consent.md for full activation instructions.
	 * See docs/analytics/consent-and-privacy.md for when you need a banner.
	 */
	import { onMount } from 'svelte';
	import {
		pushConsentDefaults,
		updateConsent,
		DEFAULT_CONSENT,
		ANALYTICS_ONLY_CONSENT,
	} from '$lib/analytics/consent';

	const STORAGE_KEY = 'consent-choice';

	let visible = $state(false);

	onMount(() => {
		// Push denied defaults before evaluating any prior consent choice.
		// This ensures GTM sees a denied default state before any tag fires.
		pushConsentDefaults(DEFAULT_CONSENT);

		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved === 'analytics') {
			updateConsent(ANALYTICS_ONLY_CONSENT);
		} else if (saved === 'denied') {
			// Defaults already pushed above — no further update needed.
		} else {
			// No prior choice — show the banner.
			visible = true;
		}
	});

	function accept() {
		updateConsent(ANALYTICS_ONLY_CONSENT);
		localStorage.setItem(STORAGE_KEY, 'analytics');
		visible = false;
	}

	function decline() {
		// Keep defaults (all denied). Persist the choice so the banner does not reappear.
		localStorage.setItem(STORAGE_KEY, 'denied');
		visible = false;
	}
</script>

{#if visible}
	<div class="consent-banner" role="region" aria-label="Cookie consent">
		<p class="consent-message">
			We use analytics to understand how this site is used. No advertising cookies are set.
			<a href="/privacy">Privacy policy</a>.
		</p>
		<div class="consent-actions">
			<button class="btn btn-primary btn-sm" onclick={accept}>Accept analytics</button>
			<button class="btn btn-ghost btn-sm" onclick={decline}>Decline</button>
		</div>
	</div>
{/if}

<style>
	.consent-banner {
		position: fixed;
		inset-block-end: var(--space-4);
		inset-inline: var(--space-4);
		max-inline-size: 36rem;
		margin-inline: auto;
		padding: var(--space-4) var(--space-5);
		background: var(--surface-raised);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		z-index: var(--z-toast);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.consent-message {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.consent-actions {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
</style>
