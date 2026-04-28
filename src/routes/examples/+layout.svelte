<script lang="ts">
	import { page } from '$app/state';

	let { children } = $props();

	const isIndex = $derived(page.url.pathname === '/examples');
</script>

<aside class="examples-banner" role="note" aria-label="Examples notice">
	<div class="container">
		<p>
			<strong>Example pattern.</strong> This page is a copyable starting point — not part of the
			real site. Every page under <code>/examples</code> is <code>noindex, nofollow</code>.
			{#if !isIndex}
				<a href="/examples">← All examples</a>
			{/if}
		</p>
	</div>
</aside>

{@render children()}

<style>
	.examples-banner {
		background: var(--surface-sunken);
		border-block-end: 1px solid var(--border-subtle);
		padding-block: var(--space-3);
		padding-inline: var(--gutter);
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.examples-banner .container {
		display: flex;
		flex-direction: column;
		max-width: var(--content-width);
		margin-inline: auto;
	}

	.examples-banner p {
		margin: 0;
	}

	.examples-banner code {
		font-family: var(--font-mono);
		font-size: 0.85em;
	}

	.examples-banner a {
		margin-inline-start: var(--space-2);
	}
</style>
