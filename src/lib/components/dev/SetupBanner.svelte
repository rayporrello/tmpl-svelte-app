<script lang="ts">
	type SetupWarning = {
		id: string;
		label: string;
		severity: string;
		fixHint: string;
	};

	let { warnings }: { warnings: SetupWarning[] } = $props();

	const setupBannerStorageKey = 'tmpl-svelte-app:dev-setup-banner-dismissed';
	let dismissed = $state(false);

	if (typeof sessionStorage !== 'undefined') {
		dismissed = sessionStorage.getItem(setupBannerStorageKey) === '1';
	}

	function dismiss() {
		dismissed = true;
		sessionStorage.setItem(setupBannerStorageKey, '1');
	}
</script>

{#if !dismissed}
	<aside class="setup-banner" aria-labelledby="setup-banner-title">
		<header class="setup-banner-header">
			<h2 id="setup-banner-title">Setup mode</h2>
			<button type="button" class="setup-banner-dismiss" onclick={dismiss}>Dismiss</button>
		</header>
		<ul class="setup-banner-list">
			{#each warnings as warning (warning.id)}
				<li>
					<strong>{warning.id}</strong>
					<span>{warning.label}</span>
				</li>
			{/each}
		</ul>
	</aside>
{/if}

<style>
	.setup-banner {
		position: fixed;
		inset-block-end: var(--space-4);
		inset-inline: var(--space-4);
		z-index: var(--z-toast);
		display: grid;
		gap: var(--space-3);
		max-inline-size: var(--content-narrow);
		padding-block: var(--space-4);
		padding-inline: var(--space-4);
		background: var(--surface-raised);
		color: var(--text-primary);
		border: 1px solid var(--border-default);
		border-inline-start: var(--space-1) solid var(--color-warning);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
	}

	.setup-banner-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
	}

	.setup-banner h2 {
		font-size: var(--text-base);
		line-height: var(--leading-tight);
	}

	.setup-banner-dismiss {
		min-height: 44px;
		padding-block: var(--space-2);
		padding-inline: var(--space-3);
		color: var(--text-primary);
		background: var(--surface-sunken);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
	}

	.setup-banner-dismiss:hover {
		background: var(--state-hover-bg);
	}

	.setup-banner-dismiss:focus-visible {
		outline: 2px solid var(--border-focus);
		outline-offset: 2px;
	}

	.setup-banner-list {
		display: grid;
		gap: var(--space-2);
		padding: 0;
		margin: 0;
		list-style: none;
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.setup-banner-list li {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.setup-banner-list strong {
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
	}
</style>
