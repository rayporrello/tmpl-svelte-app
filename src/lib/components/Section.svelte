<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		class?: string;
		id?: string;
		width?: 'default' | 'narrow' | 'wide' | 'full';
		children: Snippet;
	}

	let { class: className, id, width = 'default', children }: Props = $props();

	const containerMap = {
		default: 'container',
		narrow: 'container container--narrow',
		wide: 'container container--wide',
		full: 'container container--full',
	} as const;
</script>

<section {id} class={className}>
	<div class={containerMap[width]}>
		{@render children()}
	</div>
</section>
