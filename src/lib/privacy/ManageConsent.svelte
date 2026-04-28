<script lang="ts">
	/**
	 * ManageConsent — consent preferences panel.
	 *
	 * NOT imported by default. Add to a privacy policy page or cookie settings section.
	 * Reads and writes the same 'consent-choice' key as ConsentBanner.svelte.
	 *
	 * See docs/modules/cookie-consent.md for full activation instructions.
	 */
	import { onMount } from 'svelte';
	import { updateConsent, ANALYTICS_ONLY_CONSENT, DEFAULT_CONSENT } from '$lib/analytics/consent';

	const STORAGE_KEY = 'consent-choice';

	let analyticsGranted = $state(false);
	let saveConfirmed = $state(false);

	onMount(() => {
		const choice = localStorage.getItem(STORAGE_KEY);
		analyticsGranted = choice === 'analytics';
	});

	function save() {
		if (analyticsGranted) {
			updateConsent(ANALYTICS_ONLY_CONSENT);
			localStorage.setItem(STORAGE_KEY, 'analytics');
		} else {
			updateConsent(DEFAULT_CONSENT);
			localStorage.setItem(STORAGE_KEY, 'denied');
		}
		saveConfirmed = true;
		setTimeout(() => (saveConfirmed = false), 2000);
	}
</script>

<div class="manage-consent">
	<h2>Cookie preferences</h2>

	<div class="consent-row">
		<div class="consent-row-info">
			<strong>Necessary</strong>
			<p>Required for the site to function. Cannot be disabled.</p>
		</div>
		<span class="consent-status">Always on</span>
	</div>

	<div class="consent-row">
		<div class="consent-row-info">
			<strong>Analytics</strong>
			<p>Helps us understand how the site is used. No advertising data is collected or shared.</p>
		</div>
		<label class="toggle" aria-label="Enable analytics cookies">
			<input type="checkbox" bind:checked={analyticsGranted} />
			<span class="toggle-track" aria-hidden="true"></span>
		</label>
	</div>

	<button class="btn btn-primary btn-sm" onclick={save}>
		{saveConfirmed ? 'Saved' : 'Save preferences'}
	</button>
</div>

<style>
	.manage-consent {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		max-inline-size: 40rem;
	}

	.consent-row {
		display: flex;
		align-items: flex-start;
		gap: var(--space-4);
		justify-content: space-between;
		padding-block: var(--space-4);
		border-block-end: 1px solid var(--border-subtle);
	}

	.consent-row-info p {
		margin: var(--space-1) 0 0;
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.consent-status {
		font-size: var(--text-sm);
		color: var(--text-muted);
		white-space: nowrap;
		padding-block-start: var(--space-1);
	}

	.toggle {
		display: flex;
		align-items: center;
		cursor: pointer;
		flex-shrink: 0;
	}

	.toggle input {
		position: absolute;
		opacity: 0;
		inline-size: 0;
		block-size: 0;
	}

	.toggle-track {
		display: inline-block;
		inline-size: 2.5rem;
		block-size: 1.375rem;
		background: var(--border-structural);
		border-radius: var(--radius-full);
		position: relative;
		transition: background var(--duration-fast) var(--ease-decel);
	}

	.toggle-track::after {
		content: '';
		position: absolute;
		inset-block-start: 0.1875rem;
		inset-inline-start: 0.1875rem;
		inline-size: 1rem;
		block-size: 1rem;
		background: white;
		border-radius: var(--radius-full);
		transition: transform var(--duration-fast) var(--ease-decel);
	}

	.toggle input:checked + .toggle-track {
		background: var(--brand-accent);
	}

	.toggle input:checked + .toggle-track::after {
		transform: translateX(1.125rem);
	}

	.toggle input:focus-visible + .toggle-track {
		outline: 2px solid var(--border-focus);
		outline-offset: 2px;
	}
</style>
